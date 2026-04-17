/**
 * Per-account usage queries.
 * Aggregates sessions data into:
 *   - heatmap buckets (daily rollup)
 *   - rolling windows (5h session, 7d weekly)
 *   - model breakdown
 *   - streaks
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessions } from "../db/schema.js";

// ── Types ────────────────────────────────────────────────────────────

export interface HeatmapBucket {
  date: string; // YYYY-MM-DD (local timezone)
  cost: number;
  sessions: number;
  tokens: number;
}

export interface WindowUsage {
  cost: number;
  sessions: number;
  tokens: number;
  /** Next reset timestamp (ISO). Null if rolling. */
  resetAt: string | null;
}

export interface ModelBreakdown {
  model: string;
  cost: number;
  sessions: number;
  tokens: number;
  pct: number; // percent of total cost
}

export interface AccountUsage {
  heatmap: HeatmapBucket[];
  windows: {
    session5h: WindowUsage;
    weekly: WindowUsage;
    monthly: WindowUsage;
  };
  totals: { cost: number; sessions: number; tokens: number };
  byModel: ModelBreakdown[];
  streaks: { current: number; longest: number };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Next Anthropic weekly reset — Tuesday 7:00 AM UTC (approximates 7 AM Pacific) */
function nextWeeklyReset(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0));
  // Tuesday = 2
  const daysUntilTue = (2 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilTue);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** First day of next month (UTC). */
function nextMonthlyReset(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

/** Compute streaks from sorted heatmap buckets (ascending date). */
function computeStreaks(buckets: HeatmapBucket[]): { current: number; longest: number } {
  if (buckets.length === 0) return { current: 0, longest: 0 };

  const dayMap = new Map(buckets.map((b) => [b.date, b.sessions > 0]));
  let longest = 0;
  let run = 0;
  const sorted = [...dayMap.keys()].sort();
  for (const date of sorted) {
    if (dayMap.get(date)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  // Current streak — from today backwards
  let current = 0;
  const today = new Date();
  for (let i = 0; i < 365; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dayMap.get(key)) current += 1;
    else break;
  }

  return { current, longest };
}

// ── Main Query ───────────────────────────────────────────────────────

export function getAccountUsage(accountId: string, days = 365): AccountUsage {
  const db = getDb();
  const now = Date.now();
  const sinceMs = now - days * 24 * 60 * 60 * 1000;

  // 1. Heatmap — daily rollup (local timezone bucketing)
  const heatmapRows = db
    .select({
      date: sql<string>`date(${sessions.startedAt} / 1000, 'unixepoch', 'localtime')`,
      cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
      sessions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .groupBy(sql`date(${sessions.startedAt} / 1000, 'unixepoch', 'localtime')`)
    .all();

  const heatmap: HeatmapBucket[] = heatmapRows.map((r) => ({
    date: r.date,
    cost: Number(r.cost) || 0,
    sessions: Number(r.sessions) || 0,
    tokens: Number(r.tokens) || 0,
  }));

  // 2. Rolling windows
  const session5hStart = now - 5 * 60 * 60 * 1000;
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;

  const windowQuery = (startMs: number): { cost: number; sessions: number; tokens: number } => {
    const row = db
      .select({
        cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
        sessions: sql<number>`COUNT(*)`,
        tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
      })
      .from(sessions)
      .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${startMs}`)
      .get();
    return {
      cost: Number(row?.cost) || 0,
      sessions: Number(row?.sessions) || 0,
      tokens: Number(row?.tokens) || 0,
    };
  };

  const session5h: WindowUsage = {
    ...windowQuery(session5hStart),
    resetAt: new Date(session5hStart + 5 * 60 * 60 * 1000).toISOString(),
  };
  const weekly: WindowUsage = {
    ...windowQuery(weekStart),
    resetAt: nextWeeklyReset().toISOString(),
  };
  const monthly: WindowUsage = {
    ...windowQuery(monthStart),
    resetAt: nextMonthlyReset().toISOString(),
  };

  // 3. Totals (over requested range)
  const totalsRow = db
    .select({
      cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
      sessions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .get();

  const totals = {
    cost: Number(totalsRow?.cost) || 0,
    sessions: Number(totalsRow?.sessions) || 0,
    tokens: Number(totalsRow?.tokens) || 0,
  };

  // 4. Model breakdown
  const modelRows = db
    .select({
      model: sessions.model,
      cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
      sessions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .groupBy(sessions.model)
    .all();

  const byModel: ModelBreakdown[] = modelRows
    .map((r) => ({
      model: r.model,
      cost: Number(r.cost) || 0,
      sessions: Number(r.sessions) || 0,
      tokens: Number(r.tokens) || 0,
      pct: totals.cost > 0 ? (Number(r.cost) / totals.cost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  // 5. Streaks
  const streaks = computeStreaks(heatmap);

  return {
    heatmap,
    windows: { session5h, weekly, monthly },
    totals,
    byModel,
    streaks,
  };
}
