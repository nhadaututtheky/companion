/**
 * Unit tests for session-store DB operations.
 * Only the DB-backed functions are tested here (not the in-memory ActiveSession
 * management which depends on no external state).
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

// ── Module mock — must be before importing the service ────────────────────────

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;
let insertProject: ((slug: string, name?: string) => void) | null = null;

const dbClientMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);

import {
  createSessionRecord,
  endSessionRecord,
  getSessionRecord,
  storeMessage,
  getSessionMessages,
  listSessions,
  bulkEndSessions,
  createActiveSession,
  getActiveSession,
  removeActiveSession,
  getAllActiveSessions,
  countActiveSessions,
  flushAllWriters,
} from "./session-store.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupTestDb() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  insertProject = result.insertProject;
}

function teardownTestDb() {
  currentSqlite?.close();
  currentDb = null;
  currentSqlite = null;
  insertProject = null;
}

let sessionCounter = 0;

/** Create a minimal session record in the DB and return the ID */
function insertSession(
  overrides: {
    id?: string;
    status?: string;
    projectSlug?: string;
    cliSessionId?: string;
  } = {},
): string {
  const id = overrides.id ?? `test-session-${++sessionCounter}`;

  // Ensure the project exists before creating a session that references it
  if (overrides.projectSlug && insertProject) {
    insertProject(overrides.projectSlug);
  }

  createSessionRecord({
    id,
    model: "claude-sonnet-4-6",
    cwd: "/tmp/test",
    permissionMode: "default",
    source: "api",
    projectSlug: overrides.projectSlug,
  });

  if (overrides.status && overrides.status !== "starting") {
    endSessionRecord(id, overrides.status as "ended" | "error");
  }

  return id;
}

// ─── storeMessage + getSessionMessages ───────────────────────────────────────

