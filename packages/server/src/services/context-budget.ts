/**
 * Context Budget Manager — allocates and gates context injection across all sources.
 *
 * Upgrades the Context Estimator with:
 * - Priority-based budget allocation (system > claude.md > wiki L0 > codegraph > wiki L1 > NM)
 * - Per-feature toggle (features.<name>.enabled)
 * - Unified shouldInject() gate used by all context sources
 *
 * The estimator functions are preserved for backward compatibility.
 */

import { createLogger } from "../logger.js";
import { getSetting } from "./settings-helpers.js";
import type { TaskComplexity } from "@companion/shared/types";
import { getSessionContext as getWikiSessionContext } from "../wiki/retriever.js";
import { getWikiConfig } from "../wiki/store.js";
import {
  estimateContextBreakdown,
  type ContextBreakdown,
  type ContextSource,
} from "./context-estimator.js";
import { getProjectFilePaths } from "../codegraph/graph-store.js";
import { findArticlesByRelatedFiles, readArticle } from "../wiki/store.js";

const _log = createLogger("context-budget");

// ─── Feature Toggles ────────────────────────────────────────────────────────

export type ToggleableFeature = "wiki" | "codegraph" | "pulse" | "agentContext" | "rtk";

const FEATURE_DEFAULTS: Record<ToggleableFeature, boolean> = {
  wiki: true,
  codegraph: true,
  pulse: true,
  agentContext: true,
  rtk: true,
};

/** Check if a feature is enabled (checks DB setting, falls back to default) */
export function isFeatureEnabled(feature: ToggleableFeature): boolean {
  const setting = getSetting(`features.${feature}.enabled`);
  if (setting === "false" || setting === "0") return false;
  if (setting === "true" || setting === "1") return true;
  return FEATURE_DEFAULTS[feature];
}

/** Get all feature toggle states */
export function getFeatureToggles(): Record<ToggleableFeature, boolean> {
  const result = {} as Record<ToggleableFeature, boolean>;
  for (const feature of Object.keys(FEATURE_DEFAULTS) as ToggleableFeature[]) {
    result[feature] = isFeatureEnabled(feature);
  }
  return result;
}

// ─── Budget Allocation ──────────────────────────────────────────────────────

/** Context source with priority and feature gate */
export interface BudgetSource {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lower = higher priority (1 = always loaded first) */
  priority: number;
  /** Feature gate (null = always allowed, not toggleable) */
  feature: ToggleableFeature | null;
  /** Maximum tokens this source can consume */
  maxTokens: number;
  /** Whether this source is always loaded at session start */
  sessionStart: boolean;
}

/** Priority-ordered budget sources */
export const BUDGET_SOURCES: BudgetSource[] = [
  {
    id: "system_prompt",
    label: "System Prompt",
    priority: 1,
    feature: null,
    maxTokens: 12_000,
    sessionStart: true,
  },
  {
    id: "claude_md",
    label: "CLAUDE.md",
    priority: 2,
    feature: null,
    maxTokens: 6_000,
    sessionStart: true,
  },
  {
    id: "wiki_l0",
    label: "Wiki Core Rules",
    priority: 3,
    feature: "wiki",
    maxTokens: 3_000,
    sessionStart: true,
  },
  {
    id: "codegraph_map",
    label: "Code Intelligence",
    priority: 4,
    feature: "codegraph",
    maxTokens: 2_000,
    sessionStart: true,
  },
  {
    id: "wiki_l1",
    label: "Wiki Articles",
    priority: 5,
    feature: "wiki",
    maxTokens: 5_000,
    sessionStart: false,
  },
  {
    id: "neural_memory",
    label: "Neural Memory",
    priority: 6,
    feature: null,
    maxTokens: 1_500,
    sessionStart: false,
  },
  {
    id: "agent_context",
    label: "Agent Context",
    priority: 7,
    feature: "agentContext",
    maxTokens: 2_000,
    sessionStart: false,
  },
];

