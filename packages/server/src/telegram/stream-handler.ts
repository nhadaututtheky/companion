/**
 * StreamHandler — Manages streaming AI responses to Telegram.
 * Uses sendMessageDraft (Bot API 9.5) with fallback to editMessageText.
 */

import type { Api } from "grammy";
import { splitMessage, toTelegramHTML } from "./formatter.js";
import { createLogger } from "../logger.js";

const log = createLogger("stream-handler");

/** Minimum interval between draft updates (ms) */
const DRAFT_INTERVAL_MS = 500;

/** Max text length before starting new message */
const MAX_DRAFT_LENGTH = 3800;

interface ActiveStream {
  chatId: number;
  topicId?: number;
  /** Permanent message ID (from sendMessage) */
  messageId: number | null;
  /** Draft business_connection_id (Bot API 9.5) */
  draftId: string | null;
  /** Draft sequence counter */
  draftSeq: number;
  /** Accumulated raw text (Markdown from Claude) */
  rawText: string;
  /** Last sent HTML text */
  lastSentHTML: string;
  /** Last update timestamp */
  lastUpdateAt: number;
  /** Pending update timer */
  pendingTimer: ReturnType<typeof setTimeout> | null;
  /** Whether streaming is complete */
  completed: boolean;
}

/**
 * Manages streaming responses per chat+topic.
 * Key format: `chatId:topicId`
 */
export class StreamHandler {
  private streams = new Map<string, ActiveStream>();
  private api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  private key(chatId: number, topicId?: number): string {
    return `${chatId}:${topicId ?? 0}`;
  }

  /**
   * Start a new streaming response.
   */
  async startStream(chatId: number, topicId?: number): Promise<void> {
    const k = this.key(chatId, topicId);

    // Clean up any existing stream
    this.cleanupStream(k);

    // Send typing indicator
    await this.api.sendChatAction(chatId, "typing", {
      message_thread_id: topicId,
    }).catch(() => {});

    this.streams.set(k, {
      chatId,
      topicId,
      messageId: null,
      draftId: null,
      draftSeq: 0,
      rawText: "",
      lastSentHTML: "",
      lastUpdateAt: 0,
      pendingTimer: null,
      completed: false,
    });
  }

  /**
   * Append text to the stream. Sends/updates message with throttling.
   */
  async appendText(chatId: number, text: string, topicId?: number): Promise<void> {
    const k = this.key(chatId, topicId);
    const stream = this.streams.get(k);
    if (!stream || stream.completed) return;

    stream.rawText += text;

    const now = Date.now();
    const elapsed = now - stream.lastUpdateAt;

    if (elapsed >= DRAFT_INTERVAL_MS) {
      await this.flushStream(stream);
    } else if (!stream.pendingTimer) {
      // Schedule a flush
      stream.pendingTimer = setTimeout(async () => {
        stream.pendingTimer = null;
        if (!stream.completed) {
          await this.flushStream(stream);
        }
      }, DRAFT_INTERVAL_MS - elapsed);
    }
  }

  /**
   * Complete the stream — send final permanent message.
   */
  async completeStream(chatId: number, topicId?: number): Promise<number | null> {
    const k = this.key(chatId, topicId);
    const stream = this.streams.get(k);
    if (!stream) return null;

    stream.completed = true;

    // Clear pending timer
    if (stream.pendingTimer) {
      clearTimeout(stream.pendingTimer);
      stream.pendingTimer = null;
    }

    // Final flush
    await this.flushStream(stream);

    const messageId = stream.messageId;
    this.streams.delete(k);
    return messageId;
  }

  /**
   * Cancel an active stream.
   */
  cancelStream(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    this.cleanupStream(k);
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async flushStream(stream: ActiveStream): Promise<void> {
    if (!stream.rawText) return;

    const html = toTelegramHTML(stream.rawText);
    if (html === stream.lastSentHTML) return;

    stream.lastUpdateAt = Date.now();

    try {
      if (!stream.messageId) {
        // First message — try sendMessageDraft, fallback to sendMessage
        const sent = await this.sendInitialMessage(stream, html);
        if (sent) {
          stream.messageId = sent;
          stream.lastSentHTML = html;
        }
      } else if (html.length > MAX_DRAFT_LENGTH && !stream.completed) {
        // Text too long — try sendMessageDraft for overflow, or just wait for complete
        await this.updateMessage(stream, html);
        stream.lastSentHTML = html;
      } else {
        // Update existing message
        await this.updateMessage(stream, html);
        stream.lastSentHTML = html;
      }
    } catch (err) {
      const errStr = String(err);
      // Ignore "message is not modified" errors
      if (!errStr.includes("message is not modified")) {
        log.error("Stream flush error", { chatId: stream.chatId, error: errStr });
      }
    }
  }

  private async sendInitialMessage(stream: ActiveStream, html: string): Promise<number | null> {
    try {
      // Try sendMessageDraft first (Bot API 9.5+)
      const result = await (this.api as unknown as Record<string, Function>)
        .sendMessageDraft?.(stream.chatId, html, {
          parse_mode: "HTML",
          message_thread_id: stream.topicId,
        });

      if (result?.message_id) {
        stream.draftId = result.draft_id ?? null;
        return result.message_id;
      }
    } catch {
      // sendMessageDraft not available, fallback
    }

    // Fallback: regular sendMessage
    const result = await this.api.sendMessage(stream.chatId, html, {
      parse_mode: "HTML",
      message_thread_id: stream.topicId,
    });

    return result.message_id;
  }

  private async updateMessage(stream: ActiveStream, html: string): Promise<void> {
    if (!stream.messageId) return;

    // If text exceeds Telegram limit, split
    if (html.length > 4000) {
      const chunks = splitMessage(html, 3900);
      // Edit existing message with first chunk
      await this.api.editMessageText(stream.chatId, stream.messageId, chunks[0]!, {
        parse_mode: "HTML",
      }).catch(() => {});

      // Send remaining chunks as new messages (only on complete)
      if (stream.completed && chunks.length > 1) {
        for (let i = 1; i < chunks.length; i++) {
          const sent = await this.api.sendMessage(stream.chatId, chunks[i]!, {
            parse_mode: "HTML",
            message_thread_id: stream.topicId,
          });
          // Update messageId to last sent message
          stream.messageId = sent.message_id;
        }
      }
      return;
    }

    // Try updating draft if available
    if (stream.draftId) {
      try {
        await (this.api as unknown as Record<string, Function>)
          .editMessageDraft?.(stream.chatId, stream.messageId, html, {
            parse_mode: "HTML",
            draft_id: stream.draftId,
            draft_seq: ++stream.draftSeq,
          });
        return;
      } catch {
        // Draft edit failed, fallback to regular edit
        stream.draftId = null;
      }
    }

    // Regular editMessageText
    await this.api.editMessageText(stream.chatId, stream.messageId, html, {
      parse_mode: "HTML",
    });
  }

  private cleanupStream(key: string): void {
    const stream = this.streams.get(key);
    if (stream) {
      if (stream.pendingTimer) {
        clearTimeout(stream.pendingTimer);
      }
      this.streams.delete(key);
    }
  }
}
