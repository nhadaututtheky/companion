/**
 * SessionSettingsService integration tests.
 *
 * Goals:
 *   1. `update()` writes DB and leaves the row persisted.
 *   2. `update()` emits `session:settings:updated` with the FULL resolved row
 *      (not just the patch) so subscribers don't have to re-query.
 *   3. `get()` cache coherence — writes invalidate cache, subsequent reads
 *      see the new value without waiting for TTL.
 *   4. Partial patches preserve unrelated fields (no accidental null-overwrite).
 *   5. Defaults returned when the row is missing (pre-create race).
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

const dbClientMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../../db/client.js"), dbClientMockFactory);

// Real event bus (not mocked) so we can assert emission.
import { eventBus } from "../event-bus.js";
import { sessionSettingsService } from "../session-settings-service.js";

function seedSession(sqlite: Database, id: string, projectSlug = "proj") {
  const now = Date.now();
  sqlite.run(
    `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [projectSlug, "Test", "/tmp", now, now],
  );
  sqlite.run(
    `INSERT INTO sessions (id, project_slug, model, cwd, started_at) VALUES (?, ?, ?, ?, ?)`,
    [id, projectSlug, "claude-sonnet-4-6", "/tmp", now],
  );
}

describe("SessionSettingsService", () => {
  beforeEach(() => {
    const result = createTestDb();
    currentDb = result.db;
    currentSqlite = result.sqlite;
    sessionSettingsService.clearCache();
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
    eventBus.clear();
  });

  it("returns defaults when the session row does not exist", () => {
    const s = sessionSettingsService.get("missing");
    expect(s.idleTimeoutMs).toBe(1_800_000);
    expect(s.idleTimeoutEnabled).toBe(true);
    expect(s.keepAlive).toBe(false);
    expect(s.thinking_mode).toBe("adaptive");
    expect(s.context_mode).toBe("200k");
  });

  it("update() persists the patch to the sessions row", () => {
    seedSession(currentSqlite!, "s1");

    sessionSettingsService.update("s1", { idleTimeoutMs: 600_000 });

    const row = currentSqlite!
      .prepare(`SELECT idle_timeout_ms FROM sessions WHERE id = ?`)
      .get("s1") as { idle_timeout_ms: number };
    expect(row.idle_timeout_ms).toBe(600_000);
  });

  it("update() emits 'session:settings:updated' with the fully-resolved row", () => {
    seedSession(currentSqlite!, "s1");
    const captured: Array<{ sessionId: string; settings: Record<string, unknown> }> = [];
    eventBus.on("session:settings:updated", (p) =>
      captured.push(p as unknown as (typeof captured)[number]),
    );

    sessionSettingsService.update("s1", { keepAlive: true });

    expect(captured.length).toBe(1);
    expect(captured[0]!.sessionId).toBe("s1");
    expect(captured[0]!.settings.keepAlive).toBe(true);
    // Untouched fields present with their current (default) values:
    expect(captured[0]!.settings.idleTimeoutMs).toBe(1_800_000);
    expect(captured[0]!.settings.thinking_mode).toBe("adaptive");
  });

  it("update() invalidates the cache — subsequent get() sees the new value immediately", () => {
    seedSession(currentSqlite!, "s1");

    // Warm cache with initial default
    expect(sessionSettingsService.get("s1").idleTimeoutMs).toBe(1_800_000);

    sessionSettingsService.update("s1", { idleTimeoutMs: 300_000 });

    // Cache MUST have been invalidated — this read goes to DB
    expect(sessionSettingsService.get("s1").idleTimeoutMs).toBe(300_000);
  });

  it("partial patch does not clobber unrelated fields", () => {
    seedSession(currentSqlite!, "s1");

    sessionSettingsService.update("s1", { idleTimeoutMs: 900_000 });
    sessionSettingsService.update("s1", { keepAlive: true });

    const s = sessionSettingsService.get("s1");
    expect(s.idleTimeoutMs).toBe(900_000);
    expect(s.keepAlive).toBe(true);
    expect(s.autoReinjectOnCompact).toBe(true); // default preserved
  });

  it("rejects invalid thinking_mode", () => {
    seedSession(currentSqlite!, "s1");
    expect(() =>
      sessionSettingsService.update("s1", { thinking_mode: "extreme" as never }),
    ).toThrow(/Invalid thinking_mode/);
  });

  it("rejects negative idleTimeoutMs", () => {
    seedSession(currentSqlite!, "s1");
    expect(() => sessionSettingsService.update("s1", { idleTimeoutMs: -1 })).toThrow(
      /Invalid idleTimeoutMs/,
    );
  });

  it("no-op patch still emits so stale caches can re-sync", () => {
    seedSession(currentSqlite!, "s1");
    const captured: unknown[] = [];
    eventBus.on("session:settings:updated", (p) => captured.push(p));

    sessionSettingsService.update("s1", {});

    expect(captured.length).toBe(1);
  });
});