/** Budget allocation result */
export interface BudgetAllocation {
  /** Per-source token caps */
  allocations: Map<string, number>;
  /** Total tokens allocated */
  totalAllocated: number;
  /** Remaining tokens available */
  remaining: number;
  /** Sources that were disabled by feature toggle */
  disabled: string[];
}

/**
 * Allocate token budget across sources by priority.
 *
 * Higher priority sources get their full maxTokens first.
 * Lower priority sources get what's left, up to their maxTokens.
 */
export function allocateBudget(
  maxContextTokens: number,
  /** Reserve this much for conversation + output */
  reservePercent: number = 0.65,
): BudgetAllocation {
  const available = Math.floor(maxContextTokens * (1 - reservePercent));
  let remaining = available;
  const allocations = new Map<string, number>();
  const disabled: string[] = [];

  // Sort by priority (already sorted, but be safe)
  const sorted = [...BUDGET_SOURCES].sort((a, b) => a.priority - b.priority);

  for (const source of sorted) {
    // Check feature gate
    if (source.feature && !isFeatureEnabled(source.feature)) {
      allocations.set(source.id, 0);
      disabled.push(source.id);
      continue;
    }

    // Allocate up to maxTokens or remaining, whichever is less
    const allocated = Math.min(source.maxTokens, remaining);
    allocations.set(source.id, allocated);
    remaining -= allocated;

    if (remaining <= 0) break;
  }

  return {
    allocations,
    totalAllocated: available - remaining,
    remaining,
    disabled,
  };
}

// ─── Task-Aware Budget ──────────────────────────────────────────────────────

/** Complexity-based context budget multipliers */
const COMPLEXITY_MULTIPLIERS: Record<TaskComplexity, number> = {
  simple: 0.6, // Less context for simple tasks (explanations, searches)
  medium: 1.0, // Default
  complex: 1.4, // More context for complex tasks (architecture, multi-file)
};

/**
 * Allocate budget with task complexity adjustment.
 * Simple tasks get less context (fewer distractions).
 * Complex tasks get more context (broader understanding).
 */
export function allocateBudgetForTask(
  maxContextTokens: number,
  complexity: TaskComplexity,
  reservePercent: number = 0.65,
): BudgetAllocation {
  const multiplier = COMPLEXITY_MULTIPLIERS[complexity];
  const base = allocateBudget(maxContextTokens, reservePercent);

  // Apply multiplier to each allocation (except system_prompt and claude_md which are fixed)
  const adjusted = new Map<string, number>();
  for (const [id, tokens] of base.allocations) {
    if (id === "system_prompt" || id === "claude_md") {
      adjusted.set(id, tokens);
    } else {
      adjusted.set(id, Math.floor(tokens * multiplier));
    }
  }

  const totalAllocated = [...adjusted.values()].reduce((a, b) => a + b, 0);
  const available = Math.floor(maxContextTokens * (1 - reservePercent));
  return {
    allocations: adjusted,
    totalAllocated,
    remaining: Math.max(0, available - totalAllocated),
    disabled: base.disabled,
  };
}

// ─── Injection Gate ─────────────────────────────────────────────────────────

/**
 * Should a context source be injected right now?
 *
 * Considers: feature toggle, budget allocation, current usage.
 */
export function shouldInject(sourceId: string, currentUsagePercent: number): boolean {
  const source = BUDGET_SOURCES.find((s) => s.id === sourceId);
  if (!source) return false;

  // Feature gate
  if (source.feature && !isFeatureEnabled(source.feature)) return false;

  // Adaptive sizing thresholds (same logic as agent-context-provider, centralized)
  if (currentUsagePercent >= 95) {
    // Only allow priority 1-2 (system prompt, claude.md) — and break checks
    return source.priority <= 2 || sourceId === "break_check";
  }
  if (currentUsagePercent >= 85) {
    // Allow priority 1-4
    return source.priority <= 4;
  }
  if (currentUsagePercent >= 70) {
    // Allow priority 1-6 (skip low-priority agent context)
    return source.priority <= 6;
  }

  return true;
}

// ─── Wiki Session Context ───────────────────────────────────────────────────

