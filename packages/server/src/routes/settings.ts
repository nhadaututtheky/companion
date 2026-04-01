/**
 * Key-value settings REST routes.
 * GET  /api/settings?prefix=  — list settings by optional prefix
 * GET  /api/settings/:key     — get single setting
 * PUT  /api/settings/:key     — upsert setting { value }
 * DELETE /api/settings/:key   — delete setting
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, like } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import type { ApiResponse } from "@companion/shared";

const upsertSchema = z.object({
  value: z.string(),
});

// Keys containing these patterns are masked in GET responses to prevent secret leakage
const SENSITIVE_KEY_PATTERNS = ["apikey", "token", "secret", "password", "bottoken"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[._-]/g, "");
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

function maskValue(key: string, value: string): string {
  if (!isSensitiveKey(key)) return value;
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}

export const settingsRoutes = new Hono();

// List settings — optional ?prefix= filter
settingsRoutes.get("/", (c) => {
  const prefix = c.req.query("prefix");
  const db = getDb();

  const rows = prefix
    ? db
        .select()
        .from(settings)
        .where(like(settings.key, `${prefix}%`))
        .all()
    : db.select().from(settings).all();

  const data: Record<string, string> = {};
  for (const row of rows) {
    data[row.key] = maskValue(row.key, row.value);
  }

  return c.json({ success: true, data } satisfies ApiResponse);
});

// Get single setting
settingsRoutes.get("/:key", (c) => {
  const key = c.req.param("key");
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();

  if (!row) {
    return c.json({ success: false, error: "Setting not found" } satisfies ApiResponse, 404);
  }

  return c.json({
    success: true,
    data: { key: row.key, value: maskValue(row.key, row.value) },
  } satisfies ApiResponse);
});

// Upsert setting
settingsRoutes.put("/:key", zValidator("json", upsertSchema), (c) => {
  const key = c.req.param("key");
  const { value } = c.req.valid("json");
  const db = getDb();

  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  if (existing) {
    db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value, updatedAt: new Date() }).run();
  }

  return c.json({ success: true, data: { key } } satisfies ApiResponse);
});

// Delete setting
settingsRoutes.delete("/:key", (c) => {
  const key = c.req.param("key");
  const db = getDb();
  db.delete(settings).where(eq(settings.key, key)).run();

  return c.json({ success: true } satisfies ApiResponse);
});
