/**
 * RTK Strategy: Diff Summarizer
 *
 * For large git diff outputs, summarizes changes per file:
 *   "Modified src/auth.ts: +15/-3 (login(), logout())"
 * Instead of showing full hunks.
 *
 * Threshold: 100+ lines of diff triggers summarization.
 * Keeps small diffs unchanged.
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum diff lines to trigger summarization */
const MIN_DIFF_LINES = 100;

/** Max hunk lines to keep per file before summarizing */
const MAX_HUNK_LINES_PER_FILE = 30;

// ─── Diff Parser ────────────────────────────────────────────────────────────

interface DiffFile {
  path: string;
  added: number;
  removed: number;
  hunks: string[];
  /** Function/method names found in hunk headers */
  functions: string[];
}

/** Hunk header: @@ -10,5 +10,8 @@ function name */
const HUNK_HEADER_RE = /^@@\s+[^@]+\s+@@\s*(.*)$/;

function parseDiff(lines: string[]): DiffFile[] | null {
  // Quick check: does this look like a diff?
  const hasDiffMarkers = lines.some(
    (l) => l.startsWith("diff --git") || l.startsWith("--- a/") || l.startsWith("+++ b/"),
  );
  if (!hasDiffMarkers) return null;

  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const line of lines) {
    // New file
    if (line.startsWith("diff --git")) {
      if (current) files.push(current);
      const match = line.match(/b\/(.+)$/);
      current = {
        path: match?.[1] ?? "unknown",
        added: 0,
        removed: 0,
        hunks: [],
        functions: [],
      };
      continue;
    }

    if (!current) continue;

    // Hunk header
    const hunkMatch = line.match(HUNK_HEADER_RE);
    if (hunkMatch) {
      const funcName = hunkMatch[1]?.trim();
      if (funcName && !current.functions.includes(funcName)) {
        current.functions.push(funcName);
      }
      current.hunks.push(line);
      continue;
    }

    // Count additions/deletions
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added++;
      current.hunks.push(line);
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed++;
      current.hunks.push(line);
    } else {
      current.hunks.push(line);
    }
  }

  if (current) files.push(current);
  return files.length > 0 ? files : null;
}

// ─── Strategy ───────────────────────────────────────────────────────────────

export class DiffSummaryStrategy implements RTKStrategy {
  readonly name = "diff-summary";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    if (lines.length < MIN_DIFF_LINES) return null;

    const files = parseDiff(lines);
    if (!files) return null;

    // Build summary
    const outputLines: string[] = [];
    outputLines.push(`Diff summary: ${files.length} file(s) changed`);
    outputLines.push("");

    for (const file of files) {
      const funcs = file.functions.length > 0 ? ` (${file.functions.slice(0, 5).join(", ")})` : "";
      outputLines.push(`  ${file.path}: +${file.added}/-${file.removed}${funcs}`);

      // Keep first few hunk lines for small changes
      if (file.hunks.length <= MAX_HUNK_LINES_PER_FILE) {
        for (const hunk of file.hunks) {
          outputLines.push(`    ${hunk}`);
        }
      } else {
        // Show abbreviated hunks
        const preview = file.hunks.slice(0, 15);
        for (const hunk of preview) {
          outputLines.push(`    ${hunk}`);
        }
        outputLines.push(`    ... (${file.hunks.length - 15} more lines in this file)`);
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
