/**
 * Per-account usage queries.
 * Aggregates sessions data into:
 *   - heatmap buckets (daily rollup, caller-provided TZ offset)
 *   - rolling windows (5h session, 7d weekly, 30d monthly)
 *   - model breakdown
 *   - streaks
 *
 * Performance: all metrics computed in a single SQL round-trip using
 * conditional aggregation. A composite index on (accountId, startedAt)
 * is assumed — see migrations.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessions } from "../db/schema.js";

// ── Types ────────────────────────────────────────────────────────────

export interface HeatmapBucket {
  date: string; // YYYY-MM-DD in caller's timezone
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

/** Next Anthropic weekly reset — Tuesday 7:00 AM UTC (approximates 7 AM Pacific). */
function nextWeeklyReset(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7, 0, 0));
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

/**
 * Compute streaks from a dense map of YYYY-MM-DD → hasActivity.
 * Current streak: consecutive active days ending today OR yesterday
 * (today counts as optional — preserves streak when user hasn't logged in yet).
 */
function computeStreaks(
  dayMap: Map<string, boolean>,
  todayKey: string,
  yesterdayKey: string,
): { current: number; longest: number } {
  if (dayMap.size === 0) return { current: 0, longest: 0 };

  // Longest run across the whole window
  const sortedDates = [...dayMap.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const date of sortedDates) {
    const cur = new Date(`${date}T00:00:00Z`);
    if (prev && (cur.getTime() - prev.getTime()) / 86_400_000 === 1) {
      run = dayMap.get(date) ? run + 1 : 0;
    } else {
      run = dayMap.get(date) ? 1 : 0;
    }
    if (run > longest) longest = run;
    prev = cur;
  }

  // Current: start from today; if today absent, allow anchor at yesterday.
  let anchor: string | null = null;
  if (dayMap.get(todayKey)) anchor = todayKey;
  else if (dayMap.get(yesterdayKey)) anchor = yesterdayKey;

  let current = 0;
  if (anchor) {
    const d = new Date(`${anchor}T00:00:00Z`);
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (dayMap.get(key)) {
        current += 1;
        d.setUTCDate(d.getUTCDate() - 1);
      } else break;
    }
  }

  return { current, longest };
}

