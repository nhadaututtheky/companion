/**
 * SessionSettingsService — single writer for per-session settings.
 *
 * Before: writers mutated 2 in-memory Maps + 2 DB tables with NO coordination;
 * resume paths resurrected stale data; defaults diverged across call sites.
 * Fix history (INVARIANTS.md) shows the same bug class recurring every few
 * weeks because each patch only addressed one call site.
 *
 * After: every read goes through `get()` (cache-first, DB-backed). Every write
 * goes through `update()` — validates → writes DB → invalidates its own cache
 * → emits `session:settings:updated`. Subscribers (ws-bridge, telegram-idle-
 * manager, ws broadcast) react to the event; they never mutate settings
 * themselves. Defaults come from @companion/shared constants.
 *
 * The legacy Maps in ws-bridge and telegram-idle-manager still exist in
 * Phase 2 — they serve as read caches populated by the service via events.
 * Phase 3 drops the mapping table column + removes the Map writer code.
 */

import { eq } from "drizzle-orm";
import {
  DEFAULT_AUTO_REINJECT_ON_COMPACT,
  DEFAULT_CONTEXT_MODE,
  DEFAULT_IDLE_TIMEOUT_ENABLED,
  DEFAULT_KEEP_ALIVE,
  DEFAULT_THINKING_MODE,
  SESSION_IDLE_TIMEOUT_MS,
  type ContextMode,
  type SessionSettings,
  type ThinkingMode,
} from "@companion/shared";
import { getDb } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { createLogger } from "../logger.js";
import { eventBus } from "./event-bus.js";

const log = createLogger("session-settings-service");

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  settings: SessionSettings;
  expiresAt: number;
}

const DEFAULTS: SessionSettings = {
  idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
  idleTimeoutEnabled: DEFAULT_IDLE_TIMEOUT_ENABLED,
  keepAlive: DEFAULT_KEEP_ALIVE,
  autoReinjectOnCompact: DEFAULT_AUTO_REINJECT_ON_COMPACT,
  thinking_mode: DEFAULT_THINKING_MODE,
  context_mode: DEFAULT_CONTEXT_MODE,
};

/** The six columns migration 0044 added to `sessions`. */
const DB_KEYS = [
  "idleTimeoutMs",
  "idleTimeoutEnabled",
  "keepAlive",
  "autoReinjectOnCompact",
  "thinkingMode",
  "contextMode",
] as const;

function rowToSettings(row: {
  idleTimeoutMs: number;
  idleTimeoutEnabled: boolean;
  keepAlive: boolean;
  autoReinjectOnCompact: boolean;
  thinkingMode: string;
  contextMode: string;
}): SessionSettings {
  return {
    idleTimeoutMs: row.idleTimeoutMs,
    idleTimeoutEnabled: row.idleTimeoutEnabled,
    keepAlive: row.keepAlive,
    autoReinjectOnCompact: row.autoReinjectOnCompact,
    thinking_mode: row.thinkingMode as ThinkingMode,
    context_mode: row.contextMode as ContextMode,
  };
}

function patchToRow(patch: Partial<SessionSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.idleTimeoutMs !== undefined) out.idleTimeoutMs = patch.idleTimeoutMs;
  if (patch.idleTimeoutEnabled !== undefined) out.idleTimeoutEnabled = patch.idleTimeoutEnabled;
  if (patch.keepAlive !== undefined) out.keepAlive = patch.keepAlive;
  if (patch.autoReinjectOnCompact !== undefined)
    out.autoReinjectOnCompact = patch.autoReinjectOnCompact;
  if (patch.thinking_mode !== undefined) out.thinkingMode = patch.thinking_mode;
  if (patch.context_mode !== undefined) out.contextMode = patch.context_mode;
  return out;
}

