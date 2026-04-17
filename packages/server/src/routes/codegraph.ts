/**
 * CodeGraph REST routes — scan control, stats, search, and graph queries.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
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
  enrichCommunitiesWithAILabels,
} from "../codegraph/analysis.js";
import { analyzeImpact } from "../codegraph/impact-analyzer.js";
import { getSessionActivity, getRecentReindexEvents } from "../codegraph/event-collector.js";
import { generateSkills } from "../codegraph/skills-generator.js";
import {
  generateArchitectureDiagram,
  generateModuleDiagram,
  generateFlowDiagram,
} from "../codegraph/diagram-generator.js";
import { getDb } from "../db/client.js";
import { codegraphConfig } from "../db/schema.js";
import type { ApiResponse } from "@companion/shared";

export const codegraphRoutes = new Hono();

// ─── Validation Schemas ─────────────────────────────────────────────────

/** Shared schema for routes that only need projectSlug */
const projectSlugSchema = z.object({ projectSlug: z.string().min(1) });

const rescanSchema = z.object({
  projectSlug: z.string().min(1),
  files: z.array(z.string()).optional(),
});

const configSchema = z.object({
  projectSlug: z.string().min(1),
  injectionEnabled: z.boolean().optional(),
  projectMapEnabled: z.boolean().optional(),
  messageContextEnabled: z.boolean().optional(),
  planReviewEnabled: z.boolean().optional(),
  breakCheckEnabled: z.boolean().optional(),
  webDocsEnabled: z.boolean().optional(),
  autoReindexEnabled: z.boolean().optional(),
  excludePatterns: z.array(z.string()).optional(),
  maxContextTokens: z.number().int().positive().optional(),
});

// ─── Scan Control ───────────────────────────────────────────────────────

/** POST /codegraph/scan — start a full scan */
codegraphRoutes.post("/scan", async (c) => {
  const parsed = projectSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      } satisfies ApiResponse,
      400,
    );
  }
  const { projectSlug } = parsed.data;

  try {
    const jobId = await scanProject(projectSlug);
    return c.json({ success: true, data: { jobId } } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/rescan — incremental rescan */
codegraphRoutes.post("/rescan", async (c) => {
  const parsed = rescanSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      } satisfies ApiResponse,
      400,
    );
  }
  const { projectSlug, files } = parsed.data;

  try {
    const result = await incrementalRescan(projectSlug, files);
    return c.json({ success: true, data: result } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/describe — generate semantic descriptions */
codegraphRoutes.post("/describe", async (c) => {
  const parsed = projectSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      } satisfies ApiResponse,
      400,
    );
  }
  const { projectSlug } = parsed.data;

  try {
    const described = await describeNodes(projectSlug);
    return c.json({ success: true, data: { described } } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Operation failed" } satisfies ApiResponse, 400);
  }
});

/** POST /codegraph/cancel — cancel active scan */
codegraphRoutes.post("/cancel", async (c) => {
  const parsed = projectSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      } satisfies ApiResponse,
      400,
    );
  }
  const { projectSlug } = parsed.data;

  const cancelled = cancelScan(projectSlug);
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

