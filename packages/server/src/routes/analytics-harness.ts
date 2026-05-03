/**
 * Analytics endpoints backing the Harness Usage panel.
 *
 *   POST /api/analytics/harness/log   ← MCP server appends one event
 *   GET  /api/analytics/harness/usage  ← aggregate per tool over a window
 */

import { Hono } from "hono";
import {
  recordHarnessMetric,
  aggregateUsage,
  buildTimeline,
} from "../services/harness-metrics-logger.js";
import type { ApiResponse, HarnessMetric, HarnessMetricOutcome } from "@companion/shared";

const MAX_TOOL_LEN = 64;
const MAX_ERROR_LEN = 200;
const MAX_RANGE_DAYS = 90;

export const analyticsHarnessRoutes = new Hono();

/**
 * POST /api/analytics/harness/log
 * Body: HarnessMetric (validated + sanitised). Fire-and-forget; never blocks.
 */
analyticsHarnessRoutes.post("/log", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
  }

  const tool = typeof body.tool === "string" ? body.tool.slice(0, MAX_TOOL_LEN) : "";
  if (!tool) {
    return c.json({ success: false, error: "`tool` is required" } satisfies ApiResponse, 400);
  }

  const outcomeRaw = typeof body.outcome === "string" ? body.outcome : "ok";
  const outcome: HarnessMetricOutcome =
    outcomeRaw === "ok" || outcomeRaw === "error" || outcomeRaw === "timeout" ? outcomeRaw : "ok";

  const metric: HarnessMetric = {
    ts: typeof body.ts === "number" && Number.isFinite(body.ts) ? body.ts : Date.now(),
    tool,
    durationMs: clampNumber(body.durationMs, 0, 600_000, 0),
    inputTokens: clampNumber(body.inputTokens, 0, 1_000_000, 0),
    outputTokens: clampNumber(body.outputTokens, 0, 1_000_000, 0),
    outcome,
    errorCode:
      typeof body.errorCode === "string"
        ? body.errorCode.slice(0, MAX_ERROR_LEN)
        : undefined,
    compressed: typeof body.compressed === "boolean" ? body.compressed : undefined,
    projectSlug: typeof body.projectSlug === "string" ? body.projectSlug.slice(0, 64) : undefined,
    sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined,
  };

  recordHarnessMetric(metric);
  return c.json({ success: true, data: { recorded: true } } satisfies ApiResponse);
});

/**
 * GET /api/analytics/harness/usage?from_ms=&to_ms=&project=
 * Returns aggregated per-tool stats for the requested window.
 */
analyticsHarnessRoutes.get("/usage", async (c) => {
  const fromMsParam = c.req.query("from_ms");
  const toMsParam = c.req.query("to_ms");
  const project = c.req.query("project");

  let fromMs: number | undefined;
  let toMs: number | undefined;

  if (fromMsParam) {
    const n = Number(fromMsParam);
    if (!Number.isFinite(n) || n < 0) {
      return c.json({ success: false, error: "from_ms must be a positive number" } satisfies ApiResponse, 400);
    }
    fromMs = n;
  }
  if (toMsParam) {
    const n = Number(toMsParam);
    if (!Number.isFinite(n) || n < 0) {
      return c.json({ success: false, error: "to_ms must be a positive number" } satisfies ApiResponse, 400);
    }
    toMs = n;
  }

  if (fromMs !== undefined && toMs !== undefined) {
    if (toMs < fromMs) {
      return c.json({ success: false, error: "to_ms must be >= from_ms" } satisfies ApiResponse, 400);
    }
    if (toMs - fromMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return c.json(
        { success: false, error: `Range exceeds ${MAX_RANGE_DAYS} days` } satisfies ApiResponse,
        400,
      );
    }
  }

  try {
    const summary = await aggregateUsage({ fromMs, toMs, projectSlug: project });
    return c.json({ success: true, data: summary } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      { success: false, error: `Failed to aggregate: ${String(err)}` } satisfies ApiResponse,
      500,
    );
  }
});

/**
 * GET /api/analytics/harness/timeline?from_ms=&to_ms=&tool=&bucket_ms=&top_n=&project=
 * Returns time-bucketed counts per tool for the dashboard chart.
 */
analyticsHarnessRoutes.get("/timeline", async (c) => {
  const fromMsParam = c.req.query("from_ms");
  const toMsParam = c.req.query("to_ms");
  const tool = c.req.query("tool");
  const bucketMsParam = c.req.query("bucket_ms");
  const topNParam = c.req.query("top_n");
  const project = c.req.query("project");

  const fromMs = parsePositive(fromMsParam);
  const toMs = parsePositive(toMsParam);
  if (fromMsParam && fromMs === undefined) {
    return c.json({ success: false, error: "from_ms must be a positive number" } satisfies ApiResponse, 400);
  }
  if (toMsParam && toMs === undefined) {
    return c.json({ success: false, error: "to_ms must be a positive number" } satisfies ApiResponse, 400);
  }
  if (fromMs !== undefined && toMs !== undefined) {
    if (toMs < fromMs) {
      return c.json({ success: false, error: "to_ms must be >= from_ms" } satisfies ApiResponse, 400);
    }
    if (toMs - fromMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return c.json(
        { success: false, error: `Range exceeds ${MAX_RANGE_DAYS} days` } satisfies ApiResponse,
        400,
      );
    }
  }

  let bucketMs: number | undefined;
  if (bucketMsParam) {
    const n = Number(bucketMsParam);
    if (!Number.isFinite(n) || n < 60_000 || n > 24 * 3_600_000) {
      return c.json(
        { success: false, error: "bucket_ms must be between 60_000 and 86_400_000" } satisfies ApiResponse,
        400,
      );
    }
    bucketMs = n;
  }

  let topN: number | undefined;
  if (topNParam) {
    const n = Number(topNParam);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return c.json({ success: false, error: "top_n must be 1..20" } satisfies ApiResponse, 400);
    }
    topN = Math.floor(n);
  }

  try {
    const series = await buildTimeline({
      fromMs,
      toMs,
      tool,
      bucketMs,
      topN,
      projectSlug: project,
    });
    return c.json({ success: true, data: series } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      { success: false, error: `Failed to build timeline: ${String(err)}` } satisfies ApiResponse,
      500,
    );
  }
});

function parsePositive(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
