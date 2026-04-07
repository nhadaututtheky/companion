/**
 * RTK Strategy: Error Type Aggregator
 *
 * Groups errors by type/code and summarizes:
 *   47 x "error TS2304: Cannot find name 'X'" — across 12 files
 * Instead of listing each one individually.
 *
 * Detects common error formats:
 * - TypeScript: TS2304, TS2345, etc.
 * - ESLint: no-unused-vars, react/prop-types, etc.
 * - Rust: E0308, E0425, etc.
 * - Generic: "error:", "warning:", "Error:"
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum errors of same type to trigger aggregation */
const AGGREGATE_THRESHOLD = 3;

/** Minimum total error lines to even attempt aggregation */
const MIN_ERROR_LINES = 5;

// ─── Error Pattern Matchers ─────────────────────────────────────────────────

interface ErrorMatch {
  /** Error code or category for grouping */
  code: string;
  /** Full error message (first occurrence kept verbatim) */
  message: string;
  /** File path if detected */
  file?: string;
  /** Original line */
  line: string;
}

/** TypeScript: src/foo.ts(10,5): error TS2304: ... */
const TS_ERROR_RE = /^(.+?)\(\d+,\d+\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/;

/** ESLint: /path/file.ts:10:5 warning|error rule-name message */
const ESLINT_ERROR_RE = /^(.+?):\d+:\d+\s+(error|warning)\s+(.+?)\s{2,}([\w-]+\/[\w-]+|[\w-]+)$/;

/** Rust: error[E0308]: mismatched types */
const RUST_ERROR_RE = /^(error|warning)\[([A-Z]\d+)\]:\s*(.+)$/;

/** Generic: error: message or Error: message */
const _GENERIC_ERROR_RE = /^(.*?)(error|Error|ERROR|warning|Warning|WARNING):\s*(.+)$/;

function matchError(line: string): ErrorMatch | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // TypeScript
  const tsMatch = trimmed.match(TS_ERROR_RE);
  if (tsMatch) {
    return {
      code: tsMatch[3]!,
      message: `${tsMatch[2]} ${tsMatch[3]}: ${tsMatch[4]}`,
      file: tsMatch[1],
      line: trimmed,
    };
  }

  // ESLint
  const eslintMatch = trimmed.match(ESLINT_ERROR_RE);
  if (eslintMatch) {
    return {
      code: eslintMatch[4]!,
      message: `${eslintMatch[2]} ${eslintMatch[4]}: ${eslintMatch[3]}`,
      file: eslintMatch[1],
      line: trimmed,
    };
  }

  // Rust
  const rustMatch = trimmed.match(RUST_ERROR_RE);
  if (rustMatch) {
    return {
      code: rustMatch[2]!,
      message: `${rustMatch[1]}[${rustMatch[2]}]: ${rustMatch[3]}`,
      line: trimmed,
    };
  }

  return null;
}

// ─── Strategy ───────────────────────────────────────────────────────────────

export class ErrorAggregateStrategy implements RTKStrategy {
  readonly name = "error-aggregate";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");

    // Quick check: enough error-like lines?
    let errorCount = 0;
    for (const line of lines) {
      if (matchError(line)) errorCount++;
    }
    if (errorCount < MIN_ERROR_LINES) return null;

    // Group errors by code
    const groups = new Map<string, { match: ErrorMatch; count: number; files: Set<string> }>();
    const nonErrorLines: Array<{ idx: number; line: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const match = matchError(lines[i]!);
      if (match) {
        const existing = groups.get(match.code);
        if (existing) {
          existing.count++;
          if (match.file) existing.files.add(match.file);
        } else {
          const files = new Set<string>();
          if (match.file) files.add(match.file);
          groups.set(match.code, { match, count: 1, files });
        }
      } else {
        nonErrorLines.push({ idx: i, line: lines[i]! });
      }
    }

    // Check if any group exceeds threshold
    const hasAggregatable = [...groups.values()].some((g) => g.count >= AGGREGATE_THRESHOLD);
    if (!hasAggregatable) return null;

    // Build output: interleave non-error lines at original positions,
    // replace first occurrence of each error group with aggregated summary
    const outputLines: string[] = [];
    const emittedGroups = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const match = matchError(lines[i]!);
      if (!match) {
        // Non-error line — keep at original position
        outputLines.push(lines[i]!);
      } else {
        const group = groups.get(match.code)!;
        if (emittedGroups.has(match.code)) {
          // Already emitted this group's summary — skip duplicate
          continue;
        }
        emittedGroups.add(match.code);

        if (group.count >= AGGREGATE_THRESHOLD) {
          const filesInfo =
            group.files.size > 0 ? ` — in ${group.files.size} file(s)` : "";
          outputLines.push(`[${group.count}x] ${group.match.message}${filesInfo}`);
        } else {
          // Below threshold — keep original line(s)
          outputLines.push(group.match.line);
          if (group.count > 1) {
            outputLines.push(`  (+ ${group.count - 1} more)`);
          }
        }
      }
    }

    const output = outputLines.join("\n");
    if (output.length >= input.length) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