/** GET /codegraph/stats?project=slug — graph statistics + community summary */
codegraphRoutes.get("/stats", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const stats = getProjectStats(project);

  // Enrich with community summary (sync — uses cached Leiden results)
  const communities = detectCommunities(project);
  const topCommunities = communities
    .filter((c) => c.nodeCount >= 3)
    .slice(0, 5)
    .map((c) => ({ label: c.label, nodeCount: c.nodeCount, cohesion: c.cohesion }));

  return c.json({
    success: true,
    data: {
      ...stats,
      communityCount: communities.length,
      topCommunities,
    },
  } satisfies ApiResponse);
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
        edges: edges.filter((e) => nodeIdSet.has(e.sourceNodeId) && nodeIdSet.has(e.targetNodeId)),
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

  const filePaths = filesParam
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (filePaths.length === 0) {
    return c.json({ success: true, data: [] } satisfies ApiResponse);
  }
  if (filePaths.length > 100) {
    return c.json({ success: false, error: "Too many files (max 100)" } satisfies ApiResponse, 400);
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

/** GET /codegraph/communities?project=slug&ai=true — community detection */
codegraphRoutes.get("/communities", async (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  const useAI = c.req.query("ai") === "true";
  const communities = useAI
    ? await enrichCommunitiesWithAILabels(project)
    : detectCommunities(project);
  return c.json({ success: true, data: communities } satisfies ApiResponse);
});

// ─── Impact Analysis ──────────────────────────────────────────────────

/** POST /codegraph/impact-analysis — pre-commit change impact analysis */
codegraphRoutes.post("/impact-analysis", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const project = (body.project ?? body.projectSlug) as string | undefined;

  if (!project) {
    return c.json(
      { success: false, error: "project field required" } satisfies ApiResponse,
      400,
    );
  }

  const files = Array.isArray(body.files) ? body.files as string[] : undefined;
  const projectDir = typeof body.projectDir === "string" ? body.projectDir : undefined;
  const since = typeof body.since === "string" ? body.since : undefined;
  const maxDepth = typeof body.maxDepth === "number" ? Math.min(body.maxDepth, 5) : undefined;

  const report = analyzeImpact(project, { files, projectDir, since, maxDepth });
  return c.json({ success: true, data: report } satisfies ApiResponse);
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
    autoReindexEnabled: true,
    excludePatterns: [],
    maxContextTokens: 800,
    updatedAt: new Date().toISOString(),
  };

  return c.json({ success: true, data: config } satisfies ApiResponse);
});

/** PUT /codegraph/config — update injection config */
codegraphRoutes.put("/config", async (c) => {
  const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid body",
      } satisfies ApiResponse,
      400,
    );
  }
  const body = parsed.data;

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
        ...(body.autoReindexEnabled !== undefined && { autoReindexEnabled: body.autoReindexEnabled }),
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
        autoReindexEnabled: body.autoReindexEnabled ?? true,
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

// ─── Auto-Reindex Activity ─────────────────────────────────────────────

/** GET /codegraph/reindex-events — recent auto-reindex events */
codegraphRoutes.get("/reindex-events", (c) => {
  const project = c.req.query("project");
  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }
  const rawLimit = Number(c.req.query("limit") ?? 10);
  const limit = isNaN(rawLimit) ? 10 : Math.min(Math.max(rawLimit, 1), 50);
  const events = getRecentReindexEvents(project, limit);
  return c.json({ success: true, data: events } satisfies ApiResponse);
});

// ─── Skills Generation ─────────────────────────────────────────────────

/** POST /codegraph/generate-skills — generate .claude/skills/ from graph data */
codegraphRoutes.post("/generate-skills", async (c) => {
  const parsed = projectSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid body — requires projectSlug" } satisfies ApiResponse,
      400,
    );
  }

  try {
    const result = generateSkills(parsed.data.projectSlug);
    return c.json({ success: true, data: result } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      { success: false, error: String(err) } satisfies ApiResponse,
      500,
    );
  }
});

// ─── Architecture Diagrams ─────────────────────────────────────────────

/** GET /codegraph/diagram — generate Mermaid diagrams from code graph */
codegraphRoutes.get("/diagram", (c) => {
  const project = c.req.query("project")?.trim();
  const type = c.req.query("type")?.trim() ?? "architecture";

  if (!project) {
    return c.json(
      { success: false, error: "project query param required" } satisfies ApiResponse,
      400,
    );
  }

  try {
    switch (type) {
      case "architecture": {
        const result = generateArchitectureDiagram(project);
        return c.json({ success: true, data: result } satisfies ApiResponse);
      }
      case "module": {
        const file = c.req.query("file");
        if (!file) {
          return c.json(
            { success: false, error: "file query param required for module diagram" } satisfies ApiResponse,
            400,
          );
        }
        const result = generateModuleDiagram(project, file);
        return c.json({ success: true, data: result } satisfies ApiResponse);
      }
      case "flow": {
        const symbol = c.req.query("symbol");
        if (!symbol) {
          return c.json(
            { success: false, error: "symbol query param required for flow diagram" } satisfies ApiResponse,
            400,
          );
        }
        const result = generateFlowDiagram(project, symbol);
        return c.json({ success: true, data: result } satisfies ApiResponse);
      }
      default:
        return c.json(
          { success: false, error: `Unknown diagram type: ${type}. Use: architecture, module, flow` } satisfies ApiResponse,
          400,
        );
    }
  } catch (err) {
    return c.json(
      { success: false, error: String(err) } satisfies ApiResponse,
      500,
    );
  }
});
