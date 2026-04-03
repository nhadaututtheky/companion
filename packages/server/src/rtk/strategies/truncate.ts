/**
 * RTK Strategy: Smart Truncation
 *
 * For outputs exceeding MAX_LINES, keeps head + tail and cuts the middle.
 * Never truncates error outputs aggressively.
 *
 * Default: 200 lines max → keep 80 head + 40 tail.
 * Error mode: 400 lines max → keep 150 head + 80 tail.
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Max lines before truncation kicks in */
const MAX_LINES_NORMAL = 200;
const MAX_LINES_ERROR = 400;

/** How many head lines to keep */
const HEAD_LINES_NORMAL = 80;
const HEAD_LINES_ERROR = 150;

/** How many tail lines to keep */
const TAIL_LINES_NORMAL = 40;
const TAIL_LINES_ERROR = 80;

export class TruncateStrategy implements RTKStrategy {
  readonly name = "truncate";

  transform(input: string, context?: RTKContext): RTKResult | null {
    const lines = input.split("\n");
    const isError = context?.isError ?? false;

    const maxLines = isError ? MAX_LINES_ERROR : MAX_LINES_NORMAL;

    if (lines.length <= maxLines) return null;

    const headCount = isError ? HEAD_LINES_ERROR : HEAD_LINES_NORMAL;
    const tailCount = isError ? TAIL_LINES_ERROR : TAIL_LINES_NORMAL;
    const omitted = Math.max(0, lines.length - headCount - tailCount);

    const head = lines.slice(0, headCount);
    const tail = lines.slice(-tailCount);

    const output = [
      ...head,
      "",
      `... (${omitted} lines omitted — ${lines.length} total) ...`,
      "",
      ...tail,
    ].join("\n");

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}
