/**
 * ErrorTracker — structured error collection and persistence.
 * Captures errors with source, stack trace, and optional session context.
 * Auto-registers global handlers for uncaught exceptions and unhandled rejections.
 */

import { getDb } from "../db/client.js";
import { errorLogs } from "../db/schema.js";
import { desc, eq, and, gte, sql } from "drizzle-orm";

interface ErrorEntry {
  source: string;
  level?: "error" | "fatal";
  message: string;
  stack?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

/** Buffer errors to batch-insert (avoids DB contention on error storms) */
const buffer: ErrorEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFER = 50;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

function flush() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, MAX_BUFFER);
  try {
    const db = getDb();
    for (const entry of batch) {
      db.insert(errorLogs)
        .values({
          source: entry.source,
          level: entry.level ?? "error",
          message: entry.message,
          stack: entry.stack ?? null,
          sessionId: entry.sessionId ?? null,
          context: entry.context ?? null,
        })
        .run();
    }
  } catch {
    // If DB write fails, we lose these errors — acceptable tradeoff
  }
}

/** Track an error. Non-blocking — buffers and flushes periodically. */
export function trackError(entry: ErrorEntry): void {
  buffer.push(entry);
  if (buffer.length >= MAX_BUFFER) {
    flush();
  } else {
    scheduleFlush();
  }
}

/** Immediately flush any buffered errors (call on shutdown). */
export function flushErrors(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

/** Query error logs with optional filters. */
export function getErrors(opts?: {
  source?: string;
  sessionId?: string;
  since?: number; // timestamp ms
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;

  const conditions = [];
  if (opts?.source) conditions.push(eq(errorLogs.source, opts.source));
  if (opts?.sessionId) conditions.push(eq(errorLogs.sessionId, opts.sessionId));
  if (opts?.since) conditions.push(gte(errorLogs.timestamp, new Date(opts.since)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(errorLogs)
    .where(where)
    .orderBy(desc(errorLogs.timestamp))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(errorLogs)
    .where(where)
    .get();

  return {
    errors: rows.map((r) => ({
      id: r.id,
      source: r.source,
      level: r.level,
      message: r.message,
      stack: r.stack,
      sessionId: r.sessionId,
      context: r.context,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : new Date(r.timestamp as number).toISOString(),
    })),
    total: countRow?.count ?? 0,
    limit,
    offset,
  };
}

/** Clear all error logs. */
export function clearErrors(): number {
  const db = getDb();
  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(errorLogs)
    .get();
  db.delete(errorLogs).run();
  return countRow?.count ?? 0;
}

/** Register global error handlers. Call once at startup. */
export function registerGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    trackError({
      source: "server",
      level: "fatal",
      message: err.message,
      stack: err.stack,
    });
    flush(); // Persist before exit
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    trackError({
      source: "server",
      level: "error",
      message: err.message,
      stack: err.stack,
    });
  });
}