/** Parse an IANA offset (minutes east of UTC) into a SQLite `localtime`-compatible modifier. */
function tzModifier(offsetMinutes: number): string {
  // SQLite doesn't accept ±HH:MM for arbitrary offset on `date()`, so shift the epoch instead.
  // Caller converts tzOffset → shiftSeconds and we apply it before bucketing.
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`; // informational only — unused by SQLite
}
void tzModifier; // kept for debug logging

// ── Main Query ───────────────────────────────────────────────────────

export interface UsageOptions {
  /** Timezone offset in minutes east of UTC (e.g. UTC+7 = 420). Defaults to 0 (UTC). */
  tzOffsetMinutes?: number;
}

export function getAccountUsage(
  accountId: string,
  days = 365,
  opts: UsageOptions = {},
): AccountUsage {
  const db = getDb();
  const now = Date.now();
  const sinceMs = now - days * 24 * 60 * 60 * 1000;
  const tzOffsetMin = opts.tzOffsetMinutes ?? 0;
  const tzShiftSec = tzOffsetMin * 60; // shift the epoch to fake local TZ bucketing

  const session5hStart = now - 5 * 60 * 60 * 1000;
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = now - 30 * 24 * 60 * 60 * 1000;

  // 1. Heatmap — daily rollup bucketed by caller's TZ (shift epoch, then date()).
  const heatmapRows = db
    .select({
      date: sql<string>`date((${sessions.startedAt} / 1000) + ${tzShiftSec}, 'unixepoch')`,
      cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
      sessions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .groupBy(sql`date((${sessions.startedAt} / 1000) + ${tzShiftSec}, 'unixepoch')`)
    .all();

  const heatmap: HeatmapBucket[] = heatmapRows.map((r) => ({
    date: r.date,
    cost: Number(r.cost) || 0,
    sessions: Number(r.sessions) || 0,
    tokens: Number(r.tokens) || 0,
  }));

  // 2. Consolidated rolling-window + totals + earliest-session query (1 round-trip).
  const aggRow = db
    .select({
      // Totals over requested range
      totalCost: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${sinceMs} THEN ${sessions.totalCostUsd} ELSE 0 END), 0)`,
      totalSessions: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${sinceMs} THEN 1 ELSE 0 END), 0)`,
      totalTokens: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${sinceMs} THEN ${sessions.totalInputTokens} + ${sessions.totalOutputTokens} ELSE 0 END), 0)`,
      // 5h window
      s5hCost: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${session5hStart} THEN ${sessions.totalCostUsd} ELSE 0 END), 0)`,
      s5hSessions: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${session5hStart} THEN 1 ELSE 0 END), 0)`,
      s5hTokens: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${session5hStart} THEN ${sessions.totalInputTokens} + ${sessions.totalOutputTokens} ELSE 0 END), 0)`,
      s5hEarliest: sql<number | null>`MIN(CASE WHEN ${sessions.startedAt} >= ${session5hStart} THEN ${sessions.startedAt} ELSE NULL END)`,
      // 7d window
      wCost: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${weekStart} THEN ${sessions.totalCostUsd} ELSE 0 END), 0)`,
      wSessions: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${weekStart} THEN 1 ELSE 0 END), 0)`,
      wTokens: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${weekStart} THEN ${sessions.totalInputTokens} + ${sessions.totalOutputTokens} ELSE 0 END), 0)`,
      // 30d window
      mCost: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${monthStart} THEN ${sessions.totalCostUsd} ELSE 0 END), 0)`,
      mSessions: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${monthStart} THEN 1 ELSE 0 END), 0)`,
      mTokens: sql<number>`COALESCE(SUM(CASE WHEN ${sessions.startedAt} >= ${monthStart} THEN ${sessions.totalInputTokens} + ${sessions.totalOutputTokens} ELSE 0 END), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .get();

  const totals = {
    cost: Number(aggRow?.totalCost) || 0,
    sessions: Number(aggRow?.totalSessions) || 0,
    tokens: Number(aggRow?.totalTokens) || 0,
  };

  // session5h.resetAt = earliest session in window + 5h (rolling expiry), not now+5h.
  const s5hEarliest = aggRow?.s5hEarliest ? Number(aggRow.s5hEarliest) : null;
  const session5h: WindowUsage = {
    cost: Number(aggRow?.s5hCost) || 0,
    sessions: Number(aggRow?.s5hSessions) || 0,
    tokens: Number(aggRow?.s5hTokens) || 0,
    resetAt: s5hEarliest ? new Date(s5hEarliest + 5 * 60 * 60 * 1000).toISOString() : null,
  };

  const weekly: WindowUsage = {
    cost: Number(aggRow?.wCost) || 0,
    sessions: Number(aggRow?.wSessions) || 0,
    tokens: Number(aggRow?.wTokens) || 0,
    resetAt: nextWeeklyReset().toISOString(),
  };

  const monthly: WindowUsage = {
    cost: Number(aggRow?.mCost) || 0,
    sessions: Number(aggRow?.mSessions) || 0,
    tokens: Number(aggRow?.mTokens) || 0,
    resetAt: nextMonthlyReset().toISOString(),
  };

  // 3. Model breakdown (COALESCE NULL → 'unknown').
  const modelRows = db
    .select({
      model: sql<string>`COALESCE(${sessions.model}, 'unknown')`,
      cost: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
      sessions: sql<number>`COUNT(*)`,
      tokens: sql<number>`COALESCE(SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens}), 0)`,
    })
    .from(sessions)
    .where(sql`${sessions.accountId} = ${accountId} AND ${sessions.startedAt} >= ${sinceMs}`)
    .groupBy(sql`COALESCE(${sessions.model}, 'unknown')`)
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

  // 4. Streaks — seed dayMap, pass today/yesterday keys in caller's TZ.
  const dayMap = new Map(heatmap.map((b) => [b.date, b.sessions > 0]));
  const tzNow = new Date(now + tzOffsetMin * 60_000);
  const todayKey = tzNow.toISOString().slice(0, 10);
  const yNow = new Date(tzNow.getTime() - 86_400_000);
  const yesterdayKey = yNow.toISOString().slice(0, 10);
  const streaks = computeStreaks(dayMap, todayKey, yesterdayKey);

  return {
    heatmap,
    windows: { session5h, weekly, monthly },
    totals,
    byModel,
    streaks,
  };
}
