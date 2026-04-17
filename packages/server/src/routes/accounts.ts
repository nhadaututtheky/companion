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
} from "../services/credential-manager.js";
import { manualCapture } from "../services/credential-watcher.js";
import { getAccountUsage } from "../services/account-usage.js";
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

// Save/upsert account
accountRoutes.post("/", zValidator("json", saveAccountSchema), (c) => {
  const { label, credentials } = c.req.valid("json");
  const id = saveAccount(label, credentials);
  return c.json({ success: true, data: { id } } satisfies ApiResponse, 201);
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

// Per-account usage (heatmap + windows + model breakdown)
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
  return c.json({ success: true, data: usage } satisfies ApiResponse);
});

// Manual credential capture (re-read ~/.claude/.credentials.json)
accountRoutes.post("/capture", async (c) => {
  await manualCapture();
  return c.json({
    success: true,
    data: { captured: true },
  } satisfies ApiResponse);
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
