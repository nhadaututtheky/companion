/**
 * RTK Strategy: Test Result Summarizer
 *
 * Collapses passed test output, keeps failed tests with full output.
 * Supports common test runners: Bun, Vitest/Jest, pytest, cargo test.
 *
 * Example:
 *   ✓ test 1 (2ms)
 *   ✓ test 2 (1ms)
 *   ... (48 more passed)
 *   ✗ test 51: expected true, got false
 *     at file.ts:42
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum test output lines to attempt summarization */
const MIN_LINES = 15;

/** Max consecutive pass lines before collapsing */
const PASS_COLLAPSE_THRESHOLD = 3;

// ─── Test Line Classifiers ──────────────────────────────────────────────────

type LineType = "pass" | "fail" | "summary" | "other";

/** Pass patterns */
const PASS_PATTERNS = [
  /^\s*[✓✔☑⦿●]\s/,              // ✓ test name
  /^\s*\(pass\)/i,               // (pass)
  /^\s*PASS\s/,                  // PASS src/test.ts
  /^\s*ok\s+\d+/,               // TAP: ok 1 - test name
  /^\s*test\s+.+\s+\.\.\.\s+ok/i, // Rust: test foo ... ok
  /^\s*√\s/,                     // √ test name (Windows)
];

/** Fail patterns */
const FAIL_PATTERNS = [
  /^\s*[✗✘☒✖×]\s/,              // ✗ test name
  /^\s*\(fail\)/i,               // (fail)
  /^\s*FAIL\s/,                  // FAIL src/test.ts
  /^\s*not\s+ok\s+\d+/,         // TAP: not ok 1
  /^\s*test\s+.+\s+\.\.\.\s+FAILED/i, // Rust: test foo ... FAILED
  /^\s*×\s/,                     // × test name
  /^\(fail\)\s/,                 // (fail) test name
];

/** Summary patterns (keep as-is) */
const SUMMARY_PATTERNS = [
  /^\s*\d+\s+(pass|passed)/i,
  /^\s*\d+\s+(fail|failed)/i,
  /^\s*Tests?:\s+\d+/i,
  /^\s*Test Suites?:/i,
  /^\s*Ran\s+\d+\s+tests?/i,
  /^test result:/i,
  /^\s*\d+\s+expect\(\)\s+calls?/i,
];

function classifyLine(line: string): LineType {
  const trimmed = line.trim();
  if (!trimmed) return "other";

  for (const pattern of SUMMARY_PATTERNS) {
    if (pattern.test(trimmed)) return "summary";
  }
  for (const FAIL_PATTERN of FAIL_PATTERNS) {
    if (FAIL_PATTERN.test(trimmed)) return "fail";
  }
  for (const pattern of PASS_PATTERNS) {
    if (pattern.test(trimmed)) return "pass";
  }
  return "other";
}

// ─── Strategy ───────────────────────────────────────────────────────────────

export class TestSummaryStrategy implements RTKStrategy {
  readonly name = "test-summary";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    if (lines.length < MIN_LINES) return null;

    // Classify all lines
    const classified = lines.map((line) => ({
      line,
      type: classifyLine(line),
    }));

    // Check if this looks like test output (need some pass/fail lines)
    const passCount = classified.filter((c) => c.type === "pass").length;
    const failCount = classified.filter((c) => c.type === "fail").length;
    if (passCount + failCount < 3) return null;

    // Build output: collapse consecutive pass lines, keep everything else
    const outputLines: string[] = [];
    let consecutivePasses: string[] = [];

    const flushPasses = () => {
      if (consecutivePasses.length <= PASS_COLLAPSE_THRESHOLD) {
        outputLines.push(...consecutivePasses);
      } else {
        outputLines.push(consecutivePasses[0]!);
        outputLines.push(`  ... (${consecutivePasses.length - 1} more tests passed)`);
      }
      consecutivePasses = [];
    };

    let inFailBlock = false;

    for (const { line, type } of classified) {
      if (type === "pass") {
        if (inFailBlock) inFailBlock = false;
        consecutivePasses.push(line);
      } else {
        if (consecutivePasses.length > 0) flushPasses();

        if (type === "fail") {
          inFailBlock = true;
          outputLines.push(line);
        } else if (type === "summary") {
          inFailBlock = false;
          outputLines.push(line);
        } else {
          // "other" — keep if we're in a fail block (stack traces, assertions)
          // or if it's non-test content (headers, separators)
          if (inFailBlock || passCount === 0) {
            outputLines.push(line);
          } else {
            // Outside fail block — keep if not indented (likely a section header)
            if (!line.startsWith("  ") && !line.startsWith("\t")) {
              outputLines.push(line);
            } else if (inFailBlock) {
              outputLines.push(line);
            }
            // Skip indented lines outside fail blocks (pass test details)
          }
        }
      }
    }

    if (consecutivePasses.length > 0) flushPasses();

    const output = outputLines.join("\n");
    if (output.length >= input.length) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
