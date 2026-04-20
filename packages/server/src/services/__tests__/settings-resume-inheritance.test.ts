/**
 * Contract test — "resume preserves session settings".
 *
 * This test exists specifically to catch the INV-3 regression cycle. The bug
 * "idleTimeoutMs resets when resuming a session" has shipped and been
 * re-introduced multiple times because each fix only addressed one call site
 * while the underlying architecture had 5 independent writers. Phase 2
 * unified the writers via SessionSettingsService; this test pins the
 * behavior so future refactors can't regress it silently.
 *
 * Scenarios (5 settings × resume-inheritance-in-lifecycle):
 *   1. User configures idleTimeoutMs = 600_000 on session A.
 *   2. Something ends session A (kill / idle / explicit stop).
 *   3. Caller creates session B with `resume: true, resumeFromSessionId: A`.
 *   4. Session B MUST carry session A's settings — not defaults.
 *
 * We simulate steps 1 + 3 directly through SessionSettingsService since the
 * full lifecycle startSession path involves CLI spawn, which isn't unit-
 * testable. The lifecycle inheritance block under test (see
 * ws-session-lifecycle.ts "Resume: inherit per-session settings") is the
 * exact same 3 lines we exercise here, just called with a different caller.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import type { SessionSettings } from "@companion/shared";
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

import { eventBus } from "../event-bus.js";
import { sessionSettingsService } from "../session-settings-service.js";

function seedSession(sqlite: Database, id: string) {
  const now = Date.now();
  sqlite.run(
    `INSERT OR IGNORE INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ["p", "Test", "/tmp", now, now],
  );
  sqlite.run(
    `INSERT INTO sessions (id, project_slug, model, cwd, started_at) VALUES (?, ?, ?, ?, ?)`,
    [id, "p", "claude-sonnet-4-6", "/tmp", now],
  );
}

/**
 * Mirrors the resume-inheritance block in ws-session-lifecycle.startSession.
 * If that production code drifts, update this helper AND add a new case to
 * `SCENARIOS` below.
 */
function inheritSettings(fromSessionId: string, toSessionId: string): void {
  const prev = sessionSettingsService.get(fromSessionId);
  sessionSettingsService.update(toSessionId, {
    idleTimeoutMs: prev.idleTimeoutMs,
    idleTimeoutEnabled: prev.idleTimeoutEnabled,
    keepAlive: prev.keepAlive,
    autoReinjectOnCompact: prev.autoReinjectOnCompact,
    thinking_mode: prev.thinking_mode,
    context_mode: prev.context_mode,
  });
}

interface Scenario {
  name: string;
  patch: Partial<SessionSettings>;
  check: (s: SessionSettings) => void;
}

const SCENARIOS: Scenario[] = [
  {
    name: "custom idleTimeoutMs of 10 minutes",
    patch: { idleTimeoutMs: 600_000 },
    check: (s) => expect(s.idleTimeoutMs).toBe(600_000),
  },
  {
    name: "idleTimeoutMs exactly 1 hour (previously miss-handled by the `!== 3_600_000` guard)",
    patch: { idleTimeoutMs: 3_600_000 },
    check: (s) => expect(s.idleTimeoutMs).toBe(3_600_000),
  },
  {
    name: "idleTimeoutEnabled=false (user disabled the idle kill)",
    patch: { idleTimeoutEnabled: false },
    check: (s) => expect(s.idleTimeoutEnabled).toBe(false),
  },
  {
    name: "keepAlive=true (scheduler/workflow pin)",
    patch: { keepAlive: true },
    check: (s) => expect(s.keepAlive).toBe(true),
  },
  {
    name: "thinking_mode=deep",
    patch: { thinking_mode: "deep" },
    check: (s) => expect(s.thinking_mode).toBe("deep"),
  },
  {
    name: "context_mode=1m",
    patch: { context_mode: "1m" },
    check: (s) => expect(s.context_mode).toBe("1m"),
  },
  {
    name: "autoReinjectOnCompact=false",
    patch: { autoReinjectOnCompact: false },
    check: (s) => expect(s.autoReinjectOnCompact).toBe(false),
  },
];

describe("contract — resume inheritance preserves session settings", () => {
  beforeEach(() => {
    const r = createTestDb();
    currentDb = r.db;
    currentSqlite = r.sqlite;
    sessionSettingsService.clearCache();
    eventBus.clear();
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  for (const sc of SCENARIOS) {
    it(`inherits ${sc.name}`, () => {
      seedSession(currentSqlite!, "A");
      seedSession(currentSqlite!, "B");

      sessionSettingsService.update("A", sc.patch);
      inheritSettings("A", "B");

      sc.check(sessionSettingsService.get("B"));
    });
  }

  it("inherits ALL custom settings at once (realistic scenario)", () => {
    seedSession(currentSqlite!, "A");
    seedSession(currentSqlite!, "B");

    sessionSettingsService.update("A", {
      idleTimeoutMs: 900_000,
      idleTimeoutEnabled: true,
      keepAlive: false,
      autoReinjectOnCompact: false,
      thinking_mode: "deep",
      context_mode: "1m",
    });

    inheritSettings("A", "B");

    const b = sessionSettingsService.get("B");
    expect(b.idleTimeoutMs).toBe(900_000);
    expect(b.idleTimeoutEnabled).toBe(true);
    expect(b.keepAlive).toBe(false);
    expect(b.autoReinjectOnCompact).toBe(false);
    expect(b.thinking_mode).toBe("deep");
    expect(b.context_mode).toBe("1m");
  });

  it("inheritance does NOT touch the source session's settings", () => {
    seedSession(currentSqlite!, "A");
    seedSession(currentSqlite!, "B");

    sessionSettingsService.update("A", { idleTimeoutMs: 600_000 });
    inheritSettings("A", "B");

    // Mutate B — A must be unaffected.
    sessionSettingsService.update("B", { idleTimeoutMs: 60_000 });
    expect(sessionSettingsService.get("A").idleTimeoutMs).toBe(600_000);
    expect(sessionSettingsService.get("B").idleTimeoutMs).toBe(60_000);
  });

  it("emits session:settings:updated for the NEW session on inheritance", () => {
    seedSession(currentSqlite!, "A");
    seedSession(currentSqlite!, "B");

    sessionSettingsService.update("A", { idleTimeoutMs: 600_000 });

    const captured: string[] = [];
    eventBus.on("session:settings:updated", (p) =>
      captured.push((p as { sessionId: string }).sessionId),
    );

    inheritSettings("A", "B");

    // The update inside inheritSettings fires exactly one event for B.
    expect(captured).toContain("B");
  });
});
