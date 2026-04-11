/**
 * WsBridge context tracking — extracted from ws-bridge.ts (Phase 3).
 * Handles context budget updates, cost warnings, smart compact, and context injection events.
 */

import { createLogger } from "../logger.js";
import { broadcastToAll } from "./ws-broadcast.js";
import { getOrCreatePulse } from "./pulse-estimator.js";
import {
  checkSmartCompact as checkCompact,
  clearCompactTimers as clearCompactTimersImpl,
  type CompactBridge,
} from "./compact-manager.js";
import { getMaxContextTokens } from "@companion/shared";
import { updateSessionCostWarned } from "./session-store.js";
import type { ActiveSession } from "./session-store.js";
import type { BrowserIncomingMessage } from "@companion/shared";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { contextInjectionLog, sessions } from "../db/schema.js";

const _log = createLogger("ws-context");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContextBridge {
  sendToCLI: (session: ActiveSession, ndjson: string) => void;
  broadcastToAll: (session: ActiveSession, msg: BrowserIncomingMessage) => void;
  sdkHandles: Map<string, { isRunning(): boolean }>;
}

// ─── Token Tracking ─────────────────────────────────────────────────────────

/** Per-session previous cumulative token counts (for delta calculation). */
const prevTokens = new Map<string, { input: number; output: number }>();

/** Get previous tokens for a session (used by compact check). */
export function getPrevTokens(sessionId: string): { input: number; output: number } {
  return prevTokens.get(sessionId) ?? { input: 0, output: 0 };
}

/** Clear previous tokens for a session (on session end). */
export function clearPrevTokens(sessionId: string): void {
  prevTokens.delete(sessionId);
}

// ─── Context Update ─────────────────────────────────────────────────────────

/**
 * Broadcast context_update event with current token usage.
 *
 * CLI sends cumulative totals (total_input_tokens grows each turn).
 * Context window ≈ last turn's input tokens + last turn's output tokens.
 * We estimate by computing the delta between previous and current cumulative values.
 */
export function broadcastContextUpdate(session: ActiveSession): void {
  const state = session.state;
  const prev = prevTokens.get(session.id) ?? { input: 0, output: 0 };

  // Per-turn values = delta from previous cumulative totals
  const lastTurnInput = state.total_input_tokens - prev.input;
  const lastTurnOutput = state.total_output_tokens - prev.output;
  prevTokens.set(session.id, {
    input: state.total_input_tokens,
    output: state.total_output_tokens,
  });

  // Context ≈ last turn input + last output (output joins next turn's context)
  const totalTokens = lastTurnInput + lastTurnOutput;
  const maxTokens = getMaxContextTokens(state.model);
  const contextUsedPercent = Math.min(100, (totalTokens / maxTokens) * 100);

  // Pulse: record context pressure
  try {
    getOrCreatePulse(session.id).recordContextUpdate(contextUsedPercent);
  } catch {
    /* never block */
  }

  broadcastToAll(session, {
    type: "context_update",
    contextUsedPercent,
    totalTokens,
    maxTokens,
  });
}

// ─── Context Usage Request ──────────────────────────────────────────────────

/**
 * Request accurate context usage from Claude CLI via get_context_usage control_request.
 * Sent after each turn completes (idle). Response arrives as control_response on stdout.
 */
export function requestContextUsage(bridge: ContextBridge, session: ActiveSession): void {
  // Only for CLI engine sessions (SDK has its own tracking)
  if (bridge.sdkHandles.has(session.id)) return;
  // Don't request if session is ended
  if (session.state.status === "ended" || session.state.status === "error") return;

  const ndjson = JSON.stringify({
    type: "control_request",
    request: { subtype: "get_context_usage" },
  });
  bridge.sendToCLI(session, ndjson);
}

// ─── Context Control Response ───────────────────────────────────────────────

/**
 * Handle control_response messages from CLI (e.g. get_context_usage response).
 * These are responses to control_requests we sent TO the CLI.
 */
