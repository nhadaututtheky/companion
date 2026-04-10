/**
 * WebIntel REST routes — proxy to webclaw sidecar with auth & rate limiting.
 */

import { Hono } from "hono";
import { z } from "zod";
import * as webIntel from "../services/web-intel.js";
import { assertSafeUrl } from "../services/web-intel.js";
import * as webIntelJobs from "../services/web-intel-jobs.js";
import type { ApiResponse } from "@companion/shared";

// ─── Request Schemas ────────────────────────────────────────────────────────

const scrapeSchema = z.object({
  url: z.string().min(1).max(2048),
  formats: z.array(z.string()).optional(),
  includeSelectors: z.array(z.string()).optional(),
  excludeSelectors: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().optional(),
  skipCache: z.boolean().optional(),
});

const docsSchema = z.object({
  url: z.string().min(1).max(2048),
  maxTokens: z.number().int().positive().optional(),
  refresh: z.boolean().optional(),
});

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  num: z.number().int().positive().optional(),
});

const researchSchema = z.object({
  query: z.string().min(1).max(500),
  maxTokens: z.number().int().positive().optional(),
});

const crawlSchema = z.object({
  url: z.string().min(1).max(2048),
  maxDepth: z.number().int().min(1).optional(),
  maxPages: z.number().int().min(1).optional(),
  sessionId: z.string().optional(),
});

const startWebclawSchema = z.object({
  apiKey: z.string().optional(),
});

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
  const parsed = scrapeSchema.safeParse(await c.req.json().catch(() => null));
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

  // URL validation + SSRF protection
  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json(
      { success: false, error: String((err as Error).message) } satisfies ApiResponse,
      400,
    );
  }

  const result = await webIntel.scrape(body.url, {
    formats: body.formats as ("markdown" | "llm" | "text" | "json")[] | undefined,
    includeSelectors: body.includeSelectors,
    excludeSelectors: body.excludeSelectors,
    onlyMainContent: body.onlyMainContent,
    skipCache: body.skipCache,
  });

  if (!result) {
    return c.json(
      {
        success: false,
        error: "Scrape failed — webclaw may be unavailable",
      } satisfies ApiResponse,
      502,
    );
  }

  return c.json({ success: true, data: result } satisfies ApiResponse);
});

/** POST /webintel/docs — fetch URL in LLM format for agent context */
webintelRoutes.post("/docs", async (c) => {
  const parsed = docsSchema.safeParse(await c.req.json().catch(() => null));
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

  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json(
      { success: false, error: String((err as Error).message) } satisfies ApiResponse,
      400,
    );
  }

  const maxTokens = Math.min(body.maxTokens ?? 4000, 16_000);
  const content = await webIntel.scrapeForContext(body.url, maxTokens, {
    skipCache: body.refresh,
  });

  if (!content) {
    return c.json(
      {
        success: false,
        error: "Could not fetch docs — webclaw may be unavailable",
      } satisfies ApiResponse,
      502,
    );
  }

  return c.json({ success: true, data: { url: body.url, content } } satisfies ApiResponse);
});

/** POST /webintel/search — web search (requires WEBCLAW_API_KEY) */
webintelRoutes.post("/search", async (c) => {
  const parsed = searchSchema.safeParse(await c.req.json().catch(() => null));
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

  const results = await webIntel.search(body.query, body.num ?? 5);

  if (results.length === 0) {
    return c.json(
      {
        success: false,
        error: "No results — search may require WEBCLAW_API_KEY",
      } satisfies ApiResponse,
      502,
    );
  }

  return c.json({ success: true, data: results } satisfies ApiResponse);
});

/** POST /webintel/research — web research (search + scrape + synthesize) */
webintelRoutes.post("/research", async (c) => {
  const parsed = researchSchema.safeParse(await c.req.json().catch(() => null));
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

  const maxTokens = Math.min(body.maxTokens ?? 3000, 8000);
  const result = await webIntel.research(body.query, maxTokens);

  if (!result) {
    return c.json(
      {
        success: false,
        error: "Research failed — WEBCLAW_API_KEY may be required for search",
      } satisfies ApiResponse,
      502,
    );
  }

  return c.json({ success: true, data: result } satisfies ApiResponse);
});

