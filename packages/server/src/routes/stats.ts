/**
 * Stats route — GET /api/stats
 * Returns aggregated session activity: today, week, streak, model breakdown,
 * daily activity (last 30 days), and top projects.
 */

import { Hono } from "hono";
import { gte, sql, desc } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessions, projects } from "../db/schema.js";
import type { ApiResponse } from "@companion/shared";

export const statsRoutes = new Hono();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a YYYY-MM-DD string for a given Date in local time. */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns midnight UTC for a date offset by `daysBack` from today. */
function daysAgo(daysBack: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

// ─── GET /api/stats ───────────────────────────────────────────────────────────

statsRoutes.get("/", (c) => {
  const db = getDb();

  const todayStart = daysAgo(0);
  const weekStart = daysAgo(6); // last 7 days inclusive
  const thirtyDaysAgo = daysAgo(29); // last 30 days inclusive

  // ── All sessions in last 30 days ─────────────────────────────────────────
  const recentSessions = db
    .select({
      id: sessions.id,
      model: sessions.model,
      projectSlug: sessions.projectSlug,
      totalCostUsd: sessions.totalCostUsd,
      totalInputTokens: sessions.totalInputTokens,
      totalOutputTokens: sessions.totalOutputTokens,
      startedAt: sessions.startedAt,
    })
    .from(sessions)
    .where(gte(sessions.startedAt, thirtyDaysAgo))
    .all();

  // ── All sessions (for total count) ───────────────────────────────────────
  const totalCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .get();
  const totalSessions = totalCountRow?.count ?? 0;

  // ── Aggregate today / week ────────────────────────────────────────────────
  let todaySessions = 0;
  let todayTokens = 0;
  let todayCost = 0;
  let weekSessions = 0;
  let weekTokens = 0;
  let weekCost = 0;

  for (const s of recentSessions) {
    const startedAt = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt as number);
    const tokens = (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0);
    const cost = s.totalCostUsd ?? 0;

    if (startedAt >= weekStart) {
      weekSessions++;
      weekTokens += tokens;
      weekCost += cost;
    }
    if (startedAt >= todayStart) {
      todaySessions++;
      todayTokens += tokens;
      todayCost += cost;
    }
  }

  // ── Daily activity (last 30 days) ─────────────────────────────────────────
  const dailyMap = new Map<string, { sessions: number; tokens: number }>();

  // Seed all 30 days with zeros
  for (let i = 0; i < 30; i++) {
    const d = daysAgo(29 - i);
    dailyMap.set(toDateStr(d), { sessions: 0, tokens: 0 });
  }

  for (const s of recentSessions) {
    const startedAt = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt as number);
    const dateKey = toDateStr(startedAt);
    const existing = dailyMap.get(dateKey);
    if (existing) {
      existing.sessions++;
      existing.tokens += (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0);
    }
  }

  const dailyActivity = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    sessions: v.sessions,
    tokens: v.tokens,
  }));

  // ── Streak calculation ────────────────────────────────────────────────────
  // Collect all unique dates that have at least 1 session (across all history)
  const allDatesWithSessions = db
    .select({
      dateStr: sql<string>`date(started_at / 1000, 'unixepoch')`,
    })
    .from(sessions)
    .groupBy(sql`date(started_at / 1000, 'unixepoch')`)
    .orderBy(desc(sql`date(started_at / 1000, 'unixepoch')`))
    .all();

  const dateSet = new Set(allDatesWithSessions.map((r) => r.dateStr));

  let streak = 0;
  const today = toDateStr(new Date());

  // Start from today or yesterday (if no sessions today yet, streak can still be valid)
  const startCheckDate = dateSet.has(today) ? new Date() : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();

  let checkDate = new Date(startCheckDate);
  checkDate.setHours(0, 0, 0, 0);

  // Only count streak if at least today or yesterday had a session
  const checkDateStr = toDateStr(checkDate);
  if (dateSet.has(checkDateStr)) {
    streak = 1;
    let cursor = new Date(checkDate);
    cursor.setDate(cursor.getDate() - 1);

    while (dateSet.has(toDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // ── Model breakdown ───────────────────────────────────────────────────────
  const modelMap = new Map<string, { count: number; tokens: number }>();

  for (const s of recentSessions) {
    const model = s.model;
    const tokens = (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0);
    const existing = modelMap.get(model);
    if (existing) {
      existing.count++;
      existing.tokens += tokens;
    } else {
      modelMap.set(model, { count: 1, tokens });
    }
  }

  const modelBreakdown = Array.from(modelMap.entries())
    .map(([model, v]) => ({ model, count: v.count, tokens: v.tokens }))
    .sort((a, b) => b.count - a.count);

  // ── Top projects ──────────────────────────────────────────────────────────
  const projectMap = new Map<string, number>();

  for (const s of recentSessions) {
    const slug = s.projectSlug ?? "(no project)";
    projectMap.set(slug, (projectMap.get(slug) ?? 0) + 1);
  }

  // Fetch project display names for known slugs
  const knownProjectSlugs = Array.from(projectMap.keys()).filter((k) => k !== "(no project)");
  const projectNames = new Map<string, string>();

  if (knownProjectSlugs.length > 0) {
    const projectRows = db.select({ slug: projects.slug, name: projects.name }).from(projects).all();
    for (const p of projectRows) {
      projectNames.set(p.slug, p.name);
    }
  }

  const topProjects = Array.from(projectMap.entries())
    .map(([slug, count]) => ({
      name: projectNames.get(slug) ?? slug,
      sessions: count,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  // ── Response ──────────────────────────────────────────────────────────────
  return c.json({
    success: true,
    data: {
      today: {
        sessions: todaySessions,
        tokens: todayTokens,
        cost: Math.round(todayCost * 10000) / 10000,
      },
      week: {
        sessions: weekSessions,
        tokens: weekTokens,
        cost: Math.round(weekCost * 10000) / 10000,
      },
      streak,
      totalSessions,
      modelBreakdown,
      dailyActivity,
      topProjects,
    },
  } satisfies ApiResponse);
});
