/**
 * SessionStore — Drizzle/SQLite-backed session persistence.
 * Replaces old file-based JSON store with proper DB operations.
 */

import { eq, desc, and, count, notInArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessions, sessionMessages, telegramSessionMappings, dailyCosts } from "../db/schema.js";
import { createLogger } from "../logger.js";
import { generateShortId } from "./short-id.js";
import type {
  SessionState,
  SessionStatus,
  SessionListItem,
  StoredMessage,
  MessageSource,
} from "@companion/shared";

const log = createLogger("session-store");

// ─── In-memory active session tracking ──────────────────────────────────────

export interface ActiveSession {
  id: string;
  state: SessionState;
  /** Stdin writer for CLI process */
  cliSend: ((data: string) => void) | null;
  /** Connected browser WebSockets */
  browserSockets: Set<{ send: (data: string) => void }>;
  /** External subscribers (Telegram, etc.) */
  subscribers: Map<string, (msg: unknown) => void>;
  /** Pending permission requests */
  pendingPermissions: Map<string, unknown>;
  /** Auto-approve timers */
  autoApproveTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Auto-approve config */
  autoApproveConfig: {
    enabled: boolean;
    timeoutSeconds: number;
    allowBash: boolean;
  };
  /** Whether bypass is disabled for this session */
  bypassDisabled: boolean;
  /** Messages queued before CLI connects */
  pendingMessages: string[];
  /** Message history for browser replay */
  messageHistory: unknown[];
  /** CLI process PID */
  pid: number | null;
  /** CLI internal session ID (from system:init) — used for --resume */
  cliSessionId: string | null;
  /** VS Code extension send function */
  extensionSend: ((data: string) => void) | null;
  /** Last N stderr lines from CLI process (for error diagnostics) */
  lastStderrLines?: string[];
}

/** Max number of messages to keep in memory per session (FIFO eviction) */
const MESSAGE_HISTORY_CAP = 500;

/** Map of session ID → active in-memory session */
const activeSessions = new Map<string, ActiveSession>();

/**
 * Append a message to session history with FIFO cap.
 * Evicts oldest entries when cap is reached.
 */
export function pushMessageHistory(session: ActiveSession, msg: unknown): void {
  session.messageHistory.push(msg);
  if (session.messageHistory.length > MESSAGE_HISTORY_CAP) {
    // Drop oldest entries to stay within cap
    const overflow = session.messageHistory.length - MESSAGE_HISTORY_CAP;
    session.messageHistory.splice(0, overflow);
  }
}

// ─── Active session management ──────────────────────────────────────────────

export function createActiveSession(
  id: string,
  initialState: SessionState,
): ActiveSession {
  const session: ActiveSession = {
    id,
    state: initialState,
    cliSend: null,
    browserSockets: new Set(),
    subscribers: new Map(),
    pendingPermissions: new Map(),
    autoApproveTimers: new Map(),
    autoApproveConfig: {
      enabled: false,
      timeoutSeconds: 30,
      allowBash: false,
    },
    bypassDisabled: false,
    pendingMessages: [],
    messageHistory: [],
    pid: null,
    cliSessionId: null,
    extensionSend: null,
  };

  activeSessions.set(id, session);
  return session;
}

export function getActiveSession(id: string): ActiveSession | undefined {
  return activeSessions.get(id);
}

export function getAllActiveSessions(): ActiveSession[] {
  return [...activeSessions.values()];
}

export function removeActiveSession(id: string): void {
  const session = activeSessions.get(id);
  if (session) {
    // Clear all timers
    for (const timer of session.autoApproveTimers.values()) {
      clearTimeout(timer);
    }
    activeSessions.delete(id);
  }
}

// ─── Database operations ────────────────────────────────────────────────────