describe("storeMessage and getSessionMessages", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("stores a message and retrieves it by sessionId", () => {
    const sessionId = insertSession();
    storeMessage({
      id: "msg-1",
      sessionId,
      role: "user",
      content: "Hello world",
      source: "api",
    });
    flushAllWriters();

    const result = getSessionMessages(sessionId);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("msg-1");
    expect(result.items[0]!.content).toBe("Hello world");
    expect(result.items[0]!.role).toBe("user");
  });

  it("stores multiple messages and retrieves them all", () => {
    const sessionId = insertSession();
    storeMessage({ id: "msg-a", sessionId, role: "user", content: "First" });
    storeMessage({ id: "msg-b", sessionId, role: "assistant", content: "Second" });
    storeMessage({ id: "msg-c", sessionId, role: "user", content: "Third" });
    flushAllWriters();

    const result = getSessionMessages(sessionId);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("does not return messages from a different session", () => {
    const s1 = insertSession();
    const s2 = insertSession();

    storeMessage({ id: "msg-s1", sessionId: s1, role: "user", content: "For s1" });
    storeMessage({ id: "msg-s2", sessionId: s2, role: "user", content: "For s2" });
    flushAllWriters();

    const result = getSessionMessages(s1);
    expect(result.total).toBe(1);
    expect(result.items[0]!.id).toBe("msg-s1");
  });

  it("returns empty list and total=0 for session with no messages", () => {
    const sessionId = insertSession();
    const result = getSessionMessages(sessionId);
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("respects limit and offset pagination", () => {
    const sessionId = insertSession();
    for (let i = 0; i < 5; i++) {
      storeMessage({ id: `msg-${i}`, sessionId, role: "user", content: `Message ${i}` });
    }
    flushAllWriters();

    const page1 = getSessionMessages(sessionId, { limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = getSessionMessages(sessionId, { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);

    const page3 = getSessionMessages(sessionId, { limit: 2, offset: 4 });
    expect(page3.items).toHaveLength(1);
  });

  it("stores optional source and sourceId fields", () => {
    const sessionId = insertSession();
    storeMessage({
      id: "msg-src",
      sessionId,
      role: "user",
      content: "from telegram",
      source: "telegram",
      sourceId: "tg-12345",
    });
    flushAllWriters();

    const result = getSessionMessages(sessionId);
    expect(result.items[0]!.source).toBe("telegram");
    expect(result.items[0]!.sourceId).toBe("tg-12345");
  });
});

// ─── bulkEndSessions ─────────────────────────────────────────────────────────

describe("bulkEndSessions", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("returns 0 when there are no sessions", () => {
    const count = bulkEndSessions();
    expect(count).toBe(0);
  });

  it("returns 0 when all sessions are already in terminal status", () => {
    insertSession({ status: "ended" });
    insertSession({ status: "error" });
    const count = bulkEndSessions();
    expect(count).toBe(0);
  });

  it("ends sessions in non-terminal states and returns the count", () => {
    // starting status (default from createSessionRecord)
    const s1 = insertSession();
    const s2 = insertSession();
    // already ended
    const s3 = insertSession({ status: "ended" });

    const count = bulkEndSessions();
    expect(count).toBe(2);

    const r1 = getSessionRecord(s1);
    const r2 = getSessionRecord(s2);
    const r3 = getSessionRecord(s3);

    expect(r1?.status).toBe("ended");
    expect(r2?.status).toBe("ended");
    // s3 was already ended before bulkEndSessions
    expect(r3?.status).toBe("ended");
  });

  it("sets endedAt on newly ended sessions", () => {
    const sessionId = insertSession();
    const before = Date.now();
    bulkEndSessions();
    const after = Date.now();

    const record = getSessionRecord(sessionId);
    expect(record?.endedAt).not.toBeNull();
    const endedMs = record!.endedAt!.getTime();
    expect(endedMs).toBeGreaterThanOrEqual(before);
    expect(endedMs).toBeLessThanOrEqual(after + 100);
  });
});

// ─── listSessions ─────────────────────────────────────────────────────────────

describe("listSessions", () => {
  beforeEach(setupTestDb);
  afterEach(teardownTestDb);

  it("returns empty list when no sessions exist", () => {
    const result = listSessions();
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("returns all sessions when no filters applied", () => {
    insertSession();
    insertSession();
    insertSession();

    const result = listSessions();
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("filters by projectSlug", () => {
    insertSession({ projectSlug: "proj-a" });
    insertSession({ projectSlug: "proj-a" });
    insertSession({ projectSlug: "proj-b" });

    const result = listSessions({ projectSlug: "proj-a" });
    expect(result.total).toBe(2);
    expect(result.items.every((s) => s.projectSlug === "proj-a")).toBe(true);
  });

  it("filters by status", () => {
    insertSession(); // status = starting
    insertSession({ status: "ended" });
    insertSession({ status: "ended" });

    const active = listSessions({ status: "starting" });
    expect(active.total).toBe(1);

    const ended = listSessions({ status: "ended" });
    expect(ended.total).toBe(2);
  });

  it("combines projectSlug and status filters", () => {
    insertSession({ projectSlug: "proj-a" }); // starting
    insertSession({ projectSlug: "proj-a", status: "ended" });
    insertSession({ projectSlug: "proj-b", status: "ended" });

    const result = listSessions({ projectSlug: "proj-a", status: "ended" });
    expect(result.total).toBe(1);
    expect(result.items[0]!.projectSlug).toBe("proj-a");
  });

  it("respects limit and offset pagination", () => {
    for (let i = 0; i < 5; i++) insertSession();

    const page1 = listSessions({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page2 = listSessions({ limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);

    const page3 = listSessions({ limit: 2, offset: 4 });
    expect(page3.items).toHaveLength(1);
  });

  it("returned items contain expected fields", () => {
    const id = insertSession({ projectSlug: "my-proj" });
    const result = listSessions();
    const item = result.items.find((s) => s.id === id);
    expect(item).toBeDefined();
    expect(item!.model).toBe("claude-sonnet-4-6");
    expect(item!.cwd).toBe("/tmp/test");
    expect(item!.status).toBeDefined();
    expect(typeof item!.startedAt).toBe("number");
  });
});

// ─── In-memory ActiveSession management ──────────────────────────────────────

describe("ActiveSession in-memory management", () => {
  it("creates and retrieves an active session", () => {
    const state = {
      session_id: "mem-1",
      model: "claude-sonnet-4-6",
      cwd: "/tmp",
      tools: [],
      permissionMode: "default",
      claude_code_version: "1.0.0",
      mcp_servers: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      files_read: [],
      files_modified: [],
      files_created: [],
      started_at: Date.now(),
      status: "starting" as const,
      is_in_plan_mode: false,
      cost_warned: 0,
      compact_mode: "manual" as const,
      compact_threshold: 75,
      thinking_mode: "adaptive" as const,
    };

    const session = createActiveSession("mem-1", state);
    expect(session.id).toBe("mem-1");
    expect(session.state.model).toBe("claude-sonnet-4-6");

    const retrieved = getActiveSession("mem-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("mem-1");
  });

  it("removes an active session", () => {
    const state = {
      session_id: "mem-2",
      model: "claude-sonnet-4-6",
      cwd: "/tmp",
      tools: [],
      permissionMode: "default",
      claude_code_version: "1.0.0",
      mcp_servers: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      files_read: [],
      files_modified: [],
      files_created: [],
      started_at: Date.now(),
      status: "starting" as const,
      is_in_plan_mode: false,
      cost_warned: 0,
      compact_mode: "manual" as const,
      compact_threshold: 75,
      thinking_mode: "adaptive" as const,
    };

    createActiveSession("mem-2", state);
    removeActiveSession("mem-2");
    expect(getActiveSession("mem-2")).toBeUndefined();
  });

  it("countActiveSessions reflects the number of in-memory sessions", () => {
    // Clean up any leftover from other tests
    for (const s of getAllActiveSessions()) removeActiveSession(s.id);

    const baseState = {
      model: "claude-sonnet-4-6",
      cwd: "/tmp",
      tools: [],
      permissionMode: "default",
      claude_code_version: "1.0.0",
      mcp_servers: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      files_read: [],
      files_modified: [],
      files_created: [],
      started_at: Date.now(),
      status: "idle" as const,
      is_in_plan_mode: false,
      cost_warned: 0,
      compact_mode: "manual" as const,
      compact_threshold: 75,
      thinking_mode: "adaptive" as const,
    };

    createActiveSession("count-a", { ...baseState, session_id: "count-a" });
    createActiveSession("count-b", { ...baseState, session_id: "count-b" });

    expect(countActiveSessions()).toBe(2);

    removeActiveSession("count-a");
    expect(countActiveSessions()).toBe(1);

    removeActiveSession("count-b");
    expect(countActiveSessions()).toBe(0);
  });
});
