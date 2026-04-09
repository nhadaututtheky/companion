/**
 * WsBridge broadcast utilities — extracted from ws-bridge.ts (Phase 3).
 * Handles message fanout to browser sockets, subscribers, and spectators.
 */

import { createLogger } from "../logger.js";
import { broadcastToSpectators } from "./spectator-bridge.js";
import type { ActiveSession } from "./session-store.js";
import type { BrowserIncomingMessage } from "@companion/shared";

const log = createLogger("ws-broadcast");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SocketLike {
  send: (data: string) => void;
}

// ─── Broadcast ──────────────────────────────────────────────────────────────

/** Broadcast a message to all connected receivers: browsers, subscribers, spectators. */
export function broadcastToAll(session: ActiveSession, msg: BrowserIncomingMessage): void {
  const payload = JSON.stringify(msg);

  // Send to browser WebSockets
  for (const ws of session.browserSockets) {
    try {
      ws.send(payload);
    } catch {
      session.browserSockets.delete(ws);
    }
  }

  // Send to subscribers (Telegram, etc.)
  broadcastToSubscribers(session, msg);

  // Fan-out to spectators (QR Stream Sharing)
  broadcastToSpectators(session.id, msg);
}

/** Broadcast a message to subscriber callbacks only (Telegram, etc.). */
export function broadcastToSubscribers(session: ActiveSession, msg: unknown): void {
  for (const [id, callback] of session.subscribers) {
    try {
      callback(msg);
    } catch (err) {
      log.error("Subscriber callback error", { subscriber: id, err: String(err) });
    }
  }
}
