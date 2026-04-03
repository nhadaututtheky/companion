/**
 * RTK (Runtime Token Keeper) — barrel export
 *
 * Usage:
 *   import { createDefaultPipeline } from "./rtk/index.js";
 *   const pipeline = createDefaultPipeline();
 *   const result = pipeline.transform(toolOutput, { sessionId, toolName });
 */

export { RTKPipeline, estimateTokens, tokenDiff } from "./pipeline.js";
export type {
  RTKStrategy,
  RTKContext,
  RTKResult,
  RTKSavings,
  RTKTransformResult,
} from "./pipeline.js";

export { AnsiStripStrategy } from "./strategies/ansi-strip.js";
export { BlankCollapseStrategy } from "./strategies/blank-collapse.js";
export { DedupStrategy } from "./strategies/dedup.js";
export { TruncateStrategy } from "./strategies/truncate.js";

import { RTKPipeline } from "./pipeline.js";
import { AnsiStripStrategy } from "./strategies/ansi-strip.js";
import { BlankCollapseStrategy } from "./strategies/blank-collapse.js";
import { DedupStrategy } from "./strategies/dedup.js";
import { TruncateStrategy } from "./strategies/truncate.js";

/**
 * Create the default RTK pipeline with all Phase 1 strategies.
 * Order matters: ANSI strip first (clean noise), then blank collapse,
 * then dedup (group similar), then truncate (final length cap).
 */
export function createDefaultPipeline(): RTKPipeline {
  return new RTKPipeline([
    new AnsiStripStrategy(),
    new BlankCollapseStrategy(),
    new DedupStrategy(),
    new TruncateStrategy(),
  ]);
}