export function handleControlResponse(session: ActiveSession, msg: Record<string, unknown>): void {
  const response = msg.response as Record<string, unknown> | undefined;
  if (!response) return;

  const subtype = response.subtype as string | undefined;

  if (subtype === "get_context_usage") {
    const usage = response.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          context_window?: number;
        }
      | undefined;

    if (!usage) return;

    const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
    const maxTokens = usage.context_window ?? getMaxContextTokens(session.state.model);
    const contextUsedPercent = maxTokens > 0 ? Math.min(100, (totalTokens / maxTokens) * 100) : 0;

    broadcastToAll(session, {
      type: "context_update",
      contextUsedPercent,
      totalTokens,
      maxTokens,
    });
  }
}

// ─── Context Injection Events ───────────────────────────────────────────────

/** Emit a context injection event to browsers (for context budget visualization). */
export function emitContextInjection(
  session: ActiveSession,
  injectionType:
    | "project_map"
    | "message_context"
    | "plan_review"
    | "break_check"
    | "web_docs"
    | "activity_feed",
  summary: string,
  charCount: number,
): void {
  const tokenEstimate = Math.ceil(charCount / 4);
  broadcastToAll(session, {
    type: "context:injection",
    sessionId: session.id,
    injectionType,
    summary,
    charCount,
    tokenEstimate,
    timestamp: Date.now(),
  } as unknown as BrowserIncomingMessage);

  logContextInjection(session.id, injectionType, tokenEstimate);
}

function logContextInjection(
  sessionId: string,
  injectionType: string,
  tokenCount: number,
): void {
  try {
    const db = getDb();
    const row = db
      .select({ projectSlug: sessions.projectSlug })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    db.insert(contextInjectionLog)
      .values({
        sessionId,
        projectSlug: row?.projectSlug ?? "",
        injectionType,
        tokenCount,
      })
      .run();
  } catch {
    // fire-and-forget
  }
}

// ─── Cost Budget ────────────────────────────────────────────────────────────

/** Check cost budget and broadcast warnings at 80% and 100% thresholds. */
export function checkCostBudget(session: ActiveSession): void {
  const { cost_budget_usd, cost_warned, total_cost_usd } = session.state;
  if (!cost_budget_usd || cost_budget_usd <= 0) return;

  const pct = total_cost_usd / cost_budget_usd;

  if (pct >= 1.0 && cost_warned < 2) {
    // 100% — budget reached
    session.state = { ...session.state, cost_warned: 2 };
    broadcastToAll(session, {
      type: "cost_warning",
      level: "critical",
      costUsd: total_cost_usd,
      budgetUsd: cost_budget_usd,
      message: `Cost budget reached: $${total_cost_usd.toFixed(2)} / $${cost_budget_usd.toFixed(2)}`,
    } as BrowserIncomingMessage);
    broadcastToAll(session, {
      type: "budget_exceeded",
      budget: cost_budget_usd,
      spent: total_cost_usd,
    } as BrowserIncomingMessage);
    updateSessionCostWarned(session.id, 2);
  } else if (pct >= 0.8 && cost_warned < 1) {
    // 80% — first warning
    session.state = { ...session.state, cost_warned: 1 };
    broadcastToAll(session, {
      type: "cost_warning",
      level: "warning",
      costUsd: total_cost_usd,
      budgetUsd: cost_budget_usd,
      message: `Approaching cost budget: $${total_cost_usd.toFixed(2)} / $${cost_budget_usd.toFixed(2)} (${Math.round(pct * 100)}%)`,
    } as BrowserIncomingMessage);
    broadcastToAll(session, {
      type: "budget_warning",
      budget: cost_budget_usd,
      spent: total_cost_usd,
      percentage: 80,
    } as BrowserIncomingMessage);
    updateSessionCostWarned(session.id, 1);
  }
}

// ─── Smart Compact ──────────────────────────────────────────────────────────

/** Check if context exceeds threshold and trigger compact handoff. */
export function checkSmartCompact(compactBridge: CompactBridge, session: ActiveSession): void {
  const prev = prevTokens.get(session.id) ?? { input: 0, output: 0 };
  checkCompact(compactBridge, session, prev);
}

/** Clear compact handoff timers for a session. */
export function clearCompactTimers(sessionId: string): void {
  clearCompactTimersImpl(sessionId);
}
