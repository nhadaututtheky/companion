/**
 * RTK Strategy: Blank Line Collapser
 *
 * Collapses 2+ consecutive blank lines into a single blank line.
 * Also trims leading/trailing blank lines from the entire output.
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Two or more consecutive blank lines (may contain whitespace) */
const MULTI_BLANK_RE = /(\n\s*){3,}/g;

export class BlankCollapseStrategy implements RTKStrategy {
  readonly name = "blank-collapse";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const output = input
      .replace(MULTI_BLANK_RE, "\n\n")
      .trim();

    if (output === input) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
