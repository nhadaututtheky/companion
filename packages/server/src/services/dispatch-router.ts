/**
 * Dispatch Router — Wires task classifier output to existing orchestration engines.
 *
 * Classifier says "workflow" → startWorkflow()
 * Classifier says "debate"  → startDebate()
 * Classifier says "mention" → handleMentions()
 * Classifier says "single"  → create session + send message
 *
 * Does NOT modify any engine — only composes them.
 */

import { createLogger } from "../logger.js";
import { classifyTask, classifyByRules, type ClassifierContext } from "./task-classifier.js";
import { startWorkflow } from "./workflow-engine.js";
import { startDebate } from "./debate-engine.js";
import { handleMentions } from "./mention-router.js";
import { getSetting } from "./settings-helpers.js";
import { eventBus } from "./event-bus.js";
import type {
  TaskClassification,
  DispatchResult,
  OrchestrationPattern,
} from "@companion/shared/types";

const log = createLogger("dispatch-router");

// ── Settings ────────────────────────────────────────────────────────────────

/** Check if auto-dispatch is enabled in settings */
export function isAutoDispatchEnabled(): boolean {
  return getSetting("orchestration.autoDispatch") === "true";
}

/** Confidence threshold for auto-dispatch (default 0.8) */
function getConfidenceThreshold(): number {
  const val = getSetting("orchestration.confidenceThreshold");
  if (!val) return 0.8;
  const parsed = parseFloat(val);
  return Number.isFinite(parsed) ? parsed : 0.8;
}

// ── Dispatch Logic ──────────────────────────────────────────────────────────

export interface DispatchContext {
  /** Origin session ID (where the user typed the message) */
  originSessionId: string;
  /** Origin session shortId */
  originShortId: string;
  /** Project slug for scoping */
  projectSlug?: string;
  /** Working directory */
  cwd?: string;
  /** Callback to send message to a session */
  sendToSession: (sessionId: string, content: string) => void;
}

/**
 * Classify a message and dispatch if confidence is high enough.
 *
 * Returns null if auto-dispatch is disabled or confidence too low
 * (caller should handle the message normally).
 */
export async function tryAutoDispatch(
  message: string,
  ctx: DispatchContext,
): Promise<DispatchResult | null> {
  if (!isAutoDispatchEnabled()) return null;

  const classification = await classifyTask(message, {
    projectSlug: ctx.projectSlug,
  });

  // Emit classification for UI
  eventBus.emit("dispatch:classified", {
    sessionId: ctx.originSessionId,
    classification,
  });

  const threshold = getConfidenceThreshold();

  // Below threshold → don't auto-dispatch, return classification for UI to show suggestion
  if (classification.confidence < threshold) {
    log.debug("Classification below threshold", {
      confidence: classification.confidence,
      threshold,
      pattern: classification.pattern,
    });
    return null;
  }

  // Single pattern: no orchestration needed, let caller handle normally
  if (classification.pattern === "single") {
    return null;
  }

  // Mentions always pass through to mention router (no session creation needed)
  if (classification.pattern === "mention") {
    return dispatchMention(message, ctx);
  }

  return dispatch(classification, message, ctx);
}

/**
 * Explicitly dispatch a classification (used when user confirms a suggestion).
 */
export async function dispatch(
  classification: TaskClassification,
  message: string,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  eventBus.emit("dispatch:started", {
    sessionId: ctx.originSessionId,
    pattern: classification.pattern,
    intent: classification.intent,
  });

  try {
    switch (classification.pattern) {
      case "workflow":
        return await dispatchWorkflow(classification, message, ctx);
      case "debate":
        return await dispatchDebate(classification, message, ctx);
      case "mention":
        return dispatchMention(message, ctx);
      case "single":
      default:
        return dispatchSingle(classification, message, ctx);
    }
  } catch (err) {
    log.error("Dispatch failed, falling back to single session", {
      error: String(err),
      pattern: classification.pattern,
    });

    eventBus.emit("dispatch:error", {
      sessionId: ctx.originSessionId,
      pattern: classification.pattern,
      error: String(err),
    });

    // Fallback: ensure message reaches origin session so it's not silently dropped
    try {
      ctx.sendToSession(ctx.originSessionId, message);
    } catch (sendErr) {
      log.error("Fallback send also failed", { error: String(sendErr) });
    }

    return {
      dispatched: false,
      pattern: "single",
      sessionIds: [ctx.originSessionId],
      error: String(err),
    };
  }
}

// ── Pattern Dispatchers ─────────────────────────────────────────────────────

async function dispatchWorkflow(
  classification: TaskClassification,
  message: string,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  const templateId = classification.suggestedTemplate ?? "implement-feature";

  const result = await startWorkflow({
    templateId,
    topic: message,
    projectSlug: ctx.projectSlug,
    cwd: ctx.cwd,
  });

  log.info("Dispatched workflow", {
    template: templateId,
    channelId: result.channelId,
    sessionId: result.sessionId,
  });

  eventBus.emit("dispatch:completed", {
    sessionId: ctx.originSessionId,
    pattern: "workflow",
    targetSessionIds: [result.sessionId],
    channelId: result.channelId,
  });

  return {
    dispatched: true,
    pattern: "workflow",
    sessionIds: [result.sessionId],
    channelId: result.channelId,
  };
}

async function dispatchDebate(
  classification: TaskClassification,
  message: string,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  const format = classification.suggestedDebateFormat ?? "pro_con";

  const debateState = await startDebate({
    topic: message,
    format,
    projectSlug: ctx.projectSlug,
  });

  log.info("Dispatched debate", {
    format,
    channelId: debateState.channelId,
    agents: debateState.agents.length,
  });

  eventBus.emit("dispatch:completed", {
    sessionId: ctx.originSessionId,
    pattern: "debate",
    targetSessionIds: [],
    channelId: debateState.channelId,
  });

  return {
    dispatched: true,
    pattern: "debate",
    sessionIds: [],
    channelId: debateState.channelId,
  };
}

function dispatchMention(message: string, ctx: DispatchContext): DispatchResult {
  const targetIds = handleMentions(
    message,
    ctx.originSessionId,
    ctx.originShortId,
    ctx.sendToSession,
  );

  log.info("Dispatched mentions", { targets: targetIds.length });

  return {
    dispatched: targetIds.length > 0,
    pattern: "mention",
    sessionIds: targetIds,
  };
}

function dispatchSingle(
  _classification: TaskClassification,
  _message: string,
  ctx: DispatchContext,
): DispatchResult {
  // Single session: message stays in origin session — caller already handles delivery.
  // No re-send needed; just signal that dispatch chose "single".
  return {
    dispatched: true,
    pattern: "single",
    sessionIds: [ctx.originSessionId],
  };
}

// ── Classify-only (for UI preview) ──────────────────────────────────────────

/**
 * Classify without dispatching. Used by UI to show dispatch preview.
 */
export async function previewDispatch(
  message: string,
  context?: ClassifierContext,
): Promise<TaskClassification> {
  return classifyTask(message, context);
}

/**
 * Classify using regex rules only (sync, no AI call). For instant UI feedback.
 */
export function previewDispatchSync(message: string): TaskClassification {
  return classifyByRules(message);
}
