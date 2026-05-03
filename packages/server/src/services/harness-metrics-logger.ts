/**
 * Harness metrics logger — append-only ndjson writer for `companion_*` MCP
 * tool calls. Reads back via `aggregateUsage()` for the Analytics > Harness
 * panel. Runs in the main API process; the MCP tool wrapper POSTs each
 * event into /api/analytics/harness/log which lands here.
 *
 * Design choices:
 *   - Buffered writes (flush on 50 entries OR 5s timer) keep I/O sane
 *     under bursty workloads without losing events on graceful shutdown.
 *   - Rotation at 50MB renames the active file with a date suffix and
 *     starts a fresh one. Older rotated files are kept for 90 days, then
 *     deleted by `cleanupOldRotations()`.
 *   - Reader streams the file lazily (line-by-line) so a 50MB log doesn't
 *     spike RSS during aggregation.
 */

import {
  appendFileSync,
  statSync,
  existsSync,
  renameSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  createReadStream,
  createWriteStream,
} from "node:fs";
import { createInterface } from "node:readline";
import { createGzip } from "node:zlib";
import { pipeline as streamPipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { createLogger } from "../logger.js";
import type { HarnessMetric, HarnessToolAggregate, HarnessUsageSummary } from "@companion/shared";

const log = createLogger("harness-metrics");

const METRICS_DIR = join(process.cwd(), ".rune", "metrics");
const ACTIVE_FILE = "harness-tools.jsonl";
const ROTATE_PREFIX = "harness-tools-";
const ROTATE_SIZE_BYTES = 50 * 1024 * 1024;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const FLUSH_THRESHOLD = 50;
const FLUSH_INTERVAL_MS = 5_000;

class MetricsBuffer {
  private buffer: HarnessMetric[] = [];
  private timer: NodeJS.Timeout | null = null;
  private rotateChecked = 0;
  private dirEnsured = false;

  push(m: HarnessMetric): void {
    this.buffer.push(m);
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;

    const drained = this.buffer;
    this.buffer = [];

    const path = join(METRICS_DIR, ACTIVE_FILE);
    try {
      this.ensureDir();
      const lines = drained.map((m) => JSON.stringify(m)).join("\n") + "\n";
      appendFileSync(path, lines, "utf-8");
    } catch (err) {
      log.warn("Failed to flush harness metrics", { error: String(err), drained: drained.length });
      // Re-queue for next attempt; bounded by FLUSH_THRESHOLD so we don't
      // pile up forever if the disk is full.
      if (this.buffer.length < FLUSH_THRESHOLD * 4) {
        this.buffer.unshift(...drained);
      }
      return;
    }

    // Cheap rotation check — at most once per minute.
    const now = Date.now();
    if (now - this.rotateChecked > 60_000) {
      this.rotateChecked = now;
      this.maybeRotate(path);
    }
  }

  private ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      // Sync mkdir — ~0.1ms cost, runs once per process. Async fire-and-
      // forget would race with the appendFileSync below on cold start.
      mkdirSync(METRICS_DIR, { recursive: true });
      this.dirEnsured = true;
    } catch (err) {
      log.warn("Failed to create metrics dir", { dir: METRICS_DIR, error: String(err) });
    }
  }

  private maybeRotate(activePath: string): void {
    let size: number;
    try {
      size = statSync(activePath).size;
    } catch {
      return;
    }
    if (size < ROTATE_SIZE_BYTES) return;

    const date = formatDate(new Date());
    const rotatedJsonl = join(METRICS_DIR, `${ROTATE_PREFIX}${date}.jsonl`);
    try {
      renameSync(activePath, rotatedJsonl);
      log.info("Rotated harness metrics", { activePath, rotatedJsonl, size });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Windows holds an exclusive lock when streamLines is reading the
      // active file (e.g. an Analytics tab refresh hits at the same instant
      // we try to rotate). EBUSY/EPERM/EACCES are recoverable — defer
      // rotation: clear the throttle so the next flush retries immediately,
      // and let the file grow past ROTATE_SIZE_BYTES temporarily.
      if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
        log.debug("Harness rotate deferred — file locked", { code, size });
        this.rotateChecked = 0;
        return;
      }
      log.warn("Failed to rotate harness metrics", { error: String(err), code });
      return;
    }

    // Compress in background — disk pressure (50MB × 90d retention =
    // 4.5GB raw vs ~450MB gzipped). Failure leaves the .jsonl in place.
    const gzPath = `${rotatedJsonl}.gz`;
    void streamPipeline(createReadStream(rotatedJsonl), createGzip(), createWriteStream(gzPath))
      .then(() => {
        try {
          unlinkSync(rotatedJsonl);
          log.info("Compressed rotated metrics", { gzPath });
        } catch (err) {
          log.warn("Compressed but failed to remove plaintext", { gzPath, error: String(err) });
        }
      })
      .catch((err) => {
        log.warn("Failed to gzip rotated metrics", { rotatedJsonl, error: String(err) });
      });

    cleanupOldRotations();
  }
}

