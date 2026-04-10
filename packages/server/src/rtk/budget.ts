/**
 * RTK Token Budget Allocator
 *
 * Enforces a maximum token budget per tool output.
 * If output exceeds budget after strategy compression,
 * applies aggressive truncation to fit.
 *
 * Budget levels:
 * - aggressive: 2000 tokens (~8K chars)
 * - balanced:   4000 tokens (~16K chars) — default
 * - minimal:    8000 tokens (~32K chars)
 * - unlimited:  no limit
 */

import { estimateTokens } from "./pipeline.js";

export type RTKLevel = "aggressive" | "balanced" | "minimal" | "unlimited";

interface BudgetConfig {
  /** Max tokens for a single tool output */
  maxTokensPerOutput: number;
  /** Head lines to keep when budget-truncating */
  headLines: number;
  /** Tail lines to keep when budget-truncating */
  tailLines: number;
}

const BUDGET_CONFIGS: Record<RTKLevel, BudgetConfig> = {
  aggressive: { maxTokensPerOutput: 2000, headLines: 40, tailLines: 20 },
  balanced: { maxTokensPerOutput: 4000, headLines: 80, tailLines: 40 },
  minimal: { maxTokensPerOutput: 8000, headLines: 150, tailLines: 80 },
  unlimited: { maxTokensPerOutput: Infinity, headLines: 0, tailLines: 0 },
};

/**
 * Apply token budget to compressed output.
 * Returns the output trimmed to fit budget, or the original if within budget.
 */
export function applyBudget(
  compressed: string,
  level: RTKLevel,
): { output: string; budgetTruncated: boolean; tokensAfterBudget: number } {
  if (level === "unlimited") {
    return {
      output: compressed,
      budgetTruncated: false,
      tokensAfterBudget: estimateTokens(compressed),
    };
  }

  const config = BUDGET_CONFIGS[level];
  const tokens = estimateTokens(compressed);

  if (tokens <= config.maxTokensPerOutput) {
    return { output: compressed, budgetTruncated: false, tokensAfterBudget: tokens };
  }

  // Over budget — aggressive truncation
  const lines = compressed.split("\n");
  if (lines.length <= config.headLines + config.tailLines + 3) {
    // Too few lines to truncate meaningfully — just char-truncate
    const maxChars = config.maxTokensPerOutput * 4;
    const truncated =
      compressed.slice(0, maxChars) + "\n\n... (output truncated to fit token budget)";
    return {
      output: truncated,
      budgetTruncated: true,
      tokensAfterBudget: estimateTokens(truncated),
    };
  }

  const head = lines.slice(0, config.headLines);
  const tail = lines.slice(-config.tailLines);
  const omitted = lines.length - config.headLines - config.tailLines;

  const output = [
    ...head,
    "",
    `... (${omitted} lines omitted — budget: ${config.maxTokensPerOutput} tokens) ...`,
    "",
    ...tail,
  ].join("\n");

  return { output, budgetTruncated: true, tokensAfterBudget: estimateTokens(output) };
}

/** Get the budget config for a level */
export function getBudgetConfig(level: RTKLevel): BudgetConfig {
  return BUDGET_CONFIGS[level];
}
