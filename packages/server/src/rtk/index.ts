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
import type { RTKStrategy } from "./pipeline.js";
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
import { hasFeature } from "../services/license.js";

/** Phase 1 strategies — included in rtk_basic (Free tier) */
const BASIC_STRATEGIES: RTKStrategy[] = [
  new AnsiStripStrategy(),
  new BlankCollapseStrategy(),
  new DedupStrategy(),
  new TruncateStrategy(),
];

/** Phase 2 strategies — require rtk_pro (Starter/Pro tier) */
function getProStrategies(): RTKStrategy[] {
  return [
    new BoilerplateStrategy(),
    new StackTraceStrategy(),
    new ErrorAggregateStrategy(),
    new TestSummaryStrategy(),
    new DiffSummaryStrategy(),
    new JsonLimiterStrategy(),
  ];
}

/**
 * Create the RTK pipeline gated by license tier.
 *
 * Free (rtk_basic): ANSI strip, blank collapse, dedup, truncate
 * Pro  (rtk_pro):   + boilerplate, stack-trace, error-aggregate,
 *                      test-summary, diff-summary, json-limiter,
 *                      cross-turn cache, token budget config
 *
 * Order matters:
 * 1. ANSI strip (clean noise first)
 * 2. Boilerplate removal (Pro)
 * 3. Stack trace compression (Pro)
 * 4. Error aggregation (Pro)
 * 5. Test summarizer (Pro)
 * 6. Diff summarizer (Pro)
 * 7. JSON limiter (Pro)
 * 8. Blank collapse (clean up gaps)
 * 9. Dedup (catch remaining duplicates)
 * 10. Truncate (final length cap — always last)
 */
export function createDefaultPipeline(): RTKPipeline {
  const isPro = hasFeature("rtk_pro");

  const strategies: RTKStrategy[] = isPro
    ? [
        new AnsiStripStrategy(),
        ...getProStrategies(),
        new BlankCollapseStrategy(),
        new DedupStrategy(),
        new TruncateStrategy(),
      ]
    : [...BASIC_STRATEGIES];

  const pipeline = new RTKPipeline(strategies);

  // Pro: enable cache + budget; Free: unlimited (no budget enforcement)
  if (!isPro) {
    pipeline.setBudgetLevel("unlimited");
  }

  return pipeline;
}
