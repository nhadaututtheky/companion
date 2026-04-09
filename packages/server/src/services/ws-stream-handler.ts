/**
 * WsBridge stream handling — extracted from ws-bridge.ts (Phase 3).
 * Handles stream events, tool progress, and early results buffering.
 */

import { broadcastToAll } from "./ws-broadcast.js";
import { getOrCreatePulse } from "./pulse-estimator.js";
import type { ActiveSession } from "./session-store.js";
import type {
  CLIStreamEventMessage,
  CLIToolProgressMessage,
  BrowserIncomingMessage,
} from "@companion/shared";

// ─── Early Results Buffer ───────────────────────────────────────────────────

interface EarlyResultEntry {
  msg: BrowserIncomingMessage;
  expiresAt: number;
}

/** TTL for buffered early results (5 seconds) */
const EARLY_RESULT_TTL_MS = 5_000;

/** Buffer for result messages that arrive before subscribers are ready. */
const earlyResults = new Map<string, EarlyResultEntry>();

/** Buffer a result for late subscribers. */
export function bufferEarlyResult(sessionId: string, msg: BrowserIncomingMessage): void {
  earlyResults.set(sessionId, {
    msg,
    expiresAt: Date.now() + EARLY_RESULT_TTL_MS,
  });
}

/** Get and optionally clear a buffered early result. Returns null if expired or not found. */
export function getEarlyResult(sessionId: string): EarlyResultEntry | null {
  const entry = earlyResults.get(sessionId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    earlyResults.delete(sessionId);
    return null;
  }
  return entry;
}

/** Clear early result for a session. */
export function clearEarlyResult(sessionId: string): void {
  earlyResults.delete(sessionId);
}

/** Replay buffered early result to a callback and clear if valid. */
export function replayEarlyResult(
  sessionId: string,
  callback: (msg: BrowserIncomingMessage) => void,
): boolean {
  const entry = getEarlyResult(sessionId);
  if (!entry) return false;
  callback(entry.msg);
  earlyResults.delete(sessionId);
  return true;
}

// ─── Stream Events ──────────────────────────────────────────────────────────

/** Handle a stream event from CLI (thinking deltas, content deltas, etc.). */
export function handleStreamEvent(session: ActiveSession, msg: CLIStreamEventMessage): void {
  // Pulse: track thinking block size for depth signal
  try {
    const event = msg.event as { delta?: { type?: string; thinking?: string } } | undefined;
    if (event?.delta?.type === "thinking_delta" && event.delta.thinking) {
      getOrCreatePulse(session.id).recordThinking(event.delta.thinking.length);
    }
  } catch { /* never block */ }

  broadcastToAll(session, {
    type: "stream_event",
    event: msg.event,
    parent_tool_use_id: msg.parent_tool_use_id,
  });
}

// ─── Tool Progress ──────────────────────────────────────────────────────────

/** Handle tool progress event from CLI. */
export function handleToolProgress(session: ActiveSession, msg: CLIToolProgressMessage): void {
  broadcastToAll(session, {
    type: "tool_progress",
    tool_use_id: msg.tool_use_id,
    tool_name: msg.tool_name,
    elapsed_time_seconds: msg.elapsed_time_seconds,
  });
}