/** POST /webintel/crawl — start async crawl job */
webintelRoutes.post("/crawl", async (c) => {
  const parsed = crawlSchema.safeParse(await c.req.json().catch(() => null));
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

  try {
    assertSafeUrl(body.url);
  } catch (err) {
    return c.json(
      { success: false, error: String((err as Error).message) } satisfies ApiResponse,
      400,
    );
  }

  const jobId = await webIntel.startCrawl(body.url, {
    maxDepth: body.maxDepth ?? 2,
    maxPages: Math.min(body.maxPages ?? 50, 200),
  });

  if (!jobId) {
    return c.json(
      {
        success: false,
        error: "Crawl failed to start — webclaw may be unavailable",
      } satisfies ApiResponse,
      502,
    );
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

// ─── Docker / Webclaw Setup ─────────────────────────────────────────────

/** GET /webintel/docker-status — check if Docker is available + webclaw running */
webintelRoutes.get("/docker-status", async (c) => {
  let dockerAvailable = false;
  let webclawRunning = false;
  let webclawContainerId: string | null = null;

  try {
    const proc = Bun.spawnSync(["docker", "info"], { stdout: "pipe", stderr: "pipe" });
    dockerAvailable = proc.exitCode === 0;
  } catch {
    // dockerAvailable stays false
  }

  if (dockerAvailable) {
    try {
      const proc = Bun.spawnSync(
        ["docker", "ps", "--filter", "ancestor=ghcr.io/0xmassi/webclaw", "--format", "{{.ID}}"],
        { stdout: "pipe", stderr: "pipe" },
      );
      const output = proc.stdout.toString().trim();
      if (output) {
        webclawRunning = true;
        webclawContainerId = output.split("\n")[0] ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  const webclawHealthy = await webIntel.isAvailable();

  return c.json({
    success: true,
    data: { dockerAvailable, webclawRunning, webclawContainerId, webclawHealthy },
  } satisfies ApiResponse);
});

/** POST /webintel/start-webclaw — start webclaw Docker container */
webintelRoutes.post("/start-webclaw", async (c) => {
  const parsed = startWebclawSchema.safeParse(await c.req.json().catch(() => ({})));
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

  // Check Docker first
  try {
    const check = Bun.spawnSync(["docker", "info"], { stdout: "pipe", stderr: "pipe" });
    if (check.exitCode !== 0) {
      return c.json(
        { success: false, error: "Docker is not available" } satisfies ApiResponse,
        400,
      );
    }
  } catch {
    return c.json({ success: false, error: "Docker is not installed" } satisfies ApiResponse, 400);
  }

  // Check if already running
  try {
    const existing = Bun.spawnSync(
      ["docker", "ps", "--filter", "ancestor=ghcr.io/0xmassi/webclaw", "--format", "{{.ID}}"],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (existing.stdout.toString().trim()) {
      return c.json({
        success: true,
        data: {
          status: "already_running",
          containerId: existing.stdout.toString().trim().split("\n")[0],
        },
      } satisfies ApiResponse);
    }
  } catch {
    /* continue */
  }

  // Start webclaw
  const env: string[] = [
    "-e",
    "WEBCLAW_PORT=3000",
    "-e",
    "WEBCLAW_HOST=0.0.0.0",
    "-e",
    "WEBCLAW_MAX_CONCURRENCY=10",
  ];
  if (body.apiKey) {
    env.push("-e", `WEBCLAW_API_KEY=${body.apiKey}`);
  }

  try {
    const proc = Bun.spawnSync(
      [
        "docker",
        "run",
        "-d",
        "--name",
        "companion-webclaw",
        "-p",
        "3100:3000",
        ...env,
        "ghcr.io/0xmassi/webclaw:latest",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    if (proc.exitCode !== 0) {
      const stderr = proc.stderr.toString().trim();
      // Container name conflict — try removing and retrying
      if (stderr.includes("already in use")) {
        Bun.spawnSync(["docker", "rm", "-f", "companion-webclaw"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const retry = Bun.spawnSync(
          [
            "docker",
            "run",
            "-d",
            "--name",
            "companion-webclaw",
            "-p",
            "3100:3000",
            ...env,
            "ghcr.io/0xmassi/webclaw:latest",
          ],
          { stdout: "pipe", stderr: "pipe" },
        );
        if (retry.exitCode !== 0) {
          return c.json(
            {
              success: false,
              error: retry.stderr.toString().trim() || "Failed to start webclaw",
            } satisfies ApiResponse,
            500,
          );
        }
        const containerId = retry.stdout.toString().trim().slice(0, 12);
        webIntel.resetHealthCache();
        return c.json({
          success: true,
          data: { status: "started", containerId },
        } satisfies ApiResponse);
      }
      return c.json(
        { success: false, error: stderr || "Failed to start webclaw" } satisfies ApiResponse,
        500,
      );
    }

    const containerId = proc.stdout.toString().trim().slice(0, 12);
    webIntel.resetHealthCache();
    return c.json({
      success: true,
      data: { status: "started", containerId },
    } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to start webclaw",
      } satisfies ApiResponse,
      500,
    );
  }
});

/** POST /webintel/stop-webclaw — stop webclaw Docker container */
webintelRoutes.post("/stop-webclaw", async (c) => {
  try {
    Bun.spawnSync(["docker", "rm", "-f", "companion-webclaw"], { stdout: "pipe", stderr: "pipe" });
    webIntel.resetHealthCache();
    return c.json({ success: true, data: { status: "stopped" } } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Failed to stop webclaw" } satisfies ApiResponse, 500);
  }
});
