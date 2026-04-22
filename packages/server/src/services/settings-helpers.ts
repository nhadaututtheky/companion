/**
 * Shared helpers for reading settings from DB.
 * Used by ai-client, license, session-namer, etc.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";

/** Get a single setting value from DB, or undefined if not found. */
export function getSetting(key: string): string | undefined {
  try {
    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value || undefined;
  } catch {
    return undefined;
  }
}

/** Get a setting as number, with fallback default. */
export function getSettingInt(key: string, fallback: number): number {
  const val = getSetting(key);
  if (!val) return fallback;
  const num = parseInt(val, 10);
  return isNaN(num) ? fallback : num;
}

/** Get a setting as boolean (true if value is "true"). */
export function getSettingBool(key: string, fallback: boolean): boolean {
  const val = getSetting(key);
  if (val === undefined) return fallback;
  return val === "true";
}

/**
 * Get a setting as a float number with fallback. Used by the per-account
 * quota thresholds (`accounts.warnThreshold`, `accounts.switchThreshold`).
 * Returns `fallback` on NaN / missing / non-numeric — never throws.
 */
export function getSettingNumber(key: string, fallback: number): number {
  const val = getSetting(key);
  if (val === undefined) return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Upsert a single setting value. Silently no-ops if the DB is unavailable
 * — we never want config-persistence to crash a caller.
 */
export function setSetting(key: string, value: string): void {
  try {
    const db = getDb();
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    const now = new Date();
    if (existing) {
      db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value, updatedAt: now }).run();
    }
  } catch {
    // swallow — settings persistence is best-effort
  }
}

/** Delete a setting; no-op if missing or DB unavailable. */
export function deleteSetting(key: string): void {
  try {
    const db = getDb();
    db.delete(settings).where(eq(settings.key, key)).run();
  } catch {
    // swallow
  }
}
