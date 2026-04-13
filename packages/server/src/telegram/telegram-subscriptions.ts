/**
 * TelegramSubscriptions — Manages session subscriptions and stream subscriptions.
 * Extracted from TelegramBridge for separation of concerns.
 */

import { createLogger } from "../logger.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BrowserIncomingMessage } from "@companion/shared";

const log = createLogger("telegram-subscriptions");

export class TelegramSubscriptions {
  private readonly subscriptions: Map<string, () => void>;
  private readonly streamSubscriptions: Map<string, string>;
  private readonly wsBridge: WsBridge;
  private readonly botId: string;

  /**
   * Callback invoked for each session message — set by TelegramBridge after construction.
   * Avoids circular dependency at construction time.
   */
  onMessage?: (
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    msg: BrowserIncomingMessage,
  ) => Promise<void>;

  /**
   * Callback for setting a mapping from TelegramBridge (stream attach).
   * Set by TelegramBridge after construction.
   */
  onSetStreamMapping?: (
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    projectSlug: string,
    model: string,
  ) => void;

  /**
   * Callback for removing a mapping (stream detach).
   * Set by TelegramBridge after construction.
   */
  onRemoveStreamMapping?: (chatId: number, topicId?: number) => void;

  /**
   * Callback for getting a mapping (stream detach guard).
   */
  onGetMapping?: (chatId: number, topicId?: number) => { sessionId: string } | undefined;

  constructor(
    subscriptions: Map<string, () => void>,
    streamSubscriptions: Map<string, string>,
    wsBridge: WsBridge,
    botId: string,
  ) {
    this.subscriptions = subscriptions;
    this.streamSubscriptions = streamSubscriptions;
    this.wsBridge = wsBridge;
    this.botId = botId;
  }

  subscribeToSession(sessionId: string, chatId: number, topicId?: number): void {
    const subscriberId = `telegram:${this.botId}:${chatId}:${topicId ?? 0}`;

    const unsub = this.wsBridge.subscribe(sessionId, subscriberId, (msg) => {
      this.onMessage?.(chatId, topicId, sessionId, msg as BrowserIncomingMessage);
    });

    this.subscriptions.set(sessionId, unsub);
  }

  /**
   * Attach a chat to an existing session for stream-only observation.
   * Does NOT create a new CLI process. Does NOT set a full mapping.
   */
  attachStreamToSession(sessionId: string, chatId: number, topicId?: number): boolean {
    const session = this.wsBridge.getSession(sessionId);
    if (!session) return false;

    const subscriberId = `stream:${this.botId}:${chatId}:${topicId ?? 0}`;

    // Remove any existing stream subscription for this chat
    const existingKey = `${chatId}:${topicId ?? 0}`;
    const existingSessionId = this.streamSubscriptions.get(existingKey);
    if (existingSessionId) {
      this.wsBridge.subscribe(existingSessionId, subscriberId, () => {})(); // unsubscribe immediately
    }

    const unsub = this.wsBridge.subscribe(sessionId, subscriberId, (msg) => {
      this.onMessage?.(chatId, topicId, sessionId, msg as BrowserIncomingMessage);
    });

    // Track this stream subscription so we can detach it
    const chatKey = `${chatId}:${topicId ?? 0}`;
    this.streamSubscriptions.set(chatKey, sessionId);

    // Store the unsubscribe function keyed by chatKey+sessionId
    const unsubKey = `stream:${chatKey}:${sessionId}`;
    this.subscriptions.set(unsubKey, unsub);

    // Create a lightweight mapping so Telegram can send messages to this session
    const projectSlug = session.state.name ?? session.state.session_id ?? sessionId.slice(0, 8);
    const model = session.state.model ?? "claude-sonnet-4-6";
    this.onSetStreamMapping?.(chatId, topicId, sessionId, projectSlug, model);

    log.info("Stream subscriber attached", { sessionId, chatId, topicId });
    return true;
  }

  /**
   * Detach a stream-only subscription for a chat.
   * Does NOT kill the session. Session continues running normally.
   */
  detachStream(chatId: number, topicId?: number): string | undefined {
    const chatKey = `${chatId}:${topicId ?? 0}`;
    const sessionId = this.streamSubscriptions.get(chatKey);
    if (!sessionId) return undefined;

    const unsubKey = `stream:${chatKey}:${sessionId}`;
    const unsub = this.subscriptions.get(unsubKey);
    if (unsub) {
      unsub();
      this.subscriptions.delete(unsubKey);
    }

    this.streamSubscriptions.delete(chatKey);

    // Remove the lightweight mapping created by attachStreamToSession
    // (only if the mapping was created for stream, not for a full /start session)
    const mapping = this.onGetMapping?.(chatId, topicId);
    if (mapping?.sessionId === sessionId) {
      this.onRemoveStreamMapping?.(chatId, topicId);
    }

    log.info("Stream subscriber detached", { sessionId, chatId, topicId });
    return sessionId;
  }

  /** Get the sessionId this chat is stream-attached to (if any) */
  getStreamMapping(chatId: number, topicId?: number): string | undefined {
    return this.streamSubscriptions.get(`${chatId}:${topicId ?? 0}`);
  }
}
