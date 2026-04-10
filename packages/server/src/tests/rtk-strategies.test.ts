/**
 * RTK Phase 2 Strategy tests — smart compressors.
 */

import { describe, it, expect } from "bun:test";
import { StackTraceStrategy } from "../rtk/strategies/stack-trace.js";
import { ErrorAggregateStrategy } from "../rtk/strategies/error-aggregate.js";
import { TestSummaryStrategy } from "../rtk/strategies/test-summary.js";
import { DiffSummaryStrategy } from "../rtk/strategies/diff-summary.js";
import { JsonLimiterStrategy } from "../rtk/strategies/json-limiter.js";
import { BoilerplateStrategy } from "../rtk/strategies/boilerplate.js";
import { RTKPipeline } from "../rtk/pipeline.js";
import { AnsiStripStrategy } from "../rtk/strategies/ansi-strip.js";
import { BlankCollapseStrategy } from "../rtk/strategies/blank-collapse.js";
import { DedupStrategy } from "../rtk/strategies/dedup.js";
import { TruncateStrategy } from "../rtk/strategies/truncate.js";

// ─── StackTraceStrategy ─────────────────────────────────────────────────────

describe("StackTraceStrategy", () => {
  const strategy = new StackTraceStrategy();

  it("compresses a long Node.js stack trace", () => {
    const lines = [
      "TypeError: Cannot read properties of undefined",
      ...Array.from(
        { length: 15 },
        (_, i) => `    at Function${i} (src/module${i}.ts:${10 + i}:${5 + i})`,
      ),
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("TypeError");
    expect(result!.output).toContain("frames omitted");
    expect(result!.output).toContain("Function0");
    expect(result!.output).toContain("Function14"); // last frame kept
  });

  it("preserves short stack traces (< 6 frames)", () => {
    const lines = [
      "Error: something broke",
      "    at foo (file.ts:1:1)",
      "    at bar (file.ts:2:1)",
      "    at baz (file.ts:3:1)",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    // Short trace — should keep all frames (may return null or unchanged)
    if (result) {
      expect(result.output).toContain("foo");
      expect(result.output).toContain("bar");
      expect(result.output).toContain("baz");
    }
  });

  it("handles Python stack traces", () => {
    const lines = [
      "Traceback (most recent call last):",
      ...Array.from(
        { length: 10 },
        (_, i) => `  File "module${i}.py", line ${10 + i}, in func${i}`,
      ),
      "ValueError: invalid literal",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("frames omitted");
  });

  it("handles Rust stack traces", () => {
    const lines = [
      "thread 'main' panicked at 'index out of bounds'",
      "stack backtrace:",
      ...Array.from({ length: 12 }, (_, i) => `   ${i}: std::rt::lang_start_internal::${i}`),
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("frames omitted");
  });

  it("preserves non-stack content around traces", () => {
    const lines = [
      "Building project...",
      "Compilation successful",
      "Running tests...",
      "Error: test failed",
      ...Array.from({ length: 10 }, (_, i) => `    at test${i} (test.ts:${i}:1)`),
      "1 test failed, 5 passed",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("Building project");
    expect(result!.output).toContain("1 test failed");
  });

  it("returns null for non-stack-trace content", () => {
    const input = "Hello world\nJust some text\nNothing to see here";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });
});

// ─── ErrorAggregateStrategy ─────────────────────────────────────────────────

describe("ErrorAggregateStrategy", () => {
  const strategy = new ErrorAggregateStrategy();

  it("aggregates TypeScript errors by code", () => {
    const errors = Array.from(
      { length: 10 },
      (_, i) => `src/comp${i}.tsx(${10 + i},5): error TS2304: Cannot find name 'React'`,
    );
    const input = errors.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[10x]");
    expect(result!.output).toContain("TS2304");
    expect(result!.output).toContain("10 file(s)");
  });

  it("groups multiple error types separately", () => {
    const errors = [
      ...Array.from(
        { length: 5 },
        (_, i) => `src/a${i}.ts(${i},1): error TS2304: Cannot find name 'X'`,
      ),
      ...Array.from(
        { length: 4 },
        (_, i) => `src/b${i}.ts(${i},1): error TS2345: Type 'string' not assignable`,
      ),
    ];
    const input = errors.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[5x]");
    expect(result!.output).toContain("[4x]");
    expect(result!.output).toContain("TS2304");
    expect(result!.output).toContain("TS2345");
  });

  it("handles Rust errors", () => {
    const errors = [...Array.from({ length: 5 }, () => `error[E0308]: mismatched types`)];
    const input = errors.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[5x]");
    expect(result!.output).toContain("E0308");
  });

  it("returns null for too few errors", () => {
    const input = "error TS2304: test\nerror TS2304: test2\nsome other line";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("preserves non-error lines", () => {
    const lines = [
      "Running type check...",
      "",
      ...Array.from(
        { length: 6 },
        (_, i) => `src/file${i}.ts(1,1): error TS2304: Cannot find name 'X'`,
      ),
      "",
      "Found 6 errors.",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("Running type check");
    expect(result!.output).toContain("Found 6 errors");
  });
});

// ─── TestSummaryStrategy ────────────────────────────────────────────────────

describe("TestSummaryStrategy", () => {
  const strategy = new TestSummaryStrategy();

  it("collapses consecutive passed tests", () => {
    const lines = [
      "Test Suite: MyModule",
      ...Array.from({ length: 20 }, (_, i) => `  ✓ test case ${i} (${i}ms)`),
      "  ✗ failing test: expected true, got false",
      "    at file.ts:42",
      "",
      "20 pass",
      "1 fail",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("more tests passed");
    expect(result!.output).toContain("✗ failing test");
    expect(result!.output).toContain("20 pass");
    expect(result!.output).toContain("1 fail");
  });

  it("preserves all failed test output", () => {
    const lines = [
      "Test Suite: components",
      ...Array.from({ length: 10 }, (_, i) => `  ✓ test ${i + 1} (1ms)`),
      "  ✗ broken test",
      "    Error: assertion failed",
      "    expected: 42",
      "    received: undefined",
      "    at test.ts:10:5",
      "",
      "10 pass",
      "1 fail",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("more tests passed");
    expect(result!.output).toContain("✗ broken test");
    expect(result!.output).toContain("Error: assertion failed");
  });

  it("handles TAP format", () => {
    const lines = [
      "TAP version 13",
      ...Array.from({ length: 10 }, (_, i) => `ok ${i + 1} - test ${i}`),
      "not ok 11 - failing test",
      "  ---",
      "  message: expected true",
      "  ---",
      `1..11`,
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("more tests passed");
    expect(result!.output).toContain("not ok 11");
  });

  it("handles Rust test output", () => {
    const lines = [
      "running 15 tests",
      ...Array.from({ length: 12 }, (_, i) => `test test_${i} ... ok`),
      "test test_broken ... FAILED",
      "",
      "failures:",
      "  test_broken: assertion failed",
      "",
      "test result: FAILED. 12 passed; 1 failed",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("more tests passed");
    expect(result!.output).toContain("FAILED");
  });

  it("returns null for non-test output", () => {
    const input = "just some\nregular output\nnothing test-related";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("returns null for short test output", () => {
    const input = "✓ test 1\n✓ test 2\n2 pass";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });
});

// ─── DiffSummaryStrategy ────────────────────────────────────────────────────

describe("DiffSummaryStrategy", () => {
  const strategy = new DiffSummaryStrategy();

  it("summarizes a large multi-file diff", () => {
    const lines: string[] = [];
    for (let f = 0; f < 8; f++) {
      lines.push(`diff --git a/src/file${f}.ts b/src/file${f}.ts`);
      lines.push(`--- a/src/file${f}.ts`);
      lines.push(`+++ b/src/file${f}.ts`);
      lines.push(`@@ -10,5 +10,8 @@ function handler${f}()`);
      for (let i = 0; i < 30; i++) {
        lines.push(`+  added line ${i}`);
      }
      for (let i = 0; i < 10; i++) {
        lines.push(`-  removed line ${i}`);
      }
    }
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("8 file(s) changed");
    expect(result!.output).toContain("src/file0.ts");
    expect(result!.output).toContain("+30/-10");
  });

  it("extracts function names from hunk headers", () => {
    const lines = [
      "diff --git a/src/auth.ts b/src/auth.ts",
      "--- a/src/auth.ts",
      "+++ b/src/auth.ts",
      "@@ -10,5 +10,8 @@ function login()",
      ...Array.from({ length: 35 }, (_, i) => `+  line ${i}`),
      "@@ -50,3 +58,6 @@ function logout()",
      ...Array.from({ length: 35 }, (_, i) => `+  line ${i}`),
      "@@ -80,2 +94,5 @@ function refresh()",
      ...Array.from({ length: 35 }, (_, i) => `+  line ${i}`),
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("login()");
    expect(result!.output).toContain("logout()");
    expect(result!.output).toContain("refresh()");
  });

  it("returns null for short diffs", () => {
    const input = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      "-old line",
      "+new line",
    ].join("\n");
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("returns null for non-diff output", () => {
    const input = Array.from({ length: 150 }, (_, i) => `line ${i}`).join("\n");
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });
});

// ─── JsonLimiterStrategy ────────────────────────────────────────────────────

describe("JsonLimiterStrategy", () => {
  const strategy = new JsonLimiterStrategy();

  it("truncates deeply nested JSON", () => {
    const deep = {
      level1: {
        level2: {
          level3: {
            level4: { data: "hidden", more: [1, 2, 3] },
          },
          extra: Array.from({ length: 20 }, (_, i) => ({
            id: i,
            name: `item-${i}`,
            value: `value-${i}-${"x".repeat(20)}`,
          })),
        },
      },
    };
    const input = JSON.stringify(deep, null, 2);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("level1");
    expect(result!.output).toContain("level2");
    expect(result!.output).toContain("level3");
    expect(result!.output).not.toContain("hidden");
  });

  it("truncates large arrays at depth", () => {
    const data = {
      items: {
        nested: {
          values: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item-${i}` })),
        },
      },
    };
    const input = JSON.stringify(data, null, 2);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("items");
  });

  it("returns null for non-JSON input", () => {
    const input = "This is just regular text " + "x".repeat(500);
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("returns null for small JSON", () => {
    const input = JSON.stringify({ a: 1, b: 2 });
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("handles JSON arrays at root", () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      nested: { deep: { value: i * 10 } },
    }));
    const input = JSON.stringify(data, null, 2);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
  });

  it("preserves shallow JSON unchanged", () => {
    const data = { name: "test", version: "1.0.0", description: "A test " + "x".repeat(500) };
    const input = JSON.stringify(data, null, 2);
    const result = strategy.transform(input);
    // Shallow JSON should not be truncated
    expect(result).toBeNull();
  });
});

// ─── BoilerplateStrategy ────────────────────────────────────────────────────

describe("BoilerplateStrategy", () => {
  const strategy = new BoilerplateStrategy();

  it("collapses npm warnings", () => {
    const lines = [
      "Installing dependencies...",
      "npm warn deprecated pkg1@1.0.0: use pkg1@2.0.0",
      "npm warn deprecated pkg2@1.0.0: use pkg2@2.0.0",
      "npm warn deprecated pkg3@1.0.0: use pkg3@2.0.0",
      "npm warn deprecated pkg4@1.0.0: use pkg4@2.0.0",
      "npm warn deprecated pkg5@1.0.0: use pkg5@2.0.0",
      "npm warn deprecated pkg6@1.0.0: use pkg6@2.0.0",
      "",
      "added 1247 packages in 45s",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("similar lines");
    expect(result!.output).toContain("added 1247 packages");
  });

  it("collapses Cargo download lines", () => {
    const lines = [
      "Downloading crates ...",
      ...Array.from({ length: 15 }, (_, i) => `  Downloaded crate-${i} v0.${i}.0`),
      "Compiling companion v0.6.0",
      "Finished release",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("similar lines");
    expect(result!.output).toContain("Finished release");
  });

  it("keeps companion compile line in Cargo output", () => {
    const lines = [
      ...Array.from({ length: 15 }, (_, i) => `   Compiling dep-${i} v0.${i}.0`),
      "   Compiling companion v0.6.0",
      "    Finished release",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    // companion line should be preserved (matches keep pattern)
    expect(result!.output).toContain("companion");
  });

  it("returns null for non-boilerplate output", () => {
    const input = Array.from({ length: 10 }, (_, i) => `regular line ${i}`).join("\n");
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });
});

// ─── Full Pipeline Integration ──────────────────────────────────────────────

/** Helper: build full pipeline with all 10 strategies (bypasses license gate) */
function buildFullPipeline(): RTKPipeline {
  return new RTKPipeline([
    new AnsiStripStrategy(),
    new BoilerplateStrategy(),
    new StackTraceStrategy(),
    new ErrorAggregateStrategy(),
    new TestSummaryStrategy(),
    new DiffSummaryStrategy(),
    new JsonLimiterStrategy(),
    new BlankCollapseStrategy(),
    new DedupStrategy(),
    new TruncateStrategy(),
  ]);
}

describe("Full Pipeline (Phase 1+2)", () => {
  it("handles real-world cargo build + test output", () => {
    const pipeline = buildFullPipeline();
    const input = [
      "\x1b[1m\x1b[32m  Downloading\x1b[0m crates ...",
      ...Array.from(
        { length: 20 },
        (_, i) => `\x1b[1m\x1b[32m   Downloaded\x1b[0m dep-${i} v0.${i}.0`,
      ),
      ...Array.from(
        { length: 30 },
        (_, i) => `\x1b[1m\x1b[32m   Compiling\x1b[0m dep-${i} v0.${i}.0`,
      ),
      "\x1b[1m\x1b[32m   Compiling\x1b[0m companion v0.6.0",
      "\x1b[1m\x1b[32m    Finished\x1b[0m release in 3m 26s",
      "",
      "running 10 tests",
      ...Array.from({ length: 8 }, (_, i) => `test test_${i} ... ok`),
      "test test_broken ... FAILED",
      "",
      "failures:",
      "  test_broken: assertion failed",
      "Error: expected 42, got 0",
      ...Array.from({ length: 10 }, (_, i) => `    at frame${i} (src/test.rs:${i + 1}:1)`),
      "",
      "test result: FAILED. 8 passed; 1 failed",
    ].join("\n");

    const result = pipeline.transform(input);
    expect(result.savings.totalTokensSaved).toBeGreaterThan(50);
    // ANSI stripped
    expect(result.compressed).not.toContain("\x1b[");
    // Test summary collapsed passes
    expect(result.compressed).toContain("FAILED");
    // Key info preserved — test failures and summary
    expect(result.compressed).toContain("test_broken");
    expect(result.compressed).toContain("test result");
  });

  it("handles TypeScript errors + npm warnings together", () => {
    const pipeline = buildFullPipeline();
    const input = [
      "\x1b[33mnpm warn\x1b[0m deprecated pkg1@1.0.0: use pkg1@2.0.0",
      "\x1b[33mnpm warn\x1b[0m deprecated pkg2@1.0.0: use pkg2@2.0.0",
      "\x1b[33mnpm warn\x1b[0m deprecated pkg3@1.0.0: use pkg3@2.0.0",
      "\x1b[33mnpm warn\x1b[0m deprecated pkg4@1.0.0: use pkg4@2.0.0",
      "",
      ...Array.from(
        { length: 15 },
        (_, i) => `src/comp${i}.tsx(${i},1): error TS2304: Cannot find name 'React'`,
      ),
      "",
      "Found 15 errors.",
    ].join("\n");

    const result = pipeline.transform(input);
    expect(result.savings.totalTokensSaved).toBeGreaterThan(30);
    expect(result.compressed).not.toContain("\x1b[");
    expect(result.compressed).toContain("TS2304");
    expect(result.compressed).toContain("Found 15 errors");
  });

  it("reports all applied strategies", () => {
    // Build pipeline with all strategies directly (createDefaultPipeline is license-gated)
    const pipeline = new RTKPipeline([
      new AnsiStripStrategy(),
      new BoilerplateStrategy(),
      new StackTraceStrategy(),
      new ErrorAggregateStrategy(),
      new TestSummaryStrategy(),
      new DiffSummaryStrategy(),
      new JsonLimiterStrategy(),
      new BlankCollapseStrategy(),
      new DedupStrategy(),
      new TruncateStrategy(),
    ]);
    expect(pipeline.getStrategyNames()).toHaveLength(10);
    expect(pipeline.getStrategyNames()).toContain("stack-trace");
    expect(pipeline.getStrategyNames()).toContain("error-aggregate");
    expect(pipeline.getStrategyNames()).toContain("test-summary");
    expect(pipeline.getStrategyNames()).toContain("diff-summary");
    expect(pipeline.getStrategyNames()).toContain("json-limiter");
    expect(pipeline.getStrategyNames()).toContain("boilerplate");
  });
});
