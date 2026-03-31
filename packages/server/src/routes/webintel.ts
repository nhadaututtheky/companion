/**
 * WebIntel REST routes — proxy to webclaw sidecar with auth & rate limiting.
 */

import { Hono } from "hono";
import * as webIntel from "../services/web-intel.js";
import { assertSafeUrl } from "../services/web-intel.js";
import * as webIntelJobs from "../services/web-intel-jobs.js";
import type { ApiResponse } from "@companion/shared";

export const webintelRoutes = new Hono();

/** GET /webintel/status — webclaw health + cache stats */
webintelRoutes.get("/status", async (c) => {
  const available = await webIntel.isAvailable();
  const cache = webIntel.getCacheStats();

  return c.json({
    success: true,
    data: { available, cache },
  } satisfies ApiResponse);
});

/** POST /webintel/scrape — scrape a single URL */
webintelRoutes.post("/scrape", async (c) => {
  const body = await c.req.json<{
    url?: string;
    formats?: string[];
    includeSelectors?: string[];
    excludeSelectors?: string[];
    onlyMainContent?: boolean;
    skipCache?: boolean;
  }>();

  if (!body.url || typeof body.url !== "string") {
    return c.json({ success: false, error: "url is required" } satisfies ApiResponse, 400);
  }

  // URL validation + SSRF protection
  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json({ success: false, error: String((err as Error).message) } satisfies ApiResponse, 400);
  }

  const result = await webIntel.scrape(body.url, {
    formats: body.formats as ("markdown" | "llm" | "text" | "json")[] | undefined,
    includeSelectors: body.includeSelectors,
    excludeSelectors: body.excludeSelectors,
    onlyMainContent: body.onlyMainContent,
    skipCache: body.skipCache,
  });

  if (!result) {
    return c.json({
      success: false,
      error: "Scrape failed — webclaw may be unavailable",
    } satisfies ApiResponse, 502);
  }

  return c.json({ success: true, data: result } satisfies ApiResponse);
});

/** POST /webintel/docs — fetch URL in LLM format for agent context */
webintelRoutes.post("/docs", async (c) => {
  const body = await c.req.json<{
    url?: string;
    maxTokens?: number;
    refresh?: boolean;
  }>();

  if (!body.url || typeof body.url !== "string") {
    return c.json({ success: false, error: "url is required" } satisfies ApiResponse, 400);
  }

  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json({ success: false, error: String((err as Error).message) } satisfies ApiResponse, 400);
  }

  const maxTokens = Math.min(body.maxTokens ?? 4000, 16_000);
  const content = await webIntel.scrapeForContext(body.url, maxTokens, {
    skipCache: body.refresh,
  });

  if (!content) {
    return c.json({
      success: false,
      error: "Could not fetch docs — webclaw may be unavailable",
    } satisfies ApiResponse, 502);
  }

  return c.json({ success: true, data: { url: body.url, content } } satisfies ApiResponse);
});

/** POST /webintel/search — web search (requires WEBCLAW_API_KEY) */
webintelRoutes.post("/search", async (c) => {
  const body = await c.req.json<{ query?: string; num?: number }>();

  if (!body.query || typeof body.query !== "string") {
    return c.json({ success: false, error: "query is required" } satisfies ApiResponse, 400);
  }

  const results = await webIntel.search(body.query, body.num ?? 5);

  if (results.length === 0) {
    return c.json({
      success: false,
      error: "No results — search may require WEBCLAW_API_KEY",
    } satisfies ApiResponse, 502);
  }

  return c.json({ success: true, data: results } satisfies ApiResponse);
});

/** POST /webintel/research — web research (search + scrape + synthesize) */
webintelRoutes.post("/research", async (c) => {
  const body = await c.req.json<{ query?: string; maxTokens?: number }>();

  if (!body.query || typeof body.query !== "string") {
    return c.json({ success: false, error: "query is required" } satisfies ApiResponse, 400);
  }

  const maxTokens = Math.min(body.maxTokens ?? 3000, 8000);
  const result = await webIntel.research(body.query, maxTokens);

  if (!result) {
    return c.json({
      success: false,
      error: "Research failed — WEBCLAW_API_KEY may be required for search",
    } satisfies ApiResponse, 502);
  }

  return c.json({ success: true, data: result } satisfies ApiResponse);
});

/** POST /webintel/crawl — start async crawl job */
webintelRoutes.post("/crawl", async (c) => {
  const body = await c.req.json<{
    url?: string;
    maxDepth?: number;
    maxPages?: number;
    sessionId?: string;
  }>();

  if (!body.url || typeof body.url !== "string") {
    return c.json({ success: false, error: "url is required" } satisfies ApiResponse, 400);
  }

  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json({ success: false, error: String((err as Error).message) } satisfies ApiResponse, 400);
  }

  const jobId = await webIntel.startCrawl(body.url, {
    maxDepth: body.maxDepth ?? 2,
    maxPages: Math.min(body.maxPages ?? 50, 200),
  });

  if (!jobId) {
    return c.json({
      success: false,
      error: "Crawl failed to start — webclaw may be unavailable",
    } satisfies ApiResponse, 502);
  }

  webIntelJobs.registerJob({
    id: jobId,
    type: "crawl",
    sessionId: body.sessionId ?? "api",
    url: body.url,
  });

  return c.json({ success: true, data: { jobId } } satisfies ApiResponse);
});

/** GET /webintel/jobs — list all active jobs */
webintelRoutes.get("/jobs", (c) => {
  const jobs = webIntelJobs.getAllJobs();
  return c.json({ success: true, data: jobs } satisfies ApiResponse);
});

/** GET /webintel/jobs/:id — get job status */
webintelRoutes.get("/jobs/:id", async (c) => {
  const jobId = c.req.param("id");
  const job = webIntelJobs.getJob(jobId);

  if (!job) {
    return c.json({ success: false, error: "Job not found" } satisfies ApiResponse, 404);
  }

  // Poll webclaw for latest status if still running
  if (job.status === "running" && job.type === "crawl") {
    const updated = await webIntelJobs.pollCrawlJob(jobId);
    if (updated) {
      return c.json({ success: true, data: updated } satisfies ApiResponse);
    }
  }

  return c.json({ success: true, data: job } satisfies ApiResponse);
});

/** DELETE /webintel/cache — clear cache */
webintelRoutes.delete("/cache", (c) => {
  webIntel.clearCache();
  return c.json({ success: true, data: { cleared: true } } satisfies ApiResponse);
});