export function persistSession(activeSession: ActiveSession): void {
  const db = getDb();
  const { state, id, pid } = activeSession;

  try {
    db.update(sessions)
      .set({
        model: state.model,
        status: state.status,
        cwd: state.cwd,
        pid,
        permissionMode: state.permissionMode,
        claudeCodeVersion: state.claude_code_version || undefined,
        totalCostUsd: state.total_cost_usd,
        numTurns: state.num_turns,
        totalInputTokens: state.total_input_tokens,
        totalOutputTokens: state.total_output_tokens,
        cacheCreationTokens: state.cache_creation_tokens,
        cacheReadTokens: state.cache_read_tokens,
        totalLinesAdded: state.total_lines_added,
        totalLinesRemoved: state.total_lines_removed,
        filesRead: state.files_read,
        filesModified: state.files_modified,
        filesCreated: state.files_created,
      })
      .where(eq(sessions.id, id))
      .run();
  } catch (err) {
    log.error("Failed to persist session", { id, error: String(err) });
  }
}

export function createSessionRecord(opts: {
  id: string;
  projectSlug?: string;
  model: string;
  cwd: string;
  permissionMode?: string;
  source?: string;
  parentId?: string;
  channelId?: string;
}): string {
  const db = getDb();
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shortId = generateShortId();
    try {
      db.insert(sessions)
        .values({
          id: opts.id,
          shortId,
          projectSlug: opts.projectSlug,
          model: opts.model,
          cwd: opts.cwd,
          permissionMode: opts.permissionMode ?? "default",
          source: opts.source ?? "api",
          parentId: opts.parentId,
          channelId: opts.channelId,
          startedAt: new Date(),
        })
        .run();
      return shortId;
    } catch (err) {
      const isUniqueViolation = String(err).includes("UNIQUE constraint failed");
      if (!isUniqueViolation || attempt === MAX_RETRIES - 1) {
        throw err;
      }
      log.warn("ShortId collision, retrying", { shortId, attempt });
    }
  }

  // Safety net — all retries exhausted without throwing (shouldn't happen, but TypeScript needs it)
  throw new Error("Failed to generate unique shortId after max retries");
}

export function endSessionRecord(id: string, status: SessionStatus = "ended"): void {
  const db = getDb();

  db.update(sessions)
    .set({
      status,
      shortId: null, // Free the shortId for reuse by new sessions
      endedAt: new Date(),
    })
    .where(eq(sessions.id, id))
    .run();

  // Aggregate costs into daily_costs table
  aggregateSessionCost(id);
}

/** Upsert daily_costs row for a completed session */
function aggregateSessionCost(sessionId: string): void {
  const db = getDb();

  try {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session || session.totalCostUsd <= 0) return;

    const date = (session.startedAt ?? new Date()).toISOString().slice(0, 10);
    const projectSlug = session.projectSlug ?? null;
    const totalTokens = (session.totalInputTokens ?? 0) + (session.totalOutputTokens ?? 0);

    // Upsert: try to update existing row, insert if not found
    const existing = db
      .select()
      .from(dailyCosts)
      .where(
        and(
          eq(dailyCosts.date, date),
          projectSlug
            ? eq(dailyCosts.projectSlug, projectSlug)
            : sql`${dailyCosts.projectSlug} IS NULL`,
        ),
      )
      .get();

    if (existing) {
      db.update(dailyCosts)
        .set({
          totalCostUsd: (existing.totalCostUsd ?? 0) + session.totalCostUsd,
          totalSessions: (existing.totalSessions ?? 0) + 1,
          totalTokens: (existing.totalTokens ?? 0) + totalTokens,
        })
        .where(eq(dailyCosts.id, existing.id))
        .run();
    } else {
      db.insert(dailyCosts)
        .values({
          date,
          projectSlug,
          totalCostUsd: session.totalCostUsd,
          totalSessions: 1,
          totalTokens,
        })
        .run();
    }

    log.info("Daily cost aggregated", { sessionId, date, cost: session.totalCostUsd });
  } catch (err) {
    log.error("Failed to aggregate daily cost", { sessionId, error: String(err) });
  }
}

