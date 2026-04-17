/**
 * Multi-Account Manager REST routes.
 * GET    /api/accounts         — list all accounts (no tokens)
 * GET    /api/accounts/active  — get active account
 * POST   /api/accounts         — save/upsert account { label, credentials }
 * PUT    /api/accounts/:id/activate — set account as active
 * PUT    /api/accounts/:id/rename   — rename account { label }
 * PUT    /api/accounts/:id/status   — update status { status, statusUntil? }
 * DELETE /api/accounts/:id     — delete account
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  saveAccount,
  listAccounts,
  getActiveAccount,
  switchAccount,
  deleteAccount,
  updateAccountStatus,
  renameAccount,
  accountExists,
  updateAccountBudgets,
  updateAccountSkipRotation,
  findNextReady,
} from "../services/credential-manager.js";
import { getDb } from "../db/client.js";
import { accounts, settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { manualCapture } from "../services/credential-watcher.js";
import { getAccountUsage } from "../services/account-usage.js";
import { getSettingBool } from "../services/settings-helpers.js";
import { AUTO_SWITCH_KEY } from "../services/account-auto-switch.js";
import type { ApiResponse } from "@companion/shared";

const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
  subscriptionType: z.string().optional(),
  rateLimitTier: z.string().optional(),
});

const saveAccountSchema = z.object({
  label: z.string().min(1).max(100),
  credentials: credentialsSchema,
});

const renameSchema = z.object({
  label: z.string().min(1).max(100),
});

const statusSchema = z.object({
  status: z.enum(["ready", "rate_limited", "expired", "error"]),
  statusUntil: z.number().optional(),
});

const budgetsSchema = z.object({
  session5hBudget: z.number().positive().max(100000).nullable(),
  weeklyBudget: z.number().positive().max(100000).nullable(),
  monthlyBudget: z.number().positive().max(100000).nullable(),
});

const skipRotationSchema = z.object({
  skip: z.boolean(),
});

const accountSettingsSchema = z.object({
  autoSwitchEnabled: z.boolean(),
});

/** Upsert a setting row. Keeps the existing convention used by routes/domain.ts. */
function setAccountSetting(key: string, value: string): void {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value, updatedAt: new Date() }).run();
  }
}

/**
 * Single-flight guard for manual switch-next. Prevents two concurrent callers
 * from racing on the same "active" snapshot and double-switching.
 */
let switchNextInFlight: Promise<{ id: string; label: string } | null> | null = null;

export const accountRoutes = new Hono();

// List all accounts (tokens redacted)
accountRoutes.get("/", (c) => {
  const items = listAccounts();
  return c.json({ success: true, data: items } satisfies ApiResponse);
});

// Get active account
accountRoutes.get("/active", (c) => {
  const active = getActiveAccount();
  return c.json({ success: true, data: active ?? null } satisfies ApiResponse);
});

// Get account manager settings (auto-switch toggle).
// Registered before any dynamic `/:id/...` routes to avoid router ambiguity.
accountRoutes.get("/settings", (c) => {
  return c.json({
    success: true,
    data: {
      autoSwitchEnabled: getSettingBool(AUTO_SWITCH_KEY, true),
    },
  } satisfies ApiResponse);
});

// Update account manager settings
accountRoutes.put("/settings", zValidator("json", accountSettingsSchema), (c) => {
  const { autoSwitchEnabled } = c.req.valid("json");
  setAccountSetting(AUTO_SWITCH_KEY, autoSwitchEnabled ? "true" : "false");
  return c.json({
    success: true,
    data: { autoSwitchEnabled },
  } satisfies ApiResponse);
});

// Save/upsert account
accountRoutes.post("/", zValidator("json", saveAccountSchema), (c) => {
  const { label, credentials } = c.req.valid("json");
  const id = saveAccount(label, credentials);
  return c.json({ success: true, data: { id } } satisfies ApiResponse, 201);
});

// Manual credential capture (re-read ~/.claude/.credentials.json).
// Static route — keep above dynamic /:id handlers.
accountRoutes.post("/capture", async (c) => {
  await manualCapture();
  return c.json({
    success: true,
    data: { captured: true },
  } satisfies ApiResponse);
});

