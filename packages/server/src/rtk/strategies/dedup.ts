/**
 * RTK Strategy: Duplicate Line Merger
 *
 * Detects repeated lines and merges them with occurrence count.
 * Threshold: 3+ occurrences to trigger merge.
 * Keeps first occurrence verbatim, replaces subsequent with count.
 *
 * Example:
 *   WARNING: unused variable 'x'
 *   WARNING: unused variable 'y'
 *   WARNING: unused variable 'z'
 *   ... (same pattern x47 more)
 *  →
 *   WARNING: unused variable 'x'
 *   [... 49 similar lines omitted]
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum duplicate count to trigger merge */
const DEDUP_THRESHOLD = 3;

/**
 * Normalize a line for dedup comparison.
 * Strips variable parts: numbers, hex, UUIDs, timestamps, file paths after last /.
 */
function normalizeForComparison(line: string): string {
  return line
    .replace(/\b[0-9a-f]{8,}\b/gi, "<HEX>")           // hex strings
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/g, "<TS>") // timestamps
    .replace(/\b\d+(\.\d+)?\b/g, "<N>")                // numbers
    .replace(/['"][^'"]{0,80}['"]/g, "<STR>")           // quoted strings
    .replace(/\b\w+\.(tsx?|jsx?|py|rs|go|java|c|cpp|h|css|html|json|md|yml|yaml)\b/g, "<FILE>") // file names
    .replace(/[A-Z]:\\[^\s:]+|\/[^\s:]+/g, "<PATH>")   // full paths
    .trim();
}

export class DedupStrategy implements RTKStrategy {
  readonly name = "dedup";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    if (lines.length < DEDUP_THRESHOLD) return null;

    // Group consecutive lines by normalized form
    const groups: Array<{ normalized: string; lines: string[]; startIdx: number }> = [];
    let currentGroup: { normalized: string; lines: string[]; startIdx: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const normalized = normalizeForComparison(line);

      // Skip blank lines — don't group them
      if (normalized === "" || normalized === "<N>") {
        if (currentGroup) {
          groups.push(currentGroup);
          currentGroup = null;
        }
        groups.push({ normalized: `__blank_${i}__`, lines: [line], startIdx: i });
        continue;
      }

      if (currentGroup && currentGroup.normalized === normalized) {
        currentGroup.lines.push(line);
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { normalized, lines: [line], startIdx: i };
      }
    }
    if (currentGroup) groups.push(currentGroup);

    // Check if any group exceeds threshold
    const hasDuplicates = groups.some((g) => g.lines.length >= DEDUP_THRESHOLD);
    if (!hasDuplicates) return null;

    // Rebuild output with merged groups
    const outputLines: string[] = [];
    for (const group of groups) {
      if (group.lines.length >= DEDUP_THRESHOLD) {
        outputLines.push(group.lines[0]!);
        outputLines.push(`[... ${group.lines.length - 1} similar lines omitted]`);
      } else {
        outputLines.push(...group.lines);
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