function validate(patch: Partial<SessionSettings>): void {
  if (patch.idleTimeoutMs !== undefined) {
    if (!Number.isFinite(patch.idleTimeoutMs) || patch.idleTimeoutMs < 0) {
      throw new Error(`Invalid idleTimeoutMs: ${patch.idleTimeoutMs}`);
    }
  }
  if (patch.thinking_mode !== undefined) {
    if (!["adaptive", "off", "deep"].includes(patch.thinking_mode)) {
      throw new Error(`Invalid thinking_mode: ${patch.thinking_mode}`);
    }
  }
  if (patch.context_mode !== undefined) {
    if (!["200k", "1m"].includes(patch.context_mode)) {
      throw new Error(`Invalid context_mode: ${patch.context_mode}`);
    }
  }
}

export class SessionSettingsService {
  private cache = new Map<string, CacheEntry>();

  /** Expose defaults for callers who need a baseline before the session row exists. */
  static readonly DEFAULTS: SessionSettings = DEFAULTS;

  /**
   * Read current settings for a session.
   *
   * Cache TTL is 30s; subscribers invalidate eagerly on `session:settings:updated`.
   * If the row doesn't exist (e.g. session still being created, or test fixture),
   * defaults are returned — callers MUST NOT treat that as an error.
   */
  get(sessionId: string): SessionSettings {
    const now = Date.now();
    const cached = this.cache.get(sessionId);
    if (cached && cached.expiresAt > now) return cached.settings;

    const row = this.readRow(sessionId);
    const settings = row ?? DEFAULTS;
    this.cache.set(sessionId, { settings, expiresAt: now + CACHE_TTL_MS });
    return settings;
  }

  /**
   * Apply a partial patch. Writes to DB, refreshes cache, emits event.
   * Returns the fully-merged settings AFTER the write.
   */
  update(sessionId: string, patch: Partial<SessionSettings>): SessionSettings {
    validate(patch);
    const rowPatch = patchToRow(patch);

    // Short-circuit no-op patches — still emit so subscribers can re-sync
    // stale caches, but skip the DB round-trip.
    if (Object.keys(rowPatch).length > 0) {
      try {
        const db = getDb();
        db.update(sessions).set(rowPatch).where(eq(sessions.id, sessionId)).run();
      } catch (err) {
        log.error("Failed to persist session settings", {
          sessionId,
          error: String(err),
          keys: Object.keys(rowPatch),
        });
        throw err;
      }
    }

    // Read back so cache + event carry the fully-resolved row (including
    // fields we didn't touch). Avoids subscribers having to re-query.
    this.cache.delete(sessionId);
    const settings = this.get(sessionId);

    log.info("Session settings updated", {
      sessionId,
      patched: Object.keys(patch),
    });
    eventBus.emit("session:settings:updated", { sessionId, settings });
    return settings;
  }

  /** Invalidate cached entry — forces next `get()` to re-read from DB. */
  invalidate(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /** Clear every cached entry (tests, full reset). */
  clearCache(): void {
    this.cache.clear();
  }

  private readRow(sessionId: string): SessionSettings | undefined {
    try {
      const db = getDb();
      const row = db
        .select({
          idleTimeoutMs: sessions.idleTimeoutMs,
          idleTimeoutEnabled: sessions.idleTimeoutEnabled,
          keepAlive: sessions.keepAlive,
          autoReinjectOnCompact: sessions.autoReinjectOnCompact,
          thinkingMode: sessions.thinkingMode,
          contextMode: sessions.contextMode,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();
      return row ? rowToSettings(row) : undefined;
    } catch (err) {
      log.warn("Failed to read session settings, using defaults", {
        sessionId,
        error: String(err),
      });
      return undefined;
    }
  }
}

/** Singleton — importers should use this, not `new SessionSettingsService()`. */
export const sessionSettingsService = new SessionSettingsService();

/** Symbolic re-export so migration follow-ups can grep for usage sites. */
export const SESSION_SETTINGS_DB_KEYS = DB_KEYS;
