/**
 * CodeGraph REST routes — scan control, stats, search, and graph queries.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  scanProject,
  getScanStatus,
  isGraphReady,
  getProjectStats,
  cancelScan,
} from "../codegraph/index.js";
import { describeNodes } from "../codegraph/semantic-describer.js";
import { incrementalRescan } from "../codegraph/diff-updater.js";
import { getNodeEdges, getProjectNodes, getProjectEdges } from "../codegraph/graph-store.js";
import {
  getImpactRadius,
  getReverseDependencies,
  getRelatedNodes,
  getHotFiles,
} from "../codegraph/query-engine.js";
import { getExternalPackages, getPackageUsageCounts } from "../codegraph/webintel-bridge.js";
import {
  fusedSearch,
  computeRiskScores,
  traceExecutionFlows,
  detectCommunities,
} from "../codegraph/analysis.js";
import { getSessionActivity } from "../codegraph/event-collector.js";
import { getDb } from "../db/client.js";
import { codegraphConfig } from "../db/schema.js";
import type { ApiResponse } from "@companion/shared";

export const codegraphRoutes = new Hono();

// ─── Scan Control ───────────────────────────────────────────────────────

/** POST /codegraph/scan — start a full scan */
codegraphRoutes.post("/scan", async (c) => {
  const body = await c.req.json<{ projectSlug?: string }>();
  if (!body.projectSlug) {
    return c.json({ success: false, error: "projectSlug is required" } satisfies ApiResponse, 400);
  }

  try {
    const jobId = await scanProject(body.projectSlug);
    return c.json({ success: true, data: { jobId } } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/rescan — incremental rescan */
codegraphRoutes.post("/rescan", async (c) => {
  const body = await c.req.json<{ projectSlug?: string; files?: string[] }>();
  if (!body.projectSlug) {
    return c.json({ success: false, error: "projectSlug is required" } satisfies ApiResponse, 400);
  }

  try {
    const result = await incrementalRescan(body.projectSlug, body.files);
    return c.json({ success: true, data: result } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/describe — generate semantic descriptions */
codegraphRoutes.post("/describe", async (c) => {
  const body = await c.req.json<{ projectSlug?: string }>();
  if (!body.projectSlug) {
    return c.json({ success: false, error: "projectSlug is required" } satisfies ApiResponse, 400);
  }

  try {
    const described = await describeNodes(body.projectSlug);
    return c.json({ success: true, data: { described } } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/cancel — cancel active scan */
codegraphRoutes.post("/cancel", async (c) => {
  const body = await c.req.json<{ projectSlug?: string }>();
  if (!body.projectSlug) {
    return c.json({ success: false, error: "projectSlug is required" } satisfies ApiResponse, 400);
  }

  const cancelled = cancelScan(body.projectSlug);
  return c.json({ success: true, data: { cancelled } } satisfies ApiResponse);
});

// ─── Status & Stats ─────────────────────────────────────────────────────

/** GET /codegraph/status?project=slug — scan status */
codegraphRoutes.get("/status", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const job = getScanStatus(project);
  const ready = isGraphReady(project);

  return c.json({
    success: true,
    data: { ready, job: job ?? null },
  } satisfies ApiResponse);
});

/** GET /codegraph/stats?project=slug — graph statistics */
codegraphRoutes.get("/stats", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const stats = getProjectStats(project);
  return c.json({ success: true, data: stats } satisfies ApiResponse);
});

// ─── Query ──────────────────────────────────────────────────────────────

/** GET /codegraph/search?project=slug&q=keyword&mode=fused|legacy — search symbols */
codegraphRoutes.get("/search", (c) => {
  const project = c.req.query("project");
  const query = c.req.query("q");
  const mode = c.req.query("mode") ?? "fused";

  if (!project || !query) {
    return c.json(
      { success: false, error: "project and q params required" } satisfies ApiResponse,
      400,
    );
  }

  if (query.length > 200) {
    return c.json(
      { success: false, error: "Query too long (max 200 chars)" } satisfies ApiResponse,
      400,
    );
  }

  // Use RRF fused search by default, fallback to legacy for backward compat
  if (mode === "legacy") {
    const keywords = query.split(/\s+/).filter((k) => k.length >= 2);
    const nodes = getRelatedNodes(project, keywords, 10);
    return c.json({ success: true, data: nodes } satisfies ApiResponse);
  }

  try {
    const results = fusedSearch(project, query, 15);
    return c.json({ success: true, data: results } satisfies ApiResponse);
  } catch {
    // Fallback to legacy search if FTS5 not yet available
    const keywords = query.split(/\s+/).filter((k) => k.length >= 2);
    const nodes = getRelatedNodes(project, keywords, 10);
    return c.json({ success: true, data: nodes } satisfies ApiResponse);
  }
});

/** GET /codegraph/node/:id/edges — get edges for a node */
codegraphRoutes.get("/node/:id/edges", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ success: false, error: "Invalid node ID" } satisfies ApiResponse, 400);
  }

  const edges = getNodeEdges(id);
  return c.json({ success: true, data: edges } satisfies ApiResponse);
});

/** GET /codegraph/impact?project=slug&file=path — impact radius */
codegraphRoutes.get("/impact", (c) => {
  const project = c.req.query("project");
  const file = c.req.query("file");

  if (!project || !file) {
    return c.json(
      { success: false, error: "project and file params required" } satisfies ApiResponse,
      400,
    );
  }

  const impact = getImpactRadius(project, file, { maxDepth: 2, minTrust: 0.3 });
  return c.json({ success: true, data: impact } satisfies ApiResponse);
});

/** GET /codegraph/reverse-deps?project=slug&file=path — reverse dependencies */
codegraphRoutes.get("/reverse-deps", (c) => {
  const project = c.req.query("project");
  const file = c.req.query("file");

  if (!project || !file) {
    return c.json(
      { success: false, error: "project and file params required" } satisfies ApiResponse,
      400,
    );
  }

  const deps = getReverseDependencies(project, file);
  return c.json({ success: true, data: deps } satisfies ApiResponse);
});

/** GET /codegraph/hot-files?project=slug — most coupled files */
codegraphRoutes.get("/hot-files", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const rawLimit = parseInt(c.req.query("limit") ?? "10", 10);
  const limit = Math.min(isNaN(rawLimit) ? 10 : rawLimit, 50);
  const files = getHotFiles(project, limit);
  return c.json({ success: true, data: files } satisfies ApiResponse);
});

// ─── Bridge: CodeGraph ↔ WebIntel ───────────────────────────────────────

/** GET /codegraph/packages?project=slug — external package dependencies */
codegraphRoutes.get("/packages", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const packages = getExternalPackages(project);
  const counts = getPackageUsageCounts(project);

  const data = packages.map((pkg) => ({
    name: pkg,
    fileCount: counts.get(pkg) ?? 0,
  }));

  return c.json({ success: true, data } satisfies ApiResponse);
});

// ─── Graph Data (for visualization) ────────────────────────────────────

/** GET /codegraph/graph?project=slug — full graph nodes + edges for visualization */
codegraphRoutes.get("/graph", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const nodes = getProjectNodes(project);
  const edges = getProjectEdges(project);

  // Limit for performance — warn if too large
  const MAX_NODES = 500;
  if (nodes.length > MAX_NODES) {
    const truncatedNodes = nodes.slice(0, MAX_NODES);
    const nodeIdSet = new Set(truncatedNodes.map((n) => n.id));
    return c.json({
      success: true,
      data: {
        nodes: truncatedNodes,
        edges: edges.filter(
          (e) => nodeIdSet.has(e.sourceNodeId) && nodeIdSet.has(e.targetNodeId),
        ),
        truncated: true,
        totalNodes: nodes.length,
      },
    } satisfies ApiResponse);
  }

  return c.json({
    success: true,
    data: { nodes, edges, truncated: false, totalNodes: nodes.length },
  } satisfies ApiResponse);
});

// ─── Analysis ──────────────────────────────────────────────────────────

/** GET /codegraph/risk?project=slug&files=path1,path2 — blast radius risk scores */
codegraphRoutes.get("/risk", (c) => {
  const project = c.req.query("project");
  const filesParam = c.req.query("files");

  if (!project || !filesParam) {
    return c.json(
      { success: false, error: "project and files params required" } satisfies ApiResponse,
      400,
    );
  }

  const filePaths = filesParam.split(",").map((f) => f.trim()).filter(Boolean);
  if (filePaths.length === 0) {
    return c.json({ success: true, data: [] } satisfies ApiResponse);
  }
  if (filePaths.length > 100) {
    return c.json(
      { success: false, error: "Too many files (max 100)" } satisfies ApiResponse,
      400,
    );
  }

  const scores = computeRiskScores(project, filePaths);
  return c.json({ success: true, data: scores } satisfies ApiResponse);
});

/** GET /codegraph/flows?project=slug — execution flow tracing */
codegraphRoutes.get("/flows", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const rawDepth = parseInt(c.req.query("maxDepth") ?? "15", 10);
  const rawFlows = parseInt(c.req.query("maxFlows") ?? "30", 10);
  const maxDepth = Math.min(isNaN(rawDepth) ? 15 : rawDepth, 20);
  const maxFlows = Math.min(isNaN(rawFlows) ? 30 : rawFlows, 100);

  const flows = traceExecutionFlows(project, { maxDepth, maxFlows });
  return c.json({ success: true, data: flows } satisfies ApiResponse);
});

/** GET /codegraph/communities?project=slug — community detection */
codegraphRoutes.get("/communities", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const communities = detectCommunities(project);
  return c.json({ success: true, data: communities } satisfies ApiResponse);
});

// ─── Config ────────────────────────────────────────────────────────────

/** GET /codegraph/config?project=slug — get injection config */
codegraphRoutes.get("/config", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const db = getDb();
  const row = db
    .select()
    .from(codegraphConfig)
    .where(eq(codegraphConfig.projectSlug, project))
    .get();

  // Return defaults if no config exists
  const config = row ?? {
    projectSlug: project,
    injectionEnabled: true,
    projectMapEnabled: true,
    messageContextEnabled: true,
    planReviewEnabled: true,
    breakCheckEnabled: true,
    webDocsEnabled: true,
    excludePatterns: [],
    maxContextTokens: 800,
    updatedAt: new Date().toISOString(),
  };

  return c.json({ success: true, data: config } satisfies ApiResponse);
});

