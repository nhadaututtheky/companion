/**
 * RTK Phase 3 tests — Intelligence Layer
 * Tests: Cache, Budget, Config
 */

import { describe, it, expect } from "bun:test";
import { RTKCache } from "../rtk/cache.js";
import { applyBudget } from "../rtk/budget.js";
import { RTKPipeline } from "../rtk/pipeline.js";
import { AnsiStripStrategy } from "../rtk/strategies/ansi-strip.js";
import { BlankCollapseStrategy } from "../rtk/strategies/blank-collapse.js";
import { DedupStrategy } from "../rtk/strategies/dedup.js";
import { TruncateStrategy } from "../rtk/strategies/truncate.js";

// ─── RTKCache ──────────────────────────────────────────────────────────────

describe("RTKCache", () => {
  it("returns undefined on cache miss", () => {
    const cache = new RTKCache();
    expect(cache.get("session1", "hello world")).toBeUndefined();
  });

  it("returns cached entry on cache hit", () => {
    const cache = new RTKCache();
    cache.set("session1", "hello world", "compressed", 10, ["ansi-strip"]);
    const entry = cache.get("session1", "hello world");
    expect(entry).not.toBeUndefined();
    expect(entry!.compressed).toBe("compressed");
    expect(entry!.tokensSaved).toBe(10);
    expect(entry!.strategiesApplied).toEqual(["ansi-strip"]);
  });

  it("isolates sessions", () => {
    const cache = new RTKCache();
    cache.set("session1", "input", "out1", 5, ["dedup"]);
    expect(cache.get("session2", "input")).toBeUndefined();
    expect(cache.get("session1", "input")!.compressed).toBe("out1");
  });

  it("clears session cache", () => {
    const cache = new RTKCache();
    cache.set("session1", "input", "out", 5, []);
    cache.clearSession("session1");
    expect(cache.get("session1", "input")).toBeUndefined();
  });

  it("evicts oldest entries when at capacity", () => {
    const cache = new RTKCache();
    // Fill cache to max (100 entries)
    for (let i = 0; i < 105; i++) {
      cache.set("s1", `input-${i}`, `out-${i}`, 1, []);
    }
    // First entries should be evicted
    expect(cache.get("s1", "input-0")).toBeUndefined();
    expect(cache.get("s1", "input-4")).toBeUndefined();
    // Recent entries should still be there
    expect(cache.get("s1", "input-104")).not.toBeUndefined();
  });

  it("reports stats", () => {
    const cache = new RTKCache();
    cache.set("s1", "a", "b", 1, []);
    cache.set("s1", "c", "d", 1, []);
    cache.set("s2", "e", "f", 1, []);
    cache.get("s1", "a"); // hit
    cache.get("s1", "miss"); // miss

    const stats = cache.getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.totalEntries).toBe(3);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});

// ─── Token Budget ──────────────────────────────────────────────────────────

describe("applyBudget", () => {
  it("returns unchanged for output within budget", () => {
    const input = "short output";
    const result = applyBudget(input, "balanced");
    expect(result.budgetTruncated).toBe(false);
    expect(result.output).toBe(input);
  });

  it("truncates output exceeding budget", () => {
    // balanced = 4000 tokens = ~16K chars
    const longOutput = Array.from({ length: 500 }, (_, i) => `line ${i}: ${"x".repeat(50)}`).join(
      "\n",
    );
    const result = applyBudget(longOutput, "aggressive"); // 2000 tokens = ~8K chars
    expect(result.budgetTruncated).toBe(true);
    expect(result.output.length).toBeLessThan(longOutput.length);
    expect(result.output).toContain("budget");
  });

  it("unlimited level never truncates", () => {
    const longOutput = "x".repeat(100000);
    const result = applyBudget(longOutput, "unlimited");
    expect(result.budgetTruncated).toBe(false);
    expect(result.output).toBe(longOutput);
  });

  it("aggressive level has lower budget than balanced", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}: ${"data".repeat(20)}`).join(
      "\n",
    );
    const aggressive = applyBudget(lines, "aggressive");
    const balanced = applyBudget(lines, "balanced");
    // Aggressive should truncate more
    if (aggressive.budgetTruncated && balanced.budgetTruncated) {
      expect(aggressive.output.length).toBeLessThanOrEqual(balanced.output.length);
    }
  });
});

// ─── Pipeline with Cache ───────────────────────────────────────────────────

describe("RTKPipeline with cache", () => {
  it("caches results and returns cached on second call", () => {
    const pipeline = new RTKPipeline([new AnsiStripStrategy(), new BlankCollapseStrategy()]);
    const input = "\x1b[32mHello\x1b[0m " + "x".repeat(200);

    const result1 = pipeline.transform(input, { sessionId: "s1" });
    expect(result1.savings.cached).toBe(false);

    const result2 = pipeline.transform(input, { sessionId: "s1" });
    expect(result2.savings.cached).toBe(true);
    expect(result2.compressed).toBe(result1.compressed);
    expect(result2.savings.totalTokensSaved).toBe(result1.savings.totalTokensSaved);
  });

  it("different sessions have separate caches", () => {
    const pipeline = new RTKPipeline([new AnsiStripStrategy()]);
    const input = "\x1b[31mError\x1b[0m " + "y".repeat(200);

    pipeline.transform(input, { sessionId: "s1" });
    const result = pipeline.transform(input, { sessionId: "s2" });
    expect(result.savings.cached).toBe(false);
  });

  it("clearSessionCache removes cache for that session", () => {
    const pipeline = new RTKPipeline([new AnsiStripStrategy()]);
    const input = "\x1b[33mWarn\x1b[0m " + "z".repeat(200);

    pipeline.transform(input, { sessionId: "s1" });
    pipeline.clearSessionCache("s1");
    const result = pipeline.transform(input, { sessionId: "s1" });
    expect(result.savings.cached).toBe(false);
  });
});

// ─── Pipeline with Budget ──────────────────────────────────────────────────

describe("RTKPipeline with budget", () => {
  it("applies budget truncation when output exceeds limit", () => {
    const pipeline = new RTKPipeline([new TruncateStrategy()]);
    pipeline.setBudgetLevel("aggressive"); // 2000 tokens

    // Generate a very long output that TruncateStrategy won't fully handle
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i}: ${"data".repeat(30)}`);
    const input = lines.join("\n");

    const result = pipeline.transform(input, { sessionId: "s1" });
    // Should either be budget-truncated or strategy-truncated
    expect(result.savings.totalTokensSaved).toBeGreaterThan(0);
    expect(result.compressed.length).toBeLessThan(input.length);
  });

  it("skips budget when set to unlimited", () => {
    const pipeline = new RTKPipeline([new BlankCollapseStrategy()]);
    pipeline.setBudgetLevel("unlimited");

    const input = "a\n\n\n\nb " + "x".repeat(200);
    const result = pipeline.transform(input, { sessionId: "s1" });
    expect(result.savings.budgetTruncated).toBeFalsy();
  });
});