const buffer = new MetricsBuffer();

let shutdownHooked = false;
function ensureShutdownHook(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const flushOnExit = () => buffer.flush();
  process.on("SIGTERM", flushOnExit);
  process.on("SIGINT", flushOnExit);
  process.on("beforeExit", flushOnExit);
}

/** Public: append one metric event. Buffered, never blocks the caller. */
export function recordHarnessMetric(metric: HarnessMetric): void {
  ensureShutdownHook();
  buffer.push(metric);
}

/** Public: synchronous flush — used by tests + shutdown paths. */
export function flushHarnessMetrics(): void {
  buffer.flush();
}

// ─── Aggregation ────────────────────────────────────────────────────────────

interface AggregateOptions {
  /** Inclusive lower bound on `ts`. Default = now - 24h. */
  fromMs?: number;
  /** Inclusive upper bound. Default = now. */
  toMs?: number;
  /** Filter to a single project slug. */
  projectSlug?: string;
}

/**
 * Stream the active log + most recent rotated file (covers windows that
 * straddle a rotation), aggregate per-tool stats. Returns sorted list
 * by call count desc.
 */
export async function aggregateUsage(opts: AggregateOptions = {}): Promise<HarnessUsageSummary> {
  const fromMs = opts.fromMs ?? Date.now() - 24 * 60 * 60 * 1000;
  const toMs = opts.toMs ?? Date.now();
  const projectFilter = opts.projectSlug;

  // Per-tool accumulator
  interface Acc {
    tool: string;
    calls: number;
    errors: number;
    timeouts: number;
    durations: number[];
    totalInputTokens: number;
    totalOutputTokens: number;
    compressedCalls: number;
  }
  const acc = new Map<string, Acc>();

  let total = 0;
  let earliestSeen: number | null = null;
  let latestSeen: number | null = null;

  const candidatePaths = collectReadablePaths();
  for (const path of candidatePaths) {
    if (!existsSync(path)) continue;
    try {
      await streamLines(path, (line) => {
        if (!line) return;
        let m: HarnessMetric;
        try {
          m = JSON.parse(line) as HarnessMetric;
        } catch {
          return; // skip corrupt line
        }
        if (typeof m.ts !== "number" || m.ts < fromMs || m.ts > toMs) return;
        if (projectFilter && m.projectSlug !== projectFilter) return;

        total += 1;
        if (earliestSeen === null || m.ts < earliestSeen) earliestSeen = m.ts;
        if (latestSeen === null || m.ts > latestSeen) latestSeen = m.ts;

        let entry = acc.get(m.tool);
        if (!entry) {
          entry = {
            tool: m.tool,
            calls: 0,
            errors: 0,
            timeouts: 0,
            durations: [],
            totalInputTokens: 0,
            totalOutputTokens: 0,
            compressedCalls: 0,
          };
          acc.set(m.tool, entry);
        }
        entry.calls += 1;
        if (m.outcome === "error") entry.errors += 1;
        if (m.outcome === "timeout") entry.timeouts += 1;
        entry.durations.push(m.durationMs);
        entry.totalInputTokens += m.inputTokens;
        entry.totalOutputTokens += m.outputTokens;
        if (m.compressed) entry.compressedCalls += 1;
      });
    } catch (err) {
      log.warn("Failed to read metrics file", { path, error: String(err) });
    }
  }

  const tools: HarnessToolAggregate[] = Array.from(acc.values()).map((e) => ({
    tool: e.tool,
    calls: e.calls,
    errors: e.errors,
    timeouts: e.timeouts,
    p50DurationMs: percentile(e.durations, 50),
    p95DurationMs: percentile(e.durations, 95),
    totalInputTokens: e.totalInputTokens,
    totalOutputTokens: e.totalOutputTokens,
    compressedCalls: e.compressedCalls,
  }));
  tools.sort((a, b) => b.calls - a.calls);

  return {
    windowStartMs: earliestSeen ?? fromMs,
    windowEndMs: latestSeen ?? toMs,
    totalCalls: total,
    tools,
  };
}

function collectReadablePaths(): string[] {
  const paths = [join(METRICS_DIR, ACTIVE_FILE)];
  try {
    if (!existsSync(METRICS_DIR)) return paths;
    const rotated = readdirSync(METRICS_DIR)
      .filter((n) => n.startsWith(ROTATE_PREFIX) && n.endsWith(".jsonl"))
      .sort()
      .reverse() // most recent first
      .slice(0, 1) // include only newest rotated; older needs explicit asks
      .map((n) => join(METRICS_DIR, n));
    paths.push(...rotated);
  } catch {
    /* nop */
  }
  return paths;
}

