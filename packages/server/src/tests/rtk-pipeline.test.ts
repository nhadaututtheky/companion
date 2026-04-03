/**
 * RTK Pipeline + Strategy tests.
 * Tests all Phase 1 strategies independently and the pipeline as a whole.
 */

import { describe, it, expect } from "bun:test";
import { RTKPipeline, estimateTokens, tokenDiff } from "../rtk/pipeline.js";
import { AnsiStripStrategy } from "../rtk/strategies/ansi-strip.js";
import { BlankCollapseStrategy } from "../rtk/strategies/blank-collapse.js";
import { DedupStrategy } from "../rtk/strategies/dedup.js";
import { TruncateStrategy } from "../rtk/strategies/truncate.js";
import { createDefaultPipeline } from "../rtk/index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function repeat(str: string, n: number): string {
  return Array(n).fill(str).join("\n");
}

// ─── estimateTokens / tokenDiff ─────────────────────────────────────────────

describe("estimateTokens", () => {
  it("estimates 1 token per 4 chars", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("tokenDiff", () => {
  it("returns positive diff when compressed is smaller", () => {
    expect(tokenDiff("a".repeat(100), "a".repeat(40))).toBe(15);
  });

  it("returns 0 when compressed is same or larger", () => {
    expect(tokenDiff("abc", "abcde")).toBe(0);
  });
});

// ─── AnsiStripStrategy ──────────────────────────────────────────────────────

describe("AnsiStripStrategy", () => {
  const strategy = new AnsiStripStrategy();

  it("strips CSI color sequences", () => {
    const input = "\x1b[32mSuccess\x1b[0m: All tests passed";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("Success: All tests passed");
  });

  it("strips OSC sequences (terminal title changes)", () => {
    const input = "\x1b]0;My Terminal\x07Some output here";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("Some output here");
  });

  it("strips control characters", () => {
    const input = "Hello\x00World\x08Test";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("HelloWorldTest");
  });

  it("handles carriage return overwrites", () => {
    const input = "Downloading... 50%\rDownloading... 100%";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("Downloading... 100%");
  });

  it("strips progress bar characters", () => {
    const input = "Building:\n████████░░░░ 67%\nDone!";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).not.toContain("████");
    expect(result!.output).toContain("Done!");
  });

  it("trims trailing whitespace per line", () => {
    const input = "line one   \nline two  \nline three";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("line one\nline two\nline three");
  });

  it("returns null when nothing to strip", () => {
    const input = "clean output\nno ansi here";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("strips complex nested ANSI sequences", () => {
    const input = "\x1b[1m\x1b[31mERROR\x1b[0m: \x1b[4mfile.ts\x1b[0m:42";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("ERROR: file.ts:42");
  });

  it("reports token savings", () => {
    const input = "\x1b[32m" + "x".repeat(100) + "\x1b[0m";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.tokensSaved).toBeGreaterThan(0);
  });
});

// ─── BlankCollapseStrategy ──────────────────────────────────────────────────

describe("BlankCollapseStrategy", () => {
  const strategy = new BlankCollapseStrategy();

  it("collapses 3+ blank lines into 1", () => {
    const input = "line1\n\n\n\n\nline2";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("line1\n\nline2");
  });

  it("preserves single blank lines", () => {
    const input = "line1\n\nline2\n\nline3";
    const result = strategy.transform(input);
    // Single blanks preserved, but trim may change it
    expect(result?.output ?? input).toContain("line1");
    expect(result?.output ?? input).toContain("line2");
  });

  it("trims leading and trailing blank lines", () => {
    const input = "\n\n\ncontent\n\n\n";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toBe("content");
  });

  it("returns null when no blank lines to collapse", () => {
    const input = "line1\nline2\nline3";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("handles lines with only whitespace", () => {
    const input = "line1\n   \n   \n   \nline2";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output.split("\n").length).toBeLessThanOrEqual(3);
  });

  it("reports token savings", () => {
    const input = "a\n" + "\n".repeat(50) + "b";
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.tokensSaved).toBeGreaterThan(0);
  });
});

// ─── DedupStrategy ──────────────────────────────────────────────────────────

describe("DedupStrategy", () => {
  const strategy = new DedupStrategy();

  it("merges 3+ consecutive identical lines", () => {
    const input = repeat("WARNING: unused variable", 10);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("WARNING: unused variable");
    expect(result!.output).toContain("[... 9 similar lines omitted]");
  });

  it("does not merge below threshold (< 3)", () => {
    const input = "WARNING: a\nWARNING: a";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("handles multiple duplicate groups", () => {
    const lines = [
      ...Array(5).fill("Error: timeout"),
      "separator line",
      ...Array(4).fill("Error: connection refused"),
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[... 4 similar lines omitted]");
    expect(result!.output).toContain("[... 3 similar lines omitted]");
    expect(result!.output).toContain("separator line");
  });

  it("normalizes numbers for comparison", () => {
    const lines = [
      "Processing file 1 of 100",
      "Processing file 2 of 100",
      "Processing file 3 of 100",
      "Processing file 4 of 100",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[... 3 similar lines omitted]");
  });

  it("normalizes quoted strings for comparison", () => {
    const lines = [
      "Cannot find module 'foo'",
      "Cannot find module 'bar'",
      "Cannot find module 'baz'",
      "Cannot find module 'qux'",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("[... 3 similar lines omitted]");
  });

  it("preserves non-duplicate lines", () => {
    const lines = [
      "first unique",
      ...Array(5).fill("duplicate line"),
      "second unique",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.output).toContain("first unique");
    expect(result!.output).toContain("second unique");
  });

  it("handles blank lines without grouping them", () => {
    const lines = [
      "line1",
      "",
      "",
      "",
      "line2",
    ];
    const input = lines.join("\n");
    const result = strategy.transform(input);
    // Blank lines should not be grouped as duplicates
    expect(result).toBeNull();
  });

  it("returns null for short inputs", () => {
    const input = "just\na\nfew\nlines";
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("reports accurate token savings", () => {
    const input = repeat("WARNING: unused variable 'x' in module 'main'", 50);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.tokensSaved).toBeGreaterThan(100);
  });
});

// ─── TruncateStrategy ───────────────────────────────────────────────────────

describe("TruncateStrategy", () => {
  const strategy = new TruncateStrategy();

  it("does not truncate output under 200 lines", () => {
    const input = repeat("line", 199);
    const result = strategy.transform(input);
    expect(result).toBeNull();
  });

  it("truncates output over 200 lines", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    // Should contain head lines
    expect(result!.output).toContain("line 1");
    expect(result!.output).toContain("line 80");
    // Should contain tail lines
    expect(result!.output).toContain("line 500");
    expect(result!.output).toContain("line 461");
    // Should contain omission message
    expect(result!.output).toContain("lines omitted");
    expect(result!.output).toContain("500 total");
  });

  it("keeps more lines for error outputs", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `error line ${i + 1}`);
    const input = lines.join("\n");
    const result = strategy.transform(input, { sessionId: "test", isError: true });
    // Error mode: 400 line threshold, so 500 lines still gets truncated
    expect(result).not.toBeNull();
    // Error mode keeps more head lines (150 vs 80)
    expect(result!.output).toContain("error line 150");
  });

  it("does not truncate errors under 400 lines", () => {
    const lines = Array.from({ length: 350 }, (_, i) => `error ${i}`);
    const input = lines.join("\n");
    const result = strategy.transform(input, { sessionId: "test", isError: true });
    expect(result).toBeNull();
  });

  it("includes correct omission count", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
    const input = lines.join("\n");
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    // 300 - 80 head - 40 tail = 180 omitted
    expect(result!.output).toContain("180 lines omitted");
  });

  it("reports token savings proportional to cut", () => {
    const input = repeat("x".repeat(50), 500);
    const result = strategy.transform(input);
    expect(result).not.toBeNull();
    expect(result!.tokensSaved).toBeGreaterThan(500);
  });
});

// ─── RTKPipeline (integration) ──────────────────────────────────────────────

describe("RTKPipeline", () => {
  it("skips inputs shorter than 100 chars", () => {
    const pipeline = createDefaultPipeline();
    const result = pipeline.transform("short output");
    expect(result.compressed).toBe("short output");
    expect(result.savings.totalTokensSaved).toBe(0);
    expect(result.savings.strategiesApplied).toHaveLength(0);
  });

  it("applies multiple strategies in sequence", () => {
    const pipeline = createDefaultPipeline();
    // Input with ANSI codes + blank lines + duplicates
    const input = [
      "\x1b[32mCompiling\x1b[0m module 1",
      "",
      "",
      "",
      "",
      ...Array(10).fill("\x1b[33mWARNING\x1b[0m: unused import"),
      "Done!",
    ].join("\n");

    const result = pipeline.transform(input);
    expect(result.compressed).not.toContain("\x1b[");
    expect(result.compressed).toContain("[... 9 similar lines omitted]");
    expect(result.savings.totalTokensSaved).toBeGreaterThan(0);
    expect(result.savings.strategiesApplied.length).toBeGreaterThanOrEqual(1);
    expect(result.original).toBe(input);
  });

  it("preserves original output", () => {
    const pipeline = createDefaultPipeline();
    const input = "\x1b[31m" + "error\n".repeat(50);
    const result = pipeline.transform(input);
    expect(result.original).toBe(input);
    expect(result.compressed).not.toBe(input);
  });

  it("calculates compression ratio correctly", () => {
    const pipeline = createDefaultPipeline();
    const input = "x".repeat(200) + "\n" + "\n".repeat(100) + "y".repeat(50);
    const result = pipeline.transform(input);
    expect(result.savings.ratio).toBeLessThanOrEqual(1);
    expect(result.savings.ratio).toBeGreaterThan(0);
    expect(result.savings.originalChars).toBe(input.length);
    expect(result.savings.compressedChars).toBeLessThanOrEqual(input.length);
  });

  it("handles strategy errors gracefully", () => {
    // Create a pipeline with a broken strategy
    const brokenStrategy = {
      name: "broken",
      transform: () => {
        throw new Error("intentional");
      },
    };
    const pipeline = new RTKPipeline([brokenStrategy, new BlankCollapseStrategy()]);
    const input = "content\n\n\n\n\nmore content" + "x".repeat(100);
    // Should not throw, should skip broken strategy
    const result = pipeline.transform(input);
    expect(result.compressed).toBeDefined();
  });

  it("lists strategy names", () => {
    const pipeline = createDefaultPipeline();
    const names = pipeline.getStrategyNames();
    expect(names).toContain("ansi-strip");
    expect(names).toContain("blank-collapse");
    expect(names).toContain("dedup");
    expect(names).toContain("truncate");
  });

  it("handles real-world cargo build output", () => {
    const pipeline = createDefaultPipeline();
    const input = [
      "\x1b[1m\x1b[32m   Compiling\x1b[0m proc-macro2 v1.0.106",
      "\x1b[1m\x1b[32m   Compiling\x1b[0m unicode-ident v1.0.24",
      "\x1b[1m\x1b[32m   Compiling\x1b[0m quote v1.0.45",
      ...Array(100).fill("\x1b[1m\x1b[32m   Compiling\x1b[0m some-crate v0.1.0"),
      "\x1b[1m\x1b[32m    Finished\x1b[0m `release` profile in 3m 26s",
    ].join("\n");

    const result = pipeline.transform(input);
    expect(result.compressed).not.toContain("\x1b[");
    expect(result.compressed).toContain("Compiling");
    expect(result.compressed).toContain("Finished");
    expect(result.compressed).toContain("similar lines");
    expect(result.savings.totalTokensSaved).toBeGreaterThan(50);
  });

  it("handles real-world TypeScript error output", () => {
    const pipeline = createDefaultPipeline();
    const errors = Array.from({ length: 30 }, (_, i) =>
      `src/components/Widget${i}.tsx(${10 + i},5): error TS2304: Cannot find name 'React'.`
    );
    const input = errors.join("\n");

    const result = pipeline.transform(input);
    expect(result.compressed).toContain("TS2304");
    expect(result.savings.totalTokensSaved).toBeGreaterThan(20);
  });

  it("handles real-world npm install output", () => {
    const pipeline = createDefaultPipeline();
    const input = [
      "\x1b[32mnpm\x1b[0m \x1b[36minfo\x1b[0m using npm@10.8.0",
      "",
      "",
      "",
      "added 1247 packages in 45s",
      "",
      "",
      "",
      "\x1b[33m12 packages are looking for funding\x1b[0m",
      "  run `npm fund` for details",
    ].join("\n");

    const result = pipeline.transform(input);
    expect(result.compressed).not.toContain("\x1b[");
    expect(result.compressed).toContain("added 1247 packages");
  });
});
