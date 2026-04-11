/**
 * Stats route — GET /api/stats
 * Returns aggregated session activity: today, week, streak, model breakdown,
 * daily activity (last 30 days), and top projects.
 */

import { Hono } from "hono";
import { gte, sql, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  sessions,
  projects,
  codeFiles,
  codeNodes,
  codeEdges,
  codeScanJobs,
  contextInjectionLog,
} from "../db/schema.js";
import { listDomains, listRawFiles } from "../wiki/store.js";
import { lintDomain } from "../wiki/linter.js";
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
      endedAt: sessions.endedAt,
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
  const startCheckDate = dateSet.has(today)
    ? new Date()
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
      })();

  const checkDate = new Date(startCheckDate);
  checkDate.setHours(0, 0, 0, 0);

  // Only count streak if at least today or yesterday had a session
  const checkDateStr = toDateStr(checkDate);
  if (dateSet.has(checkDateStr)) {
    streak = 1;
    const cursor = new Date(checkDate);
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
    const projectRows = db
      .select({ slug: projects.slug, name: projects.name })
      .from(projects)
      .all();
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

  // ── Daily cost trend (last 30 days) ────────────────────────────────────
  const dailyCostMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    dailyCostMap.set(toDateStr(daysAgo(29 - i)), 0);
  }
  for (const s of recentSessions) {
    const startedAt = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt as number);
    const dateKey = toDateStr(startedAt);
    const prev = dailyCostMap.get(dateKey);
    if (prev !== undefined) {
      dailyCostMap.set(dateKey, prev + (s.totalCostUsd ?? 0));
    }
  }
  const dailyCost = Array.from(dailyCostMap.entries()).map(([date, cost]) => ({
    date,
    cost: Math.round(cost * 10000) / 10000,
  }));

  // ── Recent sessions detail (last 20) ─────────────────────────────────
  const recentDetail = db
    .select({
      id: sessions.id,
      name: sessions.name,
      model: sessions.model,
      projectSlug: sessions.projectSlug,
      source: sessions.source,
      totalCostUsd: sessions.totalCostUsd,
      numTurns: sessions.numTurns,
      totalInputTokens: sessions.totalInputTokens,
      totalOutputTokens: sessions.totalOutputTokens,
      rtkTokensSaved: sessions.rtkTokensSaved,
      filesModified: sessions.filesModified,
      filesCreated: sessions.filesCreated,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .orderBy(desc(sessions.startedAt))
    .limit(20)
    .all()
    .map((s) => {
      const start = s.startedAt instanceof Date ? s.startedAt.getTime() : (s.startedAt as number);
      const end = s.endedAt instanceof Date ? s.endedAt.getTime() : (s.endedAt as number | null);
      return {
        id: s.id,
        name: s.name,
        model: s.model,
        projectSlug: s.projectSlug,
        source: s.source ?? "api",
        startedAt: start,
        cost: Math.round((s.totalCostUsd ?? 0) * 10000) / 10000,
        turns: s.numTurns ?? 0,
        tokens: (s.totalInputTokens ?? 0) + (s.totalOutputTokens ?? 0),
        durationMs: end ? end - start : null,
        rtkTokensSaved: s.rtkTokensSaved ?? 0,
        filesModified: (s.filesModified as string[] | null) ?? [],
        filesCreated: (s.filesCreated as string[] | null) ?? [],
      };
    });

  // ── Average session duration (last 30 days, ended only) ──────────────
  const endedRecent = recentSessions.filter((s) => s.endedAt != null);

  let avgDurationMs = 0;
  if (endedRecent.length > 0) {
    const totalDuration = endedRecent.reduce((sum, s) => {
      const start = s.startedAt instanceof Date ? s.startedAt.getTime() : (s.startedAt as number);
      const end =
        s.endedAt instanceof Date ? s.endedAt!.getTime() : (s.endedAt as unknown as number);
      return sum + (end - start);
    }, 0);
    avgDurationMs = Math.round(totalDuration / endedRecent.length);
  }

  // ── RTK summary (last 30 days) ────────────────────────────────────────
  const rtkRow = db
    .select({
      totalTokensSaved: sql<number>`coalesce(sum(${sessions.rtkTokensSaved}), 0)`,
      totalCompressions: sql<number>`coalesce(sum(${sessions.rtkCompressions}), 0)`,
      totalCacheHits: sql<number>`coalesce(sum(${sessions.rtkCacheHits}), 0)`,
    })
    .from(sessions)
    .where(gte(sessions.startedAt, thirtyDaysAgo))
    .get();

  const totalTokensSaved = rtkRow?.totalTokensSaved ?? 0;
  const totalCompressions = rtkRow?.totalCompressions ?? 0;
  const totalCacheHits = rtkRow?.totalCacheHits ?? 0;

  // Estimate cost saved using weighted average rate from model breakdown
  const MODEL_INPUT_RATES: Record<string, number> = {
    "claude-haiku-4-5": 0.8 / 1_000_000,
    "claude-sonnet-4-6": 3.0 / 1_000_000,
    "claude-opus-4-6": 15.0 / 1_000_000,
  };
  const totalModelSessions = modelBreakdown.reduce((s, m) => s + m.count, 0);
  const weightedRate =
    totalModelSessions > 0
      ? modelBreakdown.reduce((sum, m) => {
          const rate = MODEL_INPUT_RATES[m.model] ?? MODEL_INPUT_RATES["claude-sonnet-4-6"]!;
          return sum + rate * m.count;
        }, 0) / totalModelSessions
      : MODEL_INPUT_RATES["claude-sonnet-4-6"]!;

  const rtkSummary = {
    totalTokensSaved,
    totalCompressions,
    totalCacheHits,
    cacheHitRate:
      totalCompressions > 0 ? Math.round((totalCacheHits / totalCompressions) * 100) : 0,
    estimatedCostSaved: Math.round(totalTokensSaved * weightedRate * 10000) / 10000,
  };

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
      dailyCost,
      topProjects,
      recentSessions: recentDetail,
      avgDurationMs,
      rtkSummary,
    },
  } satisfies ApiResponse);
});