/** PUT /codegraph/config — update injection config */
codegraphRoutes.put("/config", async (c) => {
  const body = await c.req.json<{
    projectSlug?: string;
    injectionEnabled?: boolean;
    projectMapEnabled?: boolean;
    messageContextEnabled?: boolean;
    planReviewEnabled?: boolean;
    breakCheckEnabled?: boolean;
    webDocsEnabled?: boolean;
    excludePatterns?: string[];
    maxContextTokens?: number;
  }>();

  if (!body.projectSlug) {
    return c.json({ success: false, error: "projectSlug is required" } satisfies ApiResponse, 400);
  }

  const db = getDb();
  const existing = db
    .select()
    .from(codegraphConfig)
    .where(eq(codegraphConfig.projectSlug, body.projectSlug))
    .get();

  const now = new Date().toISOString();

  if (existing) {
    db.update(codegraphConfig)
      .set({
        ...(body.injectionEnabled !== undefined && { injectionEnabled: body.injectionEnabled }),
        ...(body.projectMapEnabled !== undefined && { projectMapEnabled: body.projectMapEnabled }),
        ...(body.messageContextEnabled !== undefined && {
          messageContextEnabled: body.messageContextEnabled,
        }),
        ...(body.planReviewEnabled !== undefined && { planReviewEnabled: body.planReviewEnabled }),
        ...(body.breakCheckEnabled !== undefined && { breakCheckEnabled: body.breakCheckEnabled }),
        ...(body.webDocsEnabled !== undefined && { webDocsEnabled: body.webDocsEnabled }),
        ...(body.excludePatterns !== undefined && { excludePatterns: body.excludePatterns }),
        ...(body.maxContextTokens !== undefined && { maxContextTokens: body.maxContextTokens }),
        updatedAt: now,
      })
      .where(eq(codegraphConfig.projectSlug, body.projectSlug))
      .run();
  } else {
    db.insert(codegraphConfig)
      .values({
        projectSlug: body.projectSlug,
        injectionEnabled: body.injectionEnabled ?? true,
        projectMapEnabled: body.projectMapEnabled ?? true,
        messageContextEnabled: body.messageContextEnabled ?? true,
        planReviewEnabled: body.planReviewEnabled ?? true,
        breakCheckEnabled: body.breakCheckEnabled ?? true,
        webDocsEnabled: body.webDocsEnabled ?? true,
        excludePatterns: body.excludePatterns ?? [],
        maxContextTokens: body.maxContextTokens ?? 800,
        updatedAt: now,
      })
      .run();
  }

  const updated = db
    .select()
    .from(codegraphConfig)
    .where(eq(codegraphConfig.projectSlug, body.projectSlug))
    .get();

  return c.json({ success: true, data: updated } satisfies ApiResponse);
});

// ─── Live Activity ──────────────────────────────────────────────────────

/** GET /codegraph/activity/:sessionId — session graph activity summary */
codegraphRoutes.get("/activity/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const activity = getSessionActivity(sessionId);
  return c.json({ success: true, data: activity } satisfies ApiResponse);
});
