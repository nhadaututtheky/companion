/**
 * RTK Strategy: Boilerplate Header/Footer Removal
 *
 * Removes known boilerplate from common tools:
 * - npm/bun install summaries
 * - Cargo build preamble (Downloading/Compiling lines for deps)
 * - TypeScript version banners
 * - Webpack/Vite build stats headers
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Minimum lines to bother checking for boilerplate */
const MIN_LINES = 8;

// ─── Boilerplate Patterns ───────────────────────────────────────────────────

interface BoilerplateRule {
  /** Pattern to match boilerplate lines */
  match: RegExp;
  /** Keep lines matching this (important info within boilerplate region) */
  keep?: RegExp;
  /** Max consecutive boilerplate lines to trigger removal */
  threshold: number;
}

const RULES: BoilerplateRule[] = [
  // npm/bun: "added 1247 packages" is useful, but "npm warn deprecated X" x20 is not
  {
    match: /^\s*(npm|bun)\s+(warn|WARN|notice|info)\s/,
    keep: /\b(vulnerabilit|error|fail|ERR!)/i,
    threshold: 3,
  },
  // Cargo: "Downloading crates..." + "Downloaded X vN.N" lines
  {
    match: /^\s*(Downloading|Downloaded)\s+(crates|[\w_-]+\s+v\d)/,
    threshold: 5,
  },
  // Cargo: "Compiling X vN.N" for dependencies (not the project crate)
  {
    match: /^\s*Compiling\s+[\w_-]+\s+v\d/,
    keep: /Compiling\s+companion\b/i, // Keep the project's own compilation line
    threshold: 10,
  },
  // pip: "Collecting", "Downloading", "Installing"
  {
    match: /^\s*(Collecting|Downloading|Installing)\s+[\w_-]/,
    threshold: 5,
  },
  // TypeScript version banner
  {
    match: /^Version \d+\.\d+\.\d+$/,
    threshold: 1,
  },
];

// ─── Strategy ───────────────────────────────────────────────────────────────

export class BoilerplateStrategy implements RTKStrategy {
  readonly name = "boilerplate";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    if (lines.length < MIN_LINES) return null;

    // Mark lines for removal
    const keep = new Array(lines.length).fill(true) as boolean[];
    let anyRemoved = false;

    for (const rule of RULES) {
      // Find consecutive groups of boilerplate lines
      let groupStart = -1;
      let groupCount = 0;

      for (let i = 0; i <= lines.length; i++) {
        const line = i < lines.length ? lines[i]! : "";
        const isBoilerplate = i < lines.length && rule.match.test(line);
        const isKept = rule.keep ? rule.keep.test(line) : false;

        if (isBoilerplate && !isKept) {
          if (groupStart < 0) groupStart = i;
          groupCount++;
        } else {
          // End of group — check if it exceeds threshold
          if (groupCount >= rule.threshold) {
            // Keep first and last, remove middle
            for (let j = groupStart + 1; j < groupStart + groupCount - 1; j++) {
              keep[j] = false;
              anyRemoved = true;
            }
            // Replace middle with count
            if (groupCount > 2) {
              lines[groupStart + 1] = `  ... (${groupCount - 2} similar lines)`;
              keep[groupStart + 1] = true;
            }
          }
          groupStart = -1;
          groupCount = 0;
        }
      }
    }

    if (!anyRemoved) return null;

    const outputLines = lines.filter((_, i) => keep[i]);
    const output = outputLines.join("\n");

    if (output.length >= input.length) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
