/**
 * CompactManager — Smart compaction logic extracted from ws-bridge.ts
 * Handles automatic context compaction based on threshold settings.
 */

import { createLogger } from "../logger.js";
import type { ActiveSession } from "./session-store.js";
import type { BrowserIncomingMessage } from "@companion/shared";
import { getMaxContextTokens } from "@companion/shared";

const log = createLogger("compact-manager");

/** Callbacks the compact manager needs from the bridge */
export interface CompactBridge {
  broadcastToAll(session: ActiveSession, msg: BrowserIncomingMessage): void;
  sendToCLI(session: ActiveSession, ndjson: string): void;
}

/** Compact handoff timers keyed by session ID */
const compactTimers = new Map<
  string,
  { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> }
>();

/** Clear compact handoff timers for a session */
export function clearCompactTimers(sessionId: string): void {
  const timers = compactTimers.get(sessionId);
  if (timers) {
    clearInterval(timers.interval);
    clearTimeout(timers.timeout);
    compactTimers.delete(sessionId);
  }
}

/** Send /compact slash command to CLI */
function sendCompactCommand(bridge: CompactBridge, session: ActiveSession): void {
  bridge.sendToCLI(
    session,
    JSON.stringify({
      type: "user",
      content: "/compact",
    }),
  );
}

/**
 * Check if smart/aggressive compact should trigger based on context usage.
 */
export function checkSmartCompact(
  bridge: CompactBridge,
  session: ActiveSession,
  prevTokens: { input: number; output: number },
): void {
  const { compact_mode, compact_threshold } = session.state;
  if (compact_mode === "manual") return;

  const lastTurnInput = session.state.total_input_tokens - prevTokens.input;
  const lastTurnOutput = session.state.total_output_tokens - prevTokens.output;
  const contextTokens = lastTurnInput + lastTurnOutput;
  const maxTokens = getMaxContextTokens(session.state.model);
  const contextPct = (contextTokens / maxTokens) * 100;

  if (contextPct < compact_threshold) {
    session.compactPending = false;
    return;
  }

  if (session.compactPending || session.state.status === "compacting") return;

  if (compact_mode === "aggressive") {
    session.compactPending = true;
    log.info("Aggressive compact triggered", {
      session: session.id,
      contextPct: Math.round(contextPct),
    });
    sendCompactCommand(bridge, session);
    return;
  }

  // Smart mode: trigger handoff at idle
  if (session.state.status === "idle") {
    session.compactPending = true;
    log.info("Smart compact handoff triggered at idle", {
      session: session.id,
      contextPct: Math.round(contextPct),
    });
    triggerSmartCompactHandoff(bridge, session);
  }
}

/**
 * Smart compact handoff flow:
 * 1. Ask Claude to summarize current progress
 * 2. Wait for response
 * 3. Send /compact
 * 4. After compact, inject handoff context
 */
function triggerSmartCompactHandoff(bridge: CompactBridge, session: ActiveSession): void {
  bridge.broadcastToAll(session, {
    type: "compact_handoff",
    stage: "summarizing",
    message: "Smart compact: asking Claude to summarize before compacting...",
  } as BrowserIncomingMessage);

  const handoffPrompt = [
    "Before context compaction, briefly summarize in 3-5 sentences:",
    "1. What you just completed",
    "2. What tasks remain (if any)",
    "3. Your planned next step",
    "Keep it concise — this will be injected after compaction to restore context.",
  ].join("\n");

  bridge.sendToCLI(
    session,
    JSON.stringify({
      type: "user",
      content: `[SYSTEM: Context at ${session.state.compact_threshold}% — auto-compact handoff]\n\n${handoffPrompt}`,
    }),
  );

  schedulePostHandoffCompact(bridge, session);
}

/** After handoff summary is received, trigger the actual /compact. */
function schedulePostHandoffCompact(bridge: CompactBridge, session: ActiveSession): void {
  clearCompactTimers(session.id);

  let seenBusy = false;

  const checkInterval = setInterval(() => {
    if (
      !session.compactPending ||
      session.state.status === "ended" ||
      session.state.status === "error"
    ) {
      clearCompactTimers(session.id);
      session.compactPending = false;
      return;
    }

    if (session.state.status === "busy") {
      seenBusy = true;
    }

    if (seenBusy && session.state.status === "idle") {
      clearCompactTimers(session.id);

      bridge.broadcastToAll(session, {
        type: "compact_handoff",
        stage: "compacting",
        message: "Handoff summary received. Running /compact...",
      } as BrowserIncomingMessage);

      log.info("Post-handoff compact executing", { session: session.id });
      sendCompactCommand(bridge, session);
    }
  }, 2000);

  const safetyTimeout = setTimeout(() => {
    clearCompactTimers(session.id);
    if (session.compactPending) {
      log.warn("Smart compact handoff timed out", { session: session.id });
      session.compactPending = false;
    }
  }, 60_000);

  compactTimers.set(session.id, { interval: checkInterval, timeout: safetyTimeout });
}