async function streamLines(path: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", onLine);
    rl.once("close", () => resolve());
    rl.once("error", reject);
    stream.once("error", reject);
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function cleanupOldRotations(): void {
  if (!existsSync(METRICS_DIR)) return;
  const cutoff = Date.now() - RETENTION_MS;
  let entries: string[];
  try {
    entries = readdirSync(METRICS_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(ROTATE_PREFIX)) continue;
    if (!name.endsWith(".jsonl") && !name.endsWith(".jsonl.gz")) continue;
    const path = join(METRICS_DIR, name);
    try {
      const stat = statSync(path);
      if (stat.mtimeMs < cutoff) {
        unlinkSync(path);
        log.debug("Pruned old harness metrics file", { path });
      }
    } catch {
      /* nop */
    }
  }
}

// ─── Timeline ───────────────────────────────────────────────────────────────

export interface HarnessTimelineBucket {
  /** Unix ms aligned to the start of the bucket (hour or day). */
  ts: number;
  calls: number;
  errors: number;
  /** Median latency of calls landing in this bucket. */
  p50DurationMs: number;
}

export interface HarnessTimelineSeries {
  tool: string;
  /** Bucket size in ms (3600000 = 1h, 86400000 = 1d). */
  bucketMs: number;
  buckets: HarnessTimelineBucket[];
}

interface TimelineOptions extends AggregateOptions {
  /** Restrict to one tool. If omitted, returns one series per tool. */
  tool?: string;
  /** Bucket size — defaults to 1h (3_600_000 ms). */
  bucketMs?: number;
  /** Cap how many series come back when tool is unspecified. */
  topN?: number;
}

/**
 * Build per-tool time-bucketed call counts. Used by the Harness Usage
 * timeline chart. Streams the same files as `aggregateUsage`.
 */
export async function buildTimeline(opts: TimelineOptions = {}): Promise<HarnessTimelineSeries[]> {
  const fromMs = opts.fromMs ?? Date.now() - 24 * 60 * 60 * 1000;
  const toMs = opts.toMs ?? Date.now();
  const bucketMs = opts.bucketMs ?? 3_600_000;
  const topN = opts.topN ?? 5;
  const projectFilter = opts.projectSlug;
  const toolFilter = opts.tool;

  // Per-tool, per-bucket accumulator
  interface BucketAcc {
    calls: number;
    errors: number;
    durations: number[];
  }
  const series = new Map<string, Map<number, BucketAcc>>();

  for (const path of collectReadablePaths()) {
    if (!existsSync(path)) continue;
    try {
      await streamLines(path, (line) => {
        if (!line) return;
        let m: HarnessMetric;
        try {
          m = JSON.parse(line) as HarnessMetric;
        } catch {
          return;
        }
        if (typeof m.ts !== "number" || m.ts < fromMs || m.ts > toMs) return;
        if (projectFilter && m.projectSlug !== projectFilter) return;
        if (toolFilter && m.tool !== toolFilter) return;

        const bucketTs = Math.floor(m.ts / bucketMs) * bucketMs;
        let toolMap = series.get(m.tool);
        if (!toolMap) {
          toolMap = new Map();
          series.set(m.tool, toolMap);
        }
        let bucket = toolMap.get(bucketTs);
        if (!bucket) {
          bucket = { calls: 0, errors: 0, durations: [] };
          toolMap.set(bucketTs, bucket);
        }
        bucket.calls += 1;
        if (m.outcome === "error") bucket.errors += 1;
        bucket.durations.push(m.durationMs);
      });
    } catch (err) {
      log.warn("Failed to stream metrics for timeline", { path, error: String(err) });
    }
  }

  // Convert to sorted series, optionally cap to topN by total calls.
  const entries = Array.from(series.entries()).map(([tool, bucketMap]) => {
    const buckets: HarnessTimelineBucket[] = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, b]) => ({
        ts,
        calls: b.calls,
        errors: b.errors,
        p50DurationMs: percentile(b.durations, 50),
      }));
    const total = buckets.reduce((s, b) => s + b.calls, 0);
    return { tool, bucketMs, buckets, total };
  });

  entries.sort((a, b) => b.total - a.total);
  return entries.slice(0, topN).map(({ tool, bucketMs: bm, buckets }) => ({
    tool,
    bucketMs: bm,
    buckets,
  }));
}

/** Test seam — exposes internals so tests can override paths. */
export const _internals = {
  METRICS_DIR,
  ACTIVE_FILE,
  ROTATE_PREFIX,
  ROTATE_SIZE_BYTES,
  RETENTION_MS,
  collectReadablePaths,
  percentile,
  // Force-reset is useful in tests to drop the singleton buffer state.
  __resetBuffer: () => {
    /* buffer is module-scoped; tests use the public flush instead */
  },
  __dirname: () => dirname(join(METRICS_DIR, ACTIVE_FILE)),
};
