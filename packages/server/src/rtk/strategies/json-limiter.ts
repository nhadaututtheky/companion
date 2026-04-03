/**
 * RTK Strategy: JSON Depth Limiter
 *
 * Truncates deeply nested JSON objects past a max depth.
 * Shows placeholder: { ...3 keys } or [ ...42 items ]
 *
 * Default max depth: 3 levels.
 * Only activates for outputs that are valid JSON and exceed threshold.
 */

import type { RTKStrategy, RTKContext, RTKResult } from "../pipeline.js";
import { tokenDiff } from "../pipeline.js";

/** Maximum JSON nesting depth before truncation */
const MAX_DEPTH = 3;

/** Minimum JSON string length to bother processing */
const MIN_JSON_LENGTH = 500;

// ─── Strategy ───────────────────────────────────────────────────────────────

export class JsonLimiterStrategy implements RTKStrategy {
  readonly name = "json-limiter";

  transform(input: string, _context?: RTKContext): RTKResult | null {
    const trimmed = input.trim();

    // Quick check: is this JSON?
    if (trimmed.length < MIN_JSON_LENGTH) return null;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null; // Not valid JSON
    }

    const limited = limitDepth(parsed, 0);
    const output = JSON.stringify(limited, null, 2);

    if (output.length >= input.length) return null;

    return {
      output,
      tokensSaved: tokenDiff(input, output),
    };
  }
}

function limitDepth(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[...${value.length} items]`;
    }
    // Show first 5 items, collapse rest
    if (value.length > 10 && depth >= MAX_DEPTH - 1) {
      return [
        ...value.slice(0, 5).map((v) => limitDepth(v, depth + 1)),
        `...and ${value.length - 5} more`,
      ];
    }
    return value.map((v) => limitDepth(v, depth + 1));
  }

  // Object
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (depth >= MAX_DEPTH) {
    return `{...${keys.length} keys}`;
  }

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = limitDepth(obj[key], depth + 1);
  }
  return result;
}
