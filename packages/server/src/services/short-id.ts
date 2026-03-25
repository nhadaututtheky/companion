/**
 * Short ID generator for sessions — memorable animal names for @mentions.
 *
 * Generates IDs like "fox", "bear", "owl". If all single names are taken
 * within the active pool, falls back to "red-fox", "swift-owl", etc.
 */

import { eq, and, desc, notInArray, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessions } from "../db/schema.js";
import type { SessionStatus } from "@companion/shared";

const ANIMALS = [
  "fox", "bear", "owl", "wolf", "hawk",
  "lynx", "crow", "deer", "hare", "seal",
  "wren", "pike", "crab", "moth", "wasp",
  "toad", "newt", "dove", "lark", "mole",
  "ibis", "kite", "swan", "orca", "puma",
] as const;

const ADJECTIVES = [
  "red", "blue", "swift", "calm", "bold",
  "dark", "pale", "keen", "warm", "wild",
  "grey", "iron", "jade", "gold", "sage",
] as const;

const TERMINAL_STATUSES: readonly SessionStatus[] = ["ended", "error"];

/**
 * Get all non-null short IDs in the DB.
 * Since we clear shortId on session end, this effectively returns only active IDs.
 */
function getTakenShortIds(): Set<string> {
  const db = getDb();
  const rows = db
    .select({ shortId: sessions.shortId })
    .from(sessions)
    .where(isNotNull(sessions.shortId))
    .all();

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.shortId) ids.add(row.shortId);
  }
  return ids;
}

/** Generate a unique short ID not currently used by any active session */
export function generateShortId(): string {
  const taken = getTakenShortIds();

  // Try single animal names first
  for (const animal of ANIMALS) {
    if (!taken.has(animal)) return animal;
  }

  // Fallback: adjective-animal combos
  for (const adj of ADJECTIVES) {
    for (const animal of ANIMALS) {
      const combo = `${adj}-${animal}`;
      if (!taken.has(combo)) return combo;
    }
  }

  // Extreme fallback: animal + random suffix, verified against taken set
  for (let i = 0; i < 100; i++) {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]!;
    const combo = `${animal}-${Math.floor(Math.random() * 9999)}`;
    if (!taken.has(combo)) return combo;
  }

  // Last resort — timestamp-based, guaranteed unique
  return `session-${Date.now().toString(36)}`;
}

/** Resolve a short ID to a session ID. Checks active sessions first, then most recent. */
export function resolveShortId(shortId: string): string | undefined {
  const db = getDb();

  // Try active sessions first
  const active = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.shortId, shortId),
        notInArray(sessions.status, [...TERMINAL_STATUSES]),
      ),
    )
    .get();

  if (active) return active.id;

  // Fall back to most recent session with this short ID still set (non-null = not yet cleaned up)
  const recent = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.shortId, shortId), isNotNull(sessions.shortId)))
    .orderBy(desc(sessions.startedAt))
    .limit(1)
    .get();

  return recent?.id;
}