// ─── GET /api/stats/features ─────────────────────────────────────────────────

statsRoutes.get("/features", (c) => {
  const db = getDb();
  const thirtyDaysAgo = daysAgo(29);

  // ── RTK daily breakdown (last 30d) ──────────────────────────────────────
  const rtkDailyMap = new Map<string, { tokensSaved: number; compressions: number }>();
  for (let i = 0; i < 30; i++) {
    rtkDailyMap.set(toDateStr(daysAgo(29 - i)), { tokensSaved: 0, compressions: 0 });
  }

  const rtkSessions = db
    .select({
      startedAt: sessions.startedAt,
      rtkTokensSaved: sessions.rtkTokensSaved,
      rtkCompressions: sessions.rtkCompressions,
      rtkCacheHits: sessions.rtkCacheHits,
      model: sessions.model,
    })
    .from(sessions)
    .where(gte(sessions.startedAt, thirtyDaysAgo))
    .all();

  let rtkTotalSaved = 0;
  let rtkTotalCompressions = 0;
  let rtkTotalCacheHits = 0;

  for (const s of rtkSessions) {
    const startedAt = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt as number);
    const dateKey = toDateStr(startedAt);
    const entry = rtkDailyMap.get(dateKey);
    if (entry) {
      entry.tokensSaved += s.rtkTokensSaved ?? 0;
      entry.compressions += s.rtkCompressions ?? 0;
    }
    rtkTotalSaved += s.rtkTokensSaved ?? 0;
    rtkTotalCompressions += s.rtkCompressions ?? 0;
    rtkTotalCacheHits += s.rtkCacheHits ?? 0;
  }

  const MODEL_INPUT_RATES: Record<string, number> = {
    "claude-haiku-4-5": 0.8 / 1_000_000,
    "claude-sonnet-4-6": 3.0 / 1_000_000,
    "claude-opus-4-6": 15.0 / 1_000_000,
  };
  const modelCounts = new Map<string, number>();
  for (const s of rtkSessions) modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
  const totalModels = rtkSessions.length || 1;
  let weightedRate = 0;
  for (const [model, count] of modelCounts) {
    weightedRate += (MODEL_INPUT_RATES[model] ?? MODEL_INPUT_RATES["claude-sonnet-4-6"]!) * count;
  }
  weightedRate /= totalModels;

  const rtkDaily = Array.from(rtkDailyMap.entries()).map(([date, v]) => ({
    date,
    tokensSaved: v.tokensSaved,
    compressions: v.compressions,
  }));

  // ── Wiki KB summary ─────────────────────────────────────────────────────
  const wikiDomains: Array<{
    slug: string;
    name: string;
    articleCount: number;
    totalTokens: number;
    staleCount: number;
    lastCompiledAt: string | null;
    rawPending: number;
  }> = [];
  let wikiTotalArticles = 0;
  let wikiTotalTokens = 0;

  try {
    const domains = listDomains();
    for (const d of domains) {
      const rawFiles = listRawFiles(d.slug);
      const rawPending = rawFiles.filter((f) => !f.compiled).length;

      let staleCount = 0;
      try {
        const lint = lintDomain(d.slug);
        staleCount = lint.issues.filter((i) => i.code === "stale_article").length;
      } catch {
        // linter may fail if domain is empty
      }

      wikiDomains.push({
        slug: d.slug,
        name: d.name,
        articleCount: d.articleCount,
        totalTokens: d.totalTokens,
        staleCount,
        lastCompiledAt: d.lastCompiledAt,
        rawPending,
      });
      wikiTotalArticles += d.articleCount;
      wikiTotalTokens += d.totalTokens;
    }
  } catch {
    // Wiki not initialized — return empty
  }

  // ── CodeGraph summary ───────────────────────────────────────────────────
  const cgProjects: Array<{
    slug: string;
    files: number;
    nodes: number;
    edges: number;
    lastScannedAt: string | null;
    coveragePercent: number;
  }> = [];

  try {
    const latestScans = db
      .select({
        projectSlug: codeScanJobs.projectSlug,
        completedAt: sql<number>`max(${codeScanJobs.completedAt})`,
      })
      .from(codeScanJobs)
      .where(eq(codeScanJobs.status, "done"))
      .groupBy(codeScanJobs.projectSlug)
      .all();

    for (const scan of latestScans) {
      const slug = scan.projectSlug;
      const fileCount =
        db
          .select({ count: sql<number>`count(*)` })
          .from(codeFiles)
          .where(eq(codeFiles.projectSlug, slug))
          .get()?.count ?? 0;
      const nodeCount =
        db
          .select({ count: sql<number>`count(*)` })
          .from(codeNodes)
          .where(eq(codeNodes.projectSlug, slug))
          .get()?.count ?? 0;
      const edgeCount =
        db
          .select({ count: sql<number>`count(*)` })
          .from(codeEdges)
          .where(eq(codeEdges.projectSlug, slug))
          .get()?.count ?? 0;

      const filesWithNodes =
        db
          .select({ count: sql<number>`count(distinct ${codeNodes.fileId})` })
          .from(codeNodes)
          .where(eq(codeNodes.projectSlug, slug))
          .get()?.count ?? 0;
      const coveragePercent = fileCount > 0 ? Math.round((filesWithNodes / fileCount) * 100) : 0;

      const completedAt = scan.completedAt;
      cgProjects.push({
        slug,
        files: fileCount,
        nodes: nodeCount,
        edges: edgeCount,
        lastScannedAt: completedAt ? new Date(completedAt).toISOString() : null,
        coveragePercent,
      });
    }
  } catch {
    // CodeGraph tables may not exist yet
  }

  // ── AI Context Injection stats ─────────────────────────────────────────
  let contextTotalInjections = 0;
  let contextTotalTokens = 0;
  const contextByType = new Map<string, { count: number; tokens: number }>();
  const contextDailyMap = new Map<string, { injections: number; tokens: number }>();

  for (let i = 0; i < 30; i++) {
    contextDailyMap.set(toDateStr(daysAgo(29 - i)), { injections: 0, tokens: 0 });
  }

  try {
    const rows = db
      .select({
        injectionType: contextInjectionLog.injectionType,
        tokenCount: contextInjectionLog.tokenCount,
        createdAt: contextInjectionLog.createdAt,
      })
      .from(contextInjectionLog)
      .where(gte(contextInjectionLog.createdAt, thirtyDaysAgo))
      .all();

    for (const r of rows) {
      contextTotalInjections++;
      contextTotalTokens += r.tokenCount ?? 0;

      const type = r.injectionType;
      const existing = contextByType.get(type);
      if (existing) {
        existing.count++;
        existing.tokens += r.tokenCount ?? 0;
      } else {
        contextByType.set(type, { count: 1, tokens: r.tokenCount ?? 0 });
      }

      const ts = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as number);
      const dateKey = toDateStr(ts);
      const daily = contextDailyMap.get(dateKey);
      if (daily) {
        daily.injections++;
        daily.tokens += r.tokenCount ?? 0;
      }
    }
  } catch {
    // table may not exist yet
  }

  const contextDaily = Array.from(contextDailyMap.entries()).map(([date, v]) => ({
    date,
    injections: v.injections,
    tokens: v.tokens,
  }));

  const contextTypeBreakdown = Array.from(contextByType.entries())
    .map(([type, v]) => ({ type, count: v.count, tokens: v.tokens }))
    .sort((a, b) => b.count - a.count);

  // Top sessions by injection count
  let contextTopSessions: Array<{ sessionId: string; injections: number; tokens: number }> = [];
  try {
    contextTopSessions = db
      .select({
        sessionId: contextInjectionLog.sessionId,
        injections: sql<number>`count(*)`,
        tokens: sql<number>`coalesce(sum(${contextInjectionLog.tokenCount}), 0)`,
      })
      .from(contextInjectionLog)
      .where(gte(contextInjectionLog.createdAt, thirtyDaysAgo))
      .groupBy(contextInjectionLog.sessionId)
      .orderBy(desc(sql`count(*)`))
      .limit(10)
      .all();
  } catch {
    // table may not exist yet
  }

  return c.json({
    success: true,
    data: {
      rtk: {
        daily: rtkDaily,
        totalTokensSaved: rtkTotalSaved,
        totalCompressions: rtkTotalCompressions,
        cacheHitRate:
          rtkTotalCompressions > 0
            ? Math.round((rtkTotalCacheHits / rtkTotalCompressions) * 100)
            : 0,
        estimatedCostSaved: Math.round(rtkTotalSaved * weightedRate * 10000) / 10000,
      },
      wiki: {
        domains: wikiDomains,
        totalArticles: wikiTotalArticles,
        totalTokens: wikiTotalTokens,
      },
      codegraph: {
        projects: cgProjects,
      },
      context: {
        totalInjections: contextTotalInjections,
        totalTokens: contextTotalTokens,
        typeBreakdown: contextTypeBreakdown,
        daily: contextDaily,
        topSessions: contextTopSessions,
      },
    },
  } satisfies ApiResponse);
});
