/**
 * Smart Orchestration types — task classification, dispatch routing, session memory.
 */

// ── Task Classification ─────────────────────────────────────────────────────

export type OrchestrationPattern = "single" | "workflow" | "debate" | "mention";

export type TaskComplexity = "simple" | "medium" | "complex";

export type DebateFormat = "pro_con" | "red_team" | "review" | "brainstorm";

export interface StepSuggestion {
  role: string;
  model: string;
  task: string;
}

export interface TaskClassification {
  /** Detected user intent, e.g. "review_then_fix", "explain_code", "compare_options" */
  intent: string;
  /** Which orchestration engine to use */
  pattern: OrchestrationPattern;
  /** Task complexity → drives model selection */
  complexity: TaskComplexity;
  /** Suggested workflow template slug (if pattern=workflow) */
  suggestedTemplate?: string;
  /** Suggested debate format (if pattern=debate) */
  suggestedDebateFormat?: DebateFormat;
  /** Suggested steps (if pattern=workflow) */
  steps?: StepSuggestion[];
  /** File paths extracted from the message */
  relevantFiles: string[];
  /** 0-1 confidence score. ≥0.8 auto-dispatch, 0.5-0.8 suggest, <0.5 fallback */
  confidence: number;
  /** Suggested model for single-session pattern */
  suggestedModel?: string;
}

// ── Dispatch Result ─────────────────────────────────────────────────────────

export interface DispatchResult {
  dispatched: boolean;
  pattern: OrchestrationPattern;
  /** Session IDs created or targeted */
  sessionIds: string[];
  /** Channel ID if workflow/debate was started */
  channelId?: string;
  /** Workflow ID if workflow was started */
  workflowId?: string;
  /** Error message if dispatch failed */
  error?: string;
}

// ── Session Insight (Memory) ────────────────────────────────────────────────

export type InsightType = "pattern" | "mistake" | "preference" | "hotspot";

export interface SessionInsight {
  id: string;
  projectSlug: string;
  type: InsightType;
  content: string;
  sourceSessionId: string;
  sourceFiles: string[];
  relevanceScore: number;
  hitCount: number;
  createdAt: string;
  lastUsedAt: string;
}