/**
 * Get wiki context to inject at session start.
 * Returns null if wiki is disabled or no domain configured.
 */
export function getWikiStartContext(cwd?: string): {
  content: string;
  tokens: number;
  domain: string;
} | null {
  if (!isFeatureEnabled("wiki")) return null;

  const config = getWikiConfig();
  if (!config.enabled || !config.defaultDomain) return null;

  const budget = allocateBudget(200_000);
  const wikiL0Budget = budget.allocations.get("wiki_l0") ?? 3000;

  const ctx = getWikiSessionContext(config.defaultDomain, wikiL0Budget, cwd);
  if (!ctx) return null;

  return {
    content: ctx.content,
    tokens: ctx.tokens,
    domain: config.defaultDomain,
  };
}

// ─── Enhanced Breakdown (includes wiki) ─────────────────────────────────────

/**
 * Get full context breakdown including wiki sources.
 * Extends the base estimator with wiki + feature toggle info.
 */
export function getFullBreakdown(
  cwd: string,
  mcpServers: Array<{ name: string; status: string }>,
  model: string,
): ContextBreakdown & { featureToggles: Record<ToggleableFeature, boolean> } {
  const base = estimateContextBreakdown(cwd, mcpServers, model);
  const toggles = getFeatureToggles();

  // Add wiki source if enabled and configured
  if (toggles.wiki) {
    const config = getWikiConfig();
    if (config.enabled && config.defaultDomain) {
      const wikiCtx = getWikiSessionContext(config.defaultDomain, 3000, cwd);
      if (wikiCtx && wikiCtx.tokens > 0) {
        const wikiSource: ContextSource = {
          label: "Wiki KB",
          tokens: wikiCtx.tokens,
          count: 1,
          details: [`${config.defaultDomain} (L0 core + index)`],
        };
        base.sources.push(wikiSource);
        base.totalTokens += wikiCtx.tokens;
        base.percent = Math.min(100, (base.totalTokens / base.maxTokens) * 100);
      }
    }
  }

  // Mark disabled features in breakdown
  for (const source of base.sources) {
    const budgetSource = BUDGET_SOURCES.find((bs) => bs.label === source.label);
    if (budgetSource?.feature && !toggles[budgetSource.feature]) {
      source.label = `${source.label} (disabled)`;
      source.tokens = 0;
    }
  }

  return { ...base, featureToggles: toggles };
}

// ─── CodeGraph ↔ Wiki Cross-Reference ───────────────────────────────────────

/**
 * Find wiki articles related to files known to CodeGraph for a project.
 * Returns article content within the token budget for injection into context.
 */
export function getWikiCodeGraphContext(
  projectSlug: string,
  maxTokens: number = 2000,
  cwd?: string,
): { content: string; tokens: number; articleCount: number } | null {
  if (!isFeatureEnabled("wiki") || !isFeatureEnabled("codegraph")) return null;

  try {
    const filePaths = getProjectFilePaths(projectSlug);
    if (filePaths.length === 0) return null;

    const related = findArticlesByRelatedFiles(filePaths, cwd);
    if (related.length === 0) return null;

    const parts: string[] = [];
    let totalTokens = 0;

    // Take top articles within budget
    for (const { domain, article } of related) {
      if (totalTokens + article.tokens > maxTokens) break;

      const full = readArticle(domain, article.slug, cwd);
      if (!full) continue;

      parts.push(`## ${full.meta.title}\n${full.content}`);
      totalTokens += article.tokens;
    }

    if (parts.length === 0) return null;

    return {
      content: `# Related Wiki Articles (CodeGraph)\n\n${parts.join("\n\n---\n\n")}`,
      tokens: totalTokens,
      articleCount: parts.length,
    };
  } catch (err) {
    _log.debug("CodeGraph↔Wiki cross-ref failed", { error: String(err) });
    return null;
  }
}

// ─── Re-export estimator for backward compat ────────────────────────────────

export {
  estimateContextBreakdown,
  formatBreakdownTelegram,
  formatBreakdownDetailed,
  type ContextBreakdown,
  type ContextSource,
} from "./context-estimator.js";
