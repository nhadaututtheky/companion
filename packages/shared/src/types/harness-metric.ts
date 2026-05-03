/**
 * Harness telemetry — one event per agent-facing MCP tool call.
 *
 * Logged by the MCP server (tools-agent.ts) to /api/analytics/harness/log
 * which appends to `.rune/metrics/harness-tools.jsonl`. Phase 4 metrics
 * panel reads this file to render the Harness Usage tab.
 */

export type HarnessMetricOutcome = "ok" | "error" | "timeout";

export interface HarnessMetric {
  /** Unix ms when the call started. */
  ts: number;
  /** Tool name (e.g. "companion_wiki_search"). */
  tool: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Approx input tokens (chars / 4) — args serialised to JSON. */
  inputTokens: number;
  /** Approx output tokens — text content lengths summed. */
  outputTokens: number;
  /** Final status. */
  outcome: HarnessMetricOutcome;
  /** Error code or short error message when outcome != "ok". */
  errorCode?: string;
  /** True when auto-chain compressed the result. */
  compressed?: boolean;
  /** Companion project (PROJECT_SLUG env in MCP process). */
  projectSlug?: string;
  /** Optional session id pulled from env when available. */
  sessionId?: string;
}

/**
 * Aggregated per-tool stats for the Harness Usage panel.
 * Keys mirror the metric fields so the dashboard can sort/filter on
 * the same shape it would slice from raw events.
 */
export interface HarnessToolAggregate {
  tool: string;
  calls: number;
  errors: number;
  timeouts: number;
  /** Median latency over the window. */
  p50DurationMs: number;
  /** 95th percentile latency. */
  p95DurationMs: number;
  /** Sum of inputTokens over the window. */
  totalInputTokens: number;
  /** Sum of outputTokens over the window. */
  totalOutputTokens: number;
  /** Calls that hit the auto-chain compress path. */
  compressedCalls: number;
}

export interface HarnessUsageSummary {
  /** Window covered (oldest..newest entry timestamp). */
  windowStartMs: number;
  windowEndMs: number;
  totalCalls: number;
  tools: HarnessToolAggregate[];
}
