/**
 * Unit tests for harness-metrics-logger — buffered append + aggregation.
 *
 * Tests run against the real default `.rune/metrics/harness-tools.jsonl`
 * path (under cwd). Bun runs tests from the repo root so we just clean
 * up after each test to avoid polluting checked-in metrics. If run
 * from another cwd the test suite would write into that cwd — accept
 * since it never crosses repo boundaries.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  recordHarnessMetric,
  flushHarnessMetrics,
  aggregateUsage,
  _internals,
} from "./harness-metrics-logger.js";
import type { HarnessMetric } from "@companion/shared";

const ACTIVE_PATH = join(_internals.METRICS_DIR, _internals.ACTIVE_FILE);

function cleanup() {
  // Remove active file
  if (existsSync(ACTIVE_PATH)) rmSync(ACTIVE_PATH, { force: true });
  // Remove rotated test files (only those we wrote)
  if (existsSync(_internals.METRICS_DIR)) {
    for (const name of readdirSync(_internals.METRICS_DIR)) {
      if (name.startsWith(_internals.ROTATE_PREFIX) && name.endsWith(".jsonl")) {
        try {
          rmSync(join(_internals.METRICS_DIR, name), { force: true });
        } catch {
          /* nop */
        }
      }
    }
  }
}

beforeEach(() => {
  cleanup();
  if (!existsSync(_internals.METRICS_DIR)) {
    mkdirSync(_internals.METRICS_DIR, { recursive: true });
  }
});

afterEach(() => {
  cleanup();
});

function fixedMetric(over: Partial<HarnessMetric> = {}): HarnessMetric {
  return {
    ts: 1_700_000_000_000,
    tool: "companion_wiki_search",
    durationMs: 120,
    inputTokens: 50,
    outputTokens: 800,
    outcome: "ok",
    projectSlug: "test-proj",
    ...over,
  };
}

describe("recordHarnessMetric / flush", () => {
  it("flush is a no-op when buffer empty", () => {
    flushHarnessMetrics();
    expect(existsSync(ACTIVE_PATH)).toBe(false);
  });

  it("appends a single line per metric on flush", () => {
    recordHarnessMetric(fixedMetric());
    flushHarnessMetrics();
    expect(existsSync(ACTIVE_PATH)).toBe(true);
    const raw = readFileSync(ACTIVE_PATH, "utf-8").trim();
    const lines = raw.split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.tool).toBe("companion_wiki_search");
  });

  it("appends multiple lines preserving order", () => {
    recordHarnessMetric(fixedMetric({ tool: "companion_wiki_search", ts: 1 }));
    recordHarnessMetric(fixedMetric({ tool: "companion_wiki_read", ts: 2 }));
    recordHarnessMetric(fixedMetric({ tool: "companion_explain", ts: 3 }));
    flushHarnessMetrics();

    const lines = readFileSync(ACTIVE_PATH, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).tool).toBe("companion_wiki_search");
    expect(JSON.parse(lines[1]!).tool).toBe("companion_wiki_read");
    expect(JSON.parse(lines[2]!).tool).toBe("companion_explain");
  });
});

describe("aggregateUsage", () => {
  it("returns empty summary when log file missing", async () => {
    const summary = await aggregateUsage();
    expect(summary.totalCalls).toBe(0);
    expect(summary.tools).toEqual([]);
  });

  it("aggregates by tool with p50 / p95 + counts", async () => {
    const now = Date.now();
    const metrics: HarnessMetric[] = [];
    // 10 search calls with increasing latency
    for (let i = 0; i < 10; i++) {
      metrics.push(
        fixedMetric({ tool: "companion_wiki_search", ts: now - 1000 + i, durationMs: i * 100 }),
      );
    }
    metrics.push(fixedMetric({ tool: "companion_explain", ts: now, durationMs: 500 }));
    metrics.push(
      fixedMetric({ tool: "companion_explain", ts: now, durationMs: 800, outcome: "error", errorCode: "boom" }),
    );

    // Use raw write to avoid waiting for buffer flush timing.
    const raw = metrics.map((m) => JSON.stringify(m)).join("\n") + "\n";
    writeFileSync(ACTIVE_PATH, raw, "utf-8");

    const summary = await aggregateUsage({ fromMs: now - 60_000, toMs: now + 1000 });
    expect(summary.totalCalls).toBe(12);

    const search = summary.tools.find((t) => t.tool === "companion_wiki_search");
    expect(search?.calls).toBe(10);
    expect(search?.errors).toBe(0);
    // p50 of [0..900] is ~500
    expect(search?.p50DurationMs).toBeGreaterThan(0);
    // Sorted: search (10) before explain (2)
    expect(summary.tools[0]?.tool).toBe("companion_wiki_search");

    const explain = summary.tools.find((t) => t.tool === "companion_explain");
    expect(explain?.calls).toBe(2);
    expect(explain?.errors).toBe(1);
  });

  it("filters by time window", async () => {
    const old = 1_000_000;
    const recent = Date.now();
    const raw = [
      fixedMetric({ ts: old, tool: "companion_wiki_search" }),
      fixedMetric({ ts: recent, tool: "companion_wiki_read" }),
    ]
      .map((m) => JSON.stringify(m))
      .join("\n");
    writeFileSync(ACTIVE_PATH, raw, "utf-8");

    const summary = await aggregateUsage({ fromMs: recent - 1000, toMs: recent + 1000 });
    expect(summary.totalCalls).toBe(1);
    expect(summary.tools[0]?.tool).toBe("companion_wiki_read");
  });

  it("skips corrupt lines without crashing", async () => {
    const valid = JSON.stringify(fixedMetric({ ts: Date.now() }));
    const lines = [valid, "not-json", "{partial:", valid].join("\n");
    writeFileSync(ACTIVE_PATH, lines, "utf-8");

    const summary = await aggregateUsage();
    expect(summary.totalCalls).toBe(2);
  });

  it("filters by projectSlug when supplied", async () => {
    const ts = Date.now();
    const raw = [
      fixedMetric({ ts, projectSlug: "alpha", tool: "companion_wiki_search" }),
      fixedMetric({ ts, projectSlug: "beta", tool: "companion_wiki_search" }),
    ]
      .map((m) => JSON.stringify(m))
      .join("\n");
    writeFileSync(ACTIVE_PATH, raw, "utf-8");

    const summary = await aggregateUsage({ projectSlug: "alpha", fromMs: ts - 100, toMs: ts + 100 });
    expect(summary.totalCalls).toBe(1);
  });

  it("counts compressed calls separately", async () => {
    const ts = Date.now();
    const raw = [
      fixedMetric({ ts, compressed: true, tool: "companion_wiki_search" }),
      fixedMetric({ ts, compressed: false, tool: "companion_wiki_search" }),
      fixedMetric({ ts, tool: "companion_wiki_search" }),
    ]
      .map((m) => JSON.stringify(m))
      .join("\n");
    writeFileSync(ACTIVE_PATH, raw, "utf-8");

    const summary = await aggregateUsage({ fromMs: ts - 100, toMs: ts + 100 });
    const search = summary.tools.find((t) => t.tool === "companion_wiki_search");
    expect(search?.compressedCalls).toBe(1);
  });
});

describe("_internals.percentile", () => {
  it("returns 0 for empty input", () => {
    expect(_internals.percentile([], 50)).toBe(0);
  });
  it("median of evenly-spread values", () => {
    expect(_internals.percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });
  it("p95 picks last bucket for short series", () => {
    expect(_internals.percentile([10, 20, 30, 40, 50], 95)).toBe(50);
  });
});
