/**
 * RTK Pipeline — Runtime Token Keeper
 *
 * Transforms raw tool outputs into compressed versions for LLM context.
 * Each strategy is a pure function: string in → compressed string out.
 * Strategies are applied in order; each receives the previous output.
 */

import { createLogger } from "../logger.js";
import { RTKCache } from "./cache.js";
import { applyBudget, type RTKLevel } from "./budget.js";

const log = createLogger("rtk");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RTKContext {
  /** Tool name (e.g. "Bash", "Read", "Grep") */
  toolName?: string;
  /** Session ID for caching/tracking */
  sessionId: string;
  /** Whether the output is from an error — compress less aggressively */
  isError?: boolean;
}

export interface RTKResult {
  /** Compressed output */
  output: string;
  /** Estimated tokens saved (chars / 4 approximation) */
  tokensSaved: number;
}

export interface RTKStrategy {
  /** Strategy identifier */
  readonly name: string;
  /**
   * Transform the input. Return null to skip (no change needed).
   * Strategies MUST be pure functions — no side effects.
   */
  transform(input: string, context?: RTKContext): RTKResult | null;
}

export interface RTKSavings {
  /** Total estimated tokens saved across all strategies */
  totalTokensSaved: number;
  /** Which strategies were applied (in order) */
  strategiesApplied: string[];
  /** Original character count */
  originalChars: number;
  /** Compressed character count */
  compressedChars: number;
  /** Compression ratio (0-1, lower = more compressed) */
  ratio: number;
  /** Whether result was served from cache */
  cached?: boolean;
  /** Whether budget truncation was applied after strategies */
  budgetTruncated?: boolean;
}

export interface RTKTransformResult {
  /** Compressed output for LLM context */
  compressed: string;
  /** Original output preserved for UI */
  original: string;
  /** Savings breakdown */
  savings: RTKSavings;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

/** Minimum input length to bother compressing (chars) */
const MIN_INPUT_LENGTH = 100;

export class RTKPipeline {
  private readonly strategies: RTKStrategy[];
  private readonly cache = new RTKCache();
  private budgetLevel: RTKLevel = "balanced";
  private disabledStrategies = new Set<string>();

  constructor(strategies: RTKStrategy[]) {
    this.strategies = strategies;
  }

  /** Update compression level (from settings) */
  setBudgetLevel(level: RTKLevel): void {
    this.budgetLevel = level;
  }

  /** Update disabled strategies (from settings) */
  setDisabledStrategies(disabled: Set<string>): void {
    this.disabledStrategies = disabled;
  }

  /**
   * Run all strategies on the input, accumulating savings.
   * Returns both the compressed and original output.
   */
  transform(input: string, context?: RTKContext): RTKTransformResult {
    const originalChars = input.length;

    // Skip tiny outputs — not worth compressing
    if (originalChars < MIN_INPUT_LENGTH) {
      return {
        compressed: input,
        original: input,
        savings: {
          totalTokensSaved: 0,
          strategiesApplied: [],
          originalChars,
          compressedChars: originalChars,
          ratio: 1,
          cached: false,
          budgetTruncated: false,
        },
      };
    }

    // Check cache first
    if (context?.sessionId) {
      const cached = this.cache.get(context.sessionId, input);
      if (cached) {
        return {
          compressed: cached.compressed,
          original: input,
          savings: {
            totalTokensSaved: cached.tokensSaved,
            strategiesApplied: cached.strategiesApplied,
            originalChars,
            compressedChars: cached.compressed.length,
            ratio: originalChars > 0 ? cached.compressed.length / originalChars : 1,
            cached: true,
          },
        };
      }
    }

    let current = input;
    let totalTokensSaved = 0;
    const strategiesApplied: string[] = [];

    for (const strategy of this.strategies) {
      // Skip disabled strategies
      if (this.disabledStrategies.has(strategy.name)) continue;

      try {
        const result = strategy.transform(current, context);
        if (result !== null) {
          totalTokensSaved += result.tokensSaved;
          strategiesApplied.push(strategy.name);
          current = result.output;
        }
      } catch (err) {
        // Never let a strategy crash the pipeline — skip and continue
        log.warn("RTK strategy error", {
          strategy: strategy.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Apply token budget
    let budgetTruncated = false;
    if (this.budgetLevel !== "unlimited") {
      const budgetResult = applyBudget(current, this.budgetLevel);
      if (budgetResult.budgetTruncated) {
        const extraSaved = Math.max(0, estimateTokens(current) - budgetResult.tokensAfterBudget);
        totalTokensSaved += extraSaved;
        current = budgetResult.output;
        budgetTruncated = true;
        strategiesApplied.push("budget");
      }
    }

    const compressedChars = current.length;

    // Cache the result
    if (context?.sessionId) {
      this.cache.set(context.sessionId, input, current, totalTokensSaved, strategiesApplied);
    }

    return {
      compressed: current,
      original: input,
      savings: {
        totalTokensSaved,
        strategiesApplied,
        originalChars,
        compressedChars,
        ratio: originalChars > 0 ? compressedChars / originalChars : 1,
        cached: false,
        budgetTruncated,
      },
    };
  }

  /** Get the list of registered strategy names */
  getStrategyNames(): string[] {
    return this.strategies.map((s) => s.name);
  }

  /** Clear cache for a session */
  clearSessionCache(sessionId: string): void {
    this.cache.clearSession(sessionId);
  }

  /** Get cache statistics */
  getCacheStats() {
    return this.cache.getStats();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Rough token count estimation (chars / 4) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Calculate tokens saved between original and compressed */
export function tokenDiff(original: string, compressed: string): number {
  return Math.max(0, estimateTokens(original) - estimateTokens(compressed));
}
