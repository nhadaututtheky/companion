/**
 * CodeGraph query telemetry — Phase 0 baseline measurement.
 *
 * Writes a log row after each agent query (fire-and-forget, never blocks).
 * Exposes a summarize() function for the MCP tool and HTTP route.
 * Rotates to keep max 10K rows per project per day.
 */

import { and, sql, gte, desc, eq, asc, inArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { codeQueryLog } from "../db/schema.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface QueryLogEntry {
  projectSlug: string;
  queryType: string;
  queryText?: string | null;
  resultCount: number;
  tokensReturned: number;
  latencyMs: number;
  agentSource?: string | null;
}

export interface QueryTypeStat {
  queryType: string;
  totalCalls: number;
  hitRate: number; // fraction of calls with resultCount > 0
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgTokensReturned: number;
}

export interface SlowQuery {
  queryType: string;
  queryText: string | null;
  latencyMs: number;
  resultCount: number;
  createdAt: Date;
}

export interface TelemetrySummary {
  projectSlug: string;
  rangeDays: number;
  totalQueries: number;
  overallHitRate: number; // fraction with resultCount > 0
  byType: QueryTypeStat[];
  top10Slowest: SlowQuery[];
  queriesOverTime: Array<{ bucket: string; count: number }>; // daily buckets
}

// ─── Rotation counter (per-project, in-process) ──────────────────────────

const insertCounters = new Map<string, number>();
const ROTATION_INTERVAL = 100; // run rotation every N inserts
const MAX_ROWS_PER_PROJECT_PER_DAY = 10_000;

// ─── Writer ───────────────────────────────────────────────────────────────

/**
 * Insert a telemetry row. Non-blocking — caller should fire-and-forget with .catch(() => {}).
 */
export function logQuery(entry: QueryLogEntry): void {
  try {
    const db = getDb();
    db.insert(codeQueryLog)
      .values({
        projectSlug: entry.projectSlug,
        queryType: entry.queryType,
        queryText: entry.queryText ?? null,
        resultCount: entry.resultCount,
        tokensReturned: entry.tokensReturned,
        latencyMs: entry.latencyMs,
        agentSource: entry.agentSource ?? null,
        createdAt: new Date(),
      })
      .run();

    // Throttled rotation check
    const count = (insertCounters.get(entry.projectSlug) ?? 0) + 1;
    insertCounters.set(entry.projectSlug, count);
    if (count % ROTATION_INTERVAL === 0) {
      rotateOldRows(entry.projectSlug);
    }
  } catch {
    // Telemetry must never throw — ignore all errors
  }
}

// ─── Rotation ─────────────────────────────────────────────────────────────

/**
 * Keep max 10K rows per project per day. Deletes oldest-first beyond cap.
 * Runs synchronously but is cheap (DELETE with LIMIT via subquery).
 */
export function rotateOldRows(projectSlug: string): void {
  try {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count rows for this project today
    const countRow = db
      .select({ cnt: sql<number>`count(*)` })
      .from(codeQueryLog)
      .where(
        and(
          sql`${codeQueryLog.projectSlug} = ${projectSlug}`,
          gte(codeQueryLog.createdAt, todayStart),
        ),
      )
      .get();

    const currentCount = Number(countRow?.cnt ?? 0);
    if (currentCount <= MAX_ROWS_PER_PROJECT_PER_DAY) return;

    const excess = currentCount - MAX_ROWS_PER_PROJECT_PER_DAY;

    // Find the oldest `excess` row IDs and delete them
    const oldIds = db
      .select({ id: codeQueryLog.id })
      .from(codeQueryLog)
      .where(
        and(eq(codeQueryLog.projectSlug, projectSlug), gte(codeQueryLog.createdAt, todayStart)),
      )
      .orderBy(asc(codeQueryLog.createdAt))
      .limit(excess)
      .all()
      .map((r) => r.id);

    if (oldIds.length > 0) {
      db.delete(codeQueryLog).where(inArray(codeQueryLog.id, oldIds)).run();
    }
  } catch {
    // Rotation must never throw
  }
}

