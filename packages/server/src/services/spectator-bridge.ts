/**
 * SpectatorBridge — Manages spectator WebSocket connections for shared sessions.
 * Fans out session messages to all connected spectators.
 * Handles interactive spectators who can send messages.
 */

import type { ServerWebSocket } from "bun";
import { createLogger } from "../logger.js";
import { validateShareToken, type SharePermission } from "./share-manager.js";

const log = createLogger("spectator-bridge");

interface SpectatorSocket {
  ws: ServerWebSocket<unknown>;
  token: string;
  sessionId: string;
  permission: SharePermission;
}

const MAX_SPECTATORS_PER_SESSION = 50;

// Session ID → Set of spectator connections
const spectators = new Map<string, Set<SpectatorSocket>>();

/** Add a spectator to a session. Returns false if limit reached. */
export function addSpectator(
  sessionId: string,
  ws: ServerWebSocket<unknown>,
  token: string,
  permission: SharePermission,
): boolean {
  let set = spectators.get(sessionId);
  if (!set) {
    set = new Set();
    spectators.set(sessionId, set);
  }

  if (set.size >= MAX_SPECTATORS_PER_SESSION) {
    log.warn("Spectator limit reached", { sessionId, limit: MAX_SPECTATORS_PER_SESSION });
    ws.close(4429, "Too many spectators");
    return false;
  }

  set.add({ ws, token, sessionId, permission });

  log.info("Spectator connected", {
    sessionId,
    token: token.slice(0, 8) + "...",
    permission,
    totalSpectators: set.size,
  });

  // Notify session browsers about spectator count
  broadcastSpectatorCount(sessionId);
  return true;
}

/** Remove a spectator connection */
export function removeSpectator(sessionId: string, ws: ServerWebSocket<unknown>): void {
  const set = spectators.get(sessionId);
  if (!set) return;

  for (const s of set) {
    if (s.ws === ws) {
      set.delete(s);
      break;
    }
  }

  if (set.size === 0) {
    spectators.delete(sessionId);
  }

  log.debug("Spectator disconnected", { sessionId, remaining: set?.size ?? 0 });
  broadcastSpectatorCount(sessionId);
}

/** Fan-out a message to all spectators of a session */
export function broadcastToSpectators(sessionId: string, data: unknown): void {
  const set = spectators.get(sessionId);
  if (!set || set.size === 0) return;

  const payload = typeof data === "string" ? data : JSON.stringify(data);

  for (const s of set) {
    try {
      s.ws.send(payload);
    } catch {
      // Socket errored — will be cleaned up on close
    }
  }
}

/** Get spectator count for a session */
export function getSpectatorCount(sessionId: string): number {
  return spectators.get(sessionId)?.size ?? 0;
}

/** Disconnect all spectators for a session (e.g., when session ends or token revoked) */
export function disconnectAllSpectators(sessionId: string, reason?: string): void {
  const set = spectators.get(sessionId);
  if (!set) return;

  for (const s of set) {
    try {
      s.ws.close(1000, reason ?? "Session ended");
    } catch {
      // Already closed
    }
  }
  spectators.delete(sessionId);
  log.info("All spectators disconnected", { sessionId, reason });
}

/** Disconnect spectators with a specific token (token revoked) */
export function disconnectByToken(token: string): void {
  for (const [sessionId, set] of spectators) {
    const toRemove: SpectatorSocket[] = [];
    for (const s of set) {
      if (s.token === token) {
        try {
          s.ws.close(1000, "Share token revoked");
        } catch {
          // Already closed
        }
        toRemove.push(s);
      }
    }
    for (const s of toRemove) set.delete(s);
    if (set.size === 0) spectators.delete(sessionId);
  }
}

/** Check if a spectator's token is still valid (called on interactive message) */
export function isSpectatorAuthorized(
  ws: ServerWebSocket<unknown>,
  sessionId: string,
): SharePermission | null {
  const set = spectators.get(sessionId);
  if (!set) return null;

  for (const s of set) {
    if (s.ws === ws) {
      // Re-validate token
      const valid = validateShareToken(s.token);
      if (!valid) return null;
      return s.permission;
    }
  }
  return null;
}

/** Broadcast spectator count to session browsers (via a callback) */
let _broadcastCallback: ((sessionId: string, count: number) => void) | null = null;

export function onSpectatorCountChange(cb: (sessionId: string, count: number) => void): void {
  _broadcastCallback = cb;
}

function broadcastSpectatorCount(sessionId: string): void {
  if (_broadcastCallback) {
    _broadcastCallback(sessionId, getSpectatorCount(sessionId));
  }
}
