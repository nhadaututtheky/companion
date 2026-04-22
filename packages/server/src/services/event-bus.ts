/**
 * Typed Event Bus — decoupled pub/sub for cross-module communication.
 *
 * Singleton pattern. Modules emit events without knowing who listens.
 * Listeners are called synchronously in registration order.
 */

import type { SessionSettings, SessionStatus } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("event-bus");

// ─── Event Definitions ──────────────────────────────────────────────────────

export interface EventMap {
  "session:created": { sessionId: string; projectSlug?: string };
  "session:phase-changed": { sessionId: string; from: SessionStatus; to: SessionStatus };
  "session:ended": { sessionId: string; exitCode?: number; reason?: string };
  "session:message": { sessionId: string; role: "user" | "assistant"; source?: string };
  /** Emitted by SessionSettingsService AFTER DB write succeeds. Subscribers
   *  (ws-bridge cache, telegram-idle-manager cache, ws broadcast) listen to
   *  stay in sync. Payload carries the FULL resolved settings — subscribers
   *  never need to re-query. */
  "session:settings:updated": { sessionId: string; settings: SessionSettings };
  "hook:pre-tool-use": {
    sessionId: string;
    toolName: string;
    riskLevel?: string;
    decision?: string;
  };
  "system:error": { source: string; error: string };

  // ── Dispatch events ──────────────────────────────────────────────────────
  "dispatch:classified": {
    sessionId: string;
    classification: {
      intent: string;
      pattern: string;
      complexity: string;
      confidence: number;
    };
  };
  "dispatch:started": { sessionId: string; pattern: string; intent: string };
  "dispatch:completed": {
    sessionId: string;
    pattern: string;
    targetSessionIds: string[];
    channelId?: string;
  };
  "dispatch:error": { sessionId: string; pattern: string; error: string };

  // ── Account events ────────────────────────────────────────────────────────
  "account:captured": { accountId: string; label: string; isNew: boolean };
  "account:switched": { accountId: string; label: string };
  "account:rate_limited": {
    accountId: string;
    accountLabel?: string;
    sessionId: string;
    reason: string;
  };
  "account:all_limited": { reason: string };
  /** Emitted by oauth-token-service when refresh returns 400 invalid_refresh_token.
   *  Signals the UI to surface a "re-authenticate" toast and the rotation
   *  scheduler to drop this account from the pool. */
  "account:expired": { accountId: string; label?: string; reason: string };
}

type EventName = keyof EventMap;
type Handler<T> = (payload: T) => void;

// ─── Event Bus Implementation ───────────────────────────────────────────────

class EventBusImpl {
  private handlers = new Map<string, Array<Handler<unknown>>>();

  on<K extends EventName>(event: K, handler: Handler<EventMap[K]>): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler<unknown>);
    this.handlers.set(event, list);

    // Return unsubscribe function
    return () => {
      const current = this.handlers.get(event);
      if (current) {
        const idx = current.indexOf(handler as Handler<unknown>);
        if (idx !== -1) current.splice(idx, 1);
      }
    };
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const list = this.handlers.get(event);
    if (!list?.length) return;

    for (const handler of list) {
      try {
        handler(payload);
      } catch (err) {
        log.error("Event handler error", { event, error: String(err) });
      }
    }
  }

  /** Remove all listeners (for testing) */
  clear(): void {
    this.handlers.clear();
  }
}

/** Singleton event bus instance */
export const eventBus = new EventBusImpl();