// ─── Summarize ────────────────────────────────────────────────────────────

/**
 * Aggregate telemetry data for a project over the given number of days.
 */
export function summarize(projectSlug: string, rangeDays = 7): TelemetrySummary {
  const db = getDb();
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  // All rows in range
  const rows = db
    .select()
    .from(codeQueryLog)
    .where(
      and(sql`${codeQueryLog.projectSlug} = ${projectSlug}`, gte(codeQueryLog.createdAt, since)),
    )
    .orderBy(desc(codeQueryLog.createdAt))
    .all();

  if (rows.length === 0) {
    return {
      projectSlug,
      rangeDays,
      totalQueries: 0,
      overallHitRate: 0,
      byType: [],
      top10Slowest: [],
      queriesOverTime: [],
    };
  }

  const totalQueries = rows.length;
  const hits = rows.filter((r) => r.resultCount > 0).length;
  const overallHitRate = hits / totalQueries;

  // Aggregate by type
  const typeMap = new Map<
    string,
    { calls: number; hits: number; latencies: number[]; tokens: number[] }
  >();
  for (const row of rows) {
    const existing = typeMap.get(row.queryType) ?? {
      calls: 0,
      hits: 0,
      latencies: [],
      tokens: [],
    };
    existing.calls++;
    if (row.resultCount > 0) existing.hits++;
    existing.latencies.push(row.latencyMs);
    existing.tokens.push(row.tokensReturned);
    typeMap.set(row.queryType, existing);
  }

  const byType: QueryTypeStat[] = [...typeMap.entries()].map(([queryType, stats]) => {
    const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const avgLatencyMs = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
    const avgTokensReturned = stats.tokens.reduce((a, b) => a + b, 0) / stats.tokens.length;

    return {
      queryType,
      totalCalls: stats.calls,
      hitRate: stats.hits / stats.calls,
      avgLatencyMs: Math.round(avgLatencyMs),
      p95LatencyMs: sortedLatencies[p95Index] ?? 0,
      avgTokensReturned: Math.round(avgTokensReturned),
    };
  });

  // Sort by total calls desc
  byType.sort((a, b) => b.totalCalls - a.totalCalls);

  // Top 10 slowest queries
  const top10Slowest: SlowQuery[] = [...rows]
    .sort((a, b) => b.latencyMs - a.latencyMs)
    .slice(0, 10)
    .map((r) => ({
      queryType: r.queryType,
      queryText: r.queryText,
      latencyMs: r.latencyMs,
      resultCount: r.resultCount,
      createdAt: r.createdAt,
    }));

  // Queries over time — daily buckets (YYYY-MM-DD)
  const dayBuckets = new Map<string, number>();
  for (const row of rows) {
    const d = row.createdAt;
    const bucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayBuckets.set(bucket, (dayBuckets.get(bucket) ?? 0) + 1);
  }
  const queriesOverTime = [...dayBuckets.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  return {
    projectSlug,
    rangeDays,
    totalQueries,
    overallHitRate,
    byType,
    top10Slowest,
    queriesOverTime,
  };
}

// ─── Instrument helper ────────────────────────────────────────────────────

/**
 * Wrap any query function with telemetry logging.
 * Fire-and-forget: logging never blocks the query result.
 */
export function instrumentQuery<T>(
  queryType: string,
  queryText: string | null,
  agentSource: string,
  projectSlug: string,
  fn: () => T,
): T {
  const start = Date.now();
  const result = fn();
  const latencyMs = Date.now() - start;

  // Estimate tokens as char_count / 4 (rough)
  let tokensReturned = 0;
  let resultCount = 0;
  try {
    const serialized = JSON.stringify(result);
    tokensReturned = Math.ceil(serialized.length / 4);
    if (Array.isArray(result)) {
      resultCount = result.length;
    } else if (result !== null && result !== undefined) {
      resultCount = 1;
    }
  } catch {
    // ignore serialization errors
  }

  logQuery({
    projectSlug,
    queryType,
    queryText,
    resultCount,
    tokensReturned,
    latencyMs,
    agentSource,
  });

  return result;
}