export function getSessionRecord(id: string) {
  const db = getDb();
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

/** Update the cliSessionId on a session record (called when system:init arrives) */
export function updateCliSessionId(id: string, cliSessionId: string): void {
  const db = getDb();
  try {
    db.update(sessions)
      .set({ cliSessionId })
      .where(eq(sessions.id, id))
      .run();
  } catch (err) {
    log.error("Failed to update cliSessionId", { id, error: String(err) });
  }
}

/** Find a dead (ended) session with a stored cliSessionId for the given project+chatId combo.
 *  Used for the resume flow — checks telegramSessionMappings to find the last ended session. */
export function findDeadSessionForChat(opts: {
  chatId: number;
  projectSlug: string;
}): { sessionId: string; cliSessionId: string; model: string } | undefined {
  const db = getDb();
  const { chatId, projectSlug } = opts;

  // Look in telegramSessionMappings for a dead session that had a cliSessionId
  try {
    const mappingRow = db
      .select()
      .from(telegramSessionMappings)
      .where(
        and(
          eq(telegramSessionMappings.chatId, chatId),
          eq(telegramSessionMappings.projectSlug, projectSlug),
        ),
      )
      .orderBy(desc(telegramSessionMappings.createdAt))
      .limit(5)
      .all();

    for (const row of mappingRow) {
      // Check that the corresponding session is ended and has a cliSessionId
      const sessionRow = db
        .select({ status: sessions.status, cliSessionId: sessions.cliSessionId, model: sessions.model })
        .from(sessions)
        .where(eq(sessions.id, row.sessionId))
        .get();

      if (
        sessionRow &&
        sessionRow.status === "ended" &&
        sessionRow.cliSessionId
      ) {
        return {
          sessionId: row.sessionId,
          cliSessionId: sessionRow.cliSessionId,
          model: sessionRow.model,
        };
      }
    }
  } catch (err) {
    log.error("Failed to find dead session", { chatId, projectSlug, error: String(err) });
  }

  return undefined;
}

export function listSessions(opts?: {
  projectSlug?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): { items: SessionListItem[]; total: number } {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const conditions = [];
  if (opts?.projectSlug) conditions.push(eq(sessions.projectSlug, opts.projectSlug));
  if (opts?.status) conditions.push(eq(sessions.status, opts.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = db
    .select({ total: count() })
    .from(sessions)
    .where(where)
    .get();
  const total = totalRow?.total ?? 0;

  const rows = db
    .select()
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    items: rows.map((row) => ({
      id: row.id,
      shortId: row.shortId ?? undefined,
      projectSlug: row.projectSlug ?? undefined,
      model: row.model,
      status: row.status as SessionStatus,
      cwd: row.cwd,
      total_cost_usd: row.totalCostUsd,
      num_turns: row.numTurns,
      startedAt: row.startedAt?.getTime() ?? 0,
      endedAt: row.endedAt?.getTime(),
    })),
    total: total ?? 0,
  };
}

export function countActiveSessions(): number {
  return activeSessions.size;
}

/**
 * Mark all DB sessions with non-terminal status as 'ended'.
 * Called on server startup (all in-memory state is gone after restart).
 * Returns the count of sessions cleaned up.
 */
export function bulkEndSessions(): number {
  const db = getDb();
  const terminalStatuses = ["ended", "error"];

  try {
    // Find sessions that are not in a terminal state
    const zombies = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(notInArray(sessions.status, terminalStatuses))
      .all();

    if (zombies.length === 0) return 0;

    db.update(sessions)
      .set({ status: "ended", endedAt: new Date(), shortId: null })
      .where(notInArray(sessions.status, terminalStatuses))
      .run();

    return zombies.length;
  } catch (err) {
    log.error("Failed to bulk-end sessions", { error: String(err) });
    return 0;
  }
}

/**
 * Find DB sessions with active (non-terminal) status and check them
 * against the provided in-memory session checker. Sessions that appear
 * active in DB but have no in-memory session are marked 'ended'.
 * Returns the count of sessions cleaned up.
 */
export function cleanupZombieSessions(
  isInMemory: (id: string) => boolean,
): number {
  const db = getDb();
  const terminalStatuses = ["ended", "error"];

  try {
    const activeInDb = db
      .select({ id: sessions.id })
      .from(sessions)
      .where(notInArray(sessions.status, terminalStatuses))
      .all();

    const zombieIds = activeInDb
      .map((r) => r.id)
      .filter((id) => !isInMemory(id));

    if (zombieIds.length === 0) return 0;

    for (const id of zombieIds) {
      db.update(sessions)
        .set({ status: "ended", endedAt: new Date(), shortId: null })
        .where(eq(sessions.id, id))
        .run();
    }

    return zombieIds.length;
  } catch (err) {
    log.error("Failed to cleanup zombie sessions", { error: String(err) });
    return 0;
  }
}

// ─── Resumable sessions ────────────────────────────────────────────────────

export interface ResumableSession {
  id: string;
  projectSlug: string | null;
  model: string;
  source: string;
  cwd: string;
  cliSessionId: string;
  endedAt: number;
}

/**
 * Returns sessions that have a cliSessionId and status='ended',
 * ordered by endedAt DESC, limit 10.
 * These can be resumed after a server restart.
 */
export function listResumableSessions(): ResumableSession[] {
  const db = getDb();

  try {
    const rows = db
      .select({
        id: sessions.id,
        projectSlug: sessions.projectSlug,
        model: sessions.model,
        source: sessions.source,
        cwd: sessions.cwd,
        cliSessionId: sessions.cliSessionId,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.status, "ended"),
          isNotNull(sessions.cliSessionId),
        ),
      )
      .orderBy(desc(sessions.endedAt))
      .limit(10)
      .all();

    return rows
      .filter((r) => r.cliSessionId !== null)
      .map((r) => ({
        id: r.id,
        projectSlug: r.projectSlug,
        model: r.model,
        source: r.source,
        cwd: r.cwd,
        cliSessionId: r.cliSessionId as string,
        endedAt: r.endedAt?.getTime() ?? 0,
      }));
  } catch (err) {
    log.error("Failed to list resumable sessions", { error: String(err) });
    return [];
  }
}

/**
 * Dismiss a resumable session by clearing its cliSessionId (by session ID).
 * Called when user clicks "Dismiss" on the resume banner.
 */
export function dismissResumableSession(sessionId: string): boolean {
  const db = getDb();
  try {
    db.update(sessions)
      .set({ cliSessionId: null })
      .where(eq(sessions.id, sessionId))
      .run();
    return true;
  } catch (err) {
    log.warn("Failed to dismiss resumable session", { sessionId, error: String(err) });
    return false;
  }
}

/**
 * Clear cliSessionId from all sessions that have this CLI session ID.
 * Called when a session is resumed — prevents the old record from showing up as resumable again.
 */
export function clearCliSessionId(cliSessionId: string): void {
  const db = getDb();
  try {
    db.update(sessions)
      .set({ cliSessionId: null })
      .where(eq(sessions.cliSessionId, cliSessionId))
      .run();
    log.info("Cleared cliSessionId from old session (resume consumed)", { cliSessionId });
  } catch (err) {
    log.warn("Failed to clear old cliSessionId", { error: String(err) });
  }
}

// ─── Message storage ────────────────────────────────────────────────────────

export function storeMessage(msg: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  source?: MessageSource;
  sourceId?: string;
  agentRole?: string;
}): void {
  const db = getDb();

  try {
    db.insert(sessionMessages)
      .values({
        id: msg.id,
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        source: msg.source ?? "api",
        sourceId: msg.sourceId,
        agentRole: msg.agentRole,
        timestamp: new Date(),
      })
      .run();
  } catch (err) {
    log.error("Failed to store message", { sessionId: msg.sessionId, error: String(err) });
  }
}

export function getSessionMessages(
  sessionId: string,
  opts?: { limit?: number; offset?: number },
): { items: StoredMessage[]; total: number } {
  const db = getDb();

  const totalRow = db
    .select({ total: count() })
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .get();
  const total = totalRow?.total ?? 0;

  const rows = db
    .select()
    .from(sessionMessages)
    .where(eq(sessionMessages.sessionId, sessionId))
    .orderBy(sessionMessages.timestamp)
    .limit(opts?.limit ?? 200)
    .offset(opts?.offset ?? 0)
    .all();

  return {
    items: rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as "user" | "assistant" | "system",
      content: row.content,
      source: row.source as MessageSource,
      sourceId: row.sourceId ?? undefined,
      timestamp: row.timestamp?.getTime() ?? 0,
    })),
    total: total ?? 0,
  };
}
