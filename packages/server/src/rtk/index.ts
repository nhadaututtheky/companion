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

// Phase 3: Intelligence
export { RTKCache } from "./cache.js";
export { applyBudget, getBudgetConfig } from "./budget.js";
export type { RTKLevel } from "./budget.js";
export { getRTKConfig, RTK_LEVELS, RTK_STRATEGY_NAMES } from "./config.js";
export type { RTKConfig } from "./config.js";

// Phase 1: Core strategies
export { AnsiStripStrategy } from "./strategies/ansi-strip.js";
export { BlankCollapseStrategy } from "./strategies/blank-collapse.js";
export { DedupStrategy } from "./strategies/dedup.js";
export { TruncateStrategy } from "./strategies/truncate.js";

// Phase 2: Smart compressors
export { StackTraceStrategy } from "./strategies/stack-trace.js";
export { ErrorAggregateStrategy } from "./strategies/error-aggregate.js";
export { TestSummaryStrategy } from "./strategies/test-summary.js";
export { DiffSummaryStrategy } from "./strategies/diff-summary.js";
export { JsonLimiterStrategy } from "./strategies/json-limiter.js";
export { BoilerplateStrategy } from "./strategies/boilerplate.js";

import { RTKPipeline } from "./pipeline.js";
import { AnsiStripStrategy } from "./strategies/ansi-strip.js";
import { BlankCollapseStrategy } from "./strategies/blank-collapse.js";
import { DedupStrategy } from "./strategies/dedup.js";
import { TruncateStrategy } from "./strategies/truncate.js";
import { StackTraceStrategy } from "./strategies/stack-trace.js";
import { ErrorAggregateStrategy } from "./strategies/error-aggregate.js";
import { TestSummaryStrategy } from "./strategies/test-summary.js";
import { DiffSummaryStrategy } from "./strategies/diff-summary.js";
import { JsonLimiterStrategy } from "./strategies/json-limiter.js";
import { BoilerplateStrategy } from "./strategies/boilerplate.js";

/**
 * Create the default RTK pipeline with all strategies.
 *
 * Order matters:
 * 1. ANSI strip (clean noise first)
 * 2. Boilerplate removal (remove known patterns)
 * 3. Stack trace compression (before dedup catches frames)
 * 4. Error aggregation (group similar errors)
 * 5. Test summarizer (collapse passed tests)
 * 6. Diff summarizer (compress large diffs)
 * 7. JSON limiter (truncate deep nesting)
 * 8. Blank collapse (clean up gaps left by earlier strategies)
 * 9. Dedup (catch remaining duplicates)
 * 10. Truncate (final length cap — always last)
 */
export function createDefaultPipeline(): RTKPipeline {
  return new RTKPipeline([
    new AnsiStripStrategy(),
    new BoilerplateStrategy(),
    new StackTraceStrategy(),
    new ErrorAggregateStrategy(),
    new TestSummaryStrategy(),
    new DiffSummaryStrategy(),
    new JsonLimiterStrategy(),
    new BlankCollapseStrategy(),
    new DedupStrategy(),
    new TruncateStrategy(),
  ]);
}