// Manual "switch to next available" — picks LRU ready account that is not skipped.
// Falls back to skipped accounts only if no non-skipped ready account exists.
// Single-flight guard prevents concurrent callers from double-switching.
accountRoutes.post("/switch-next", async (c) => {
  if (!switchNextInFlight) {
    switchNextInFlight = (async () => {
      const active = getActiveAccount();
      let target = findNextReady(active?.id);
      if (!target) target = findNextReady(active?.id, true);
      if (!target) return null;
      const ok = await switchAccount(target.id);
      if (!ok) return null;
      return { id: target.id, label: target.label };
    })().finally(() => {
      switchNextInFlight = null;
    });
  }
  const result = await switchNextInFlight;
  if (!result) {
    return c.json(
      { success: false, error: "No ready account available" } satisfies ApiResponse,
      409,
    );
  }
  return c.json({ success: true, data: result } satisfies ApiResponse);
});

// Activate account (switches credentials file too)
accountRoutes.put("/:id/activate", async (c) => {
  const id = c.req.param("id");
  const ok = await switchAccount(id);
  if (!ok) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: { id } } satisfies ApiResponse);
});

// Rename account
accountRoutes.put("/:id/rename", zValidator("json", renameSchema), (c) => {
  const id = c.req.param("id");
  const { label } = c.req.valid("json");
  const ok = renameAccount(id, label);
  if (!ok) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: { id, label } } satisfies ApiResponse);
});

// Update account status
accountRoutes.put("/:id/status", zValidator("json", statusSchema), (c) => {
  const id = c.req.param("id");
  const { status, statusUntil } = c.req.valid("json");
  const until = statusUntil ? new Date(statusUntil) : undefined;
  const ok = updateAccountStatus(id, status, until);
  if (!ok) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: { id, status } } satisfies ApiResponse);
});

// Per-account usage (heatmap + windows + model breakdown + custom budgets)
accountRoutes.get("/:id/usage", (c) => {
  const id = c.req.param("id");
  if (!accountExists(id)) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  const daysParam = c.req.query("days");
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 365, 1), 730) : 365;
  const tzParam = c.req.query("tz");
  const tzOffsetMinutes = tzParam
    ? Math.min(Math.max(parseInt(tzParam, 10) || 0, -720), 840)
    : 0;
  const usage = getAccountUsage(id, days, { tzOffsetMinutes });

  const row = getDb()
    .select({
      session5hBudget: accounts.session5hBudget,
      weeklyBudget: accounts.weeklyBudget,
      monthlyBudget: accounts.monthlyBudget,
    })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  return c.json({
    success: true,
    data: {
      ...usage,
      budgets: {
        session5hBudget: row?.session5hBudget ?? null,
        weeklyBudget: row?.weeklyBudget ?? null,
        monthlyBudget: row?.monthlyBudget ?? null,
      },
    },
  } satisfies ApiResponse);
});

// Set custom budget limits for an account
accountRoutes.put("/:id/budgets", zValidator("json", budgetsSchema), (c) => {
  const id = c.req.param("id");
  const budgets = c.req.valid("json");
  const ok = updateAccountBudgets(id, budgets);
  if (!ok) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: { id, ...budgets } } satisfies ApiResponse);
});

// Toggle skip-in-rotation flag for an account
accountRoutes.put("/:id/skip-rotation", zValidator("json", skipRotationSchema), (c) => {
  const id = c.req.param("id");
  const { skip } = c.req.valid("json");
  const ok = updateAccountSkipRotation(id, skip);
  if (!ok) {
    return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
  }
  return c.json({ success: true, data: { id, skipInRotation: skip } } satisfies ApiResponse);
});

// Delete account
accountRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  try {
    const ok = deleteAccount(id);
    if (!ok) {
      return c.json({ success: false, error: "Account not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: true, data: null } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      { success: false, error: String((err as Error).message) } satisfies ApiResponse,
      400,
    );
  }
});