// ─── Pipeline with disabled strategies ─────────────────────────────────────

describe("RTKPipeline with disabled strategies", () => {
  it("skips disabled strategies", () => {
    const pipeline = new RTKPipeline([
      new AnsiStripStrategy(),
      new BlankCollapseStrategy(),
      new DedupStrategy(),
    ]);
    pipeline.setDisabledStrategies(new Set(["ansi-strip"]));

    const input = "\x1b[32mGreen\x1b[0m text\n\n\n\nmore text " + "x".repeat(200);
    const result = pipeline.transform(input, { sessionId: "s1" });

    // ANSI should NOT be stripped (disabled)
    expect(result.compressed).toContain("\x1b[32m");
    // But blank collapse should still work
    expect(result.savings.strategiesApplied).toContain("blank-collapse");
    expect(result.savings.strategiesApplied).not.toContain("ansi-strip");
  });

  it("can re-enable strategies", () => {
    const pipeline = new RTKPipeline([new AnsiStripStrategy()]);
    pipeline.setDisabledStrategies(new Set(["ansi-strip"]));

    const input = "\x1b[31mRed\x1b[0m " + "x".repeat(200);
    const result1 = pipeline.transform(input, { sessionId: "s1" });
    expect(result1.compressed).toContain("\x1b[31m");

    pipeline.setDisabledStrategies(new Set());
    pipeline.clearSessionCache("s1");
    const result2 = pipeline.transform(input, { sessionId: "s1" });
    expect(result2.compressed).not.toContain("\x1b[31m");
  });
});
