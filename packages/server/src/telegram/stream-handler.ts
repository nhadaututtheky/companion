/**
 * StreamHandler — Telegram reply renderer.
 *
 * Design: render the assistant's full text ONCE when it arrives, never edit.
 * Streaming deltas only drive the typing indicator. This is boring and correct:
 * no rate limits, no mid-stream markdown, no edit/resend races, no HTML-split
 * re-flow. Long replies are chunked via splitMessage and sent sequentially.
 *
 * Tool feed (upsertToolFeed in telegram-bridge) remains live-editable — it's a
 * separate message and doesn't interact with this handler.
 */

import type { Api } from "grammy";
import { toTelegramHTML, splitMessage, stripHtmlTags } from "./formatter.js";
import { createLogger } from "../logger.js";

const log = createLogger("stream-handler");

/** Telegram typing indicator expires after ~5s, refresh every 4s */
const TYPING_REFRESH_MS = 4_000;
/** Chunk size for long replies (leaves headroom under Telegram's 4096 limit) */
const TELEGRAM_MSG_LIMIT = 4000;

interface TypingSession {
  chatId: number;
  topicId?: number;
  timer: ReturnType<typeof setInterval>;
}

export class StreamHandler {
  private typing = new Map<string, TypingSession>();
  private api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  private key(chatId: number, topicId?: number): string {
    return `${chatId}:${topicId ?? 0}`;
  }

  private sendTypingAction(chatId: number, topicId?: number): void {
    this.api.sendChatAction(chatId, "typing", { message_thread_id: topicId }).catch(() => {});
  }

  /**
   * Start/refresh the typing indicator for a chat. Idempotent.
   * Call on every incoming stream_event so the indicator stays visible.
   */
  ensureTyping(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    if (this.typing.has(k)) return;

    this.sendTypingAction(chatId, topicId);
    const timer = setInterval(() => this.sendTypingAction(chatId, topicId), TYPING_REFRESH_MS);
    this.typing.set(k, { chatId, topicId, timer });
  }

  /** Stop typing indicator. Safe to call when none is active. */
  stopTyping(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    const t = this.typing.get(k);
    if (!t) return;
    clearInterval(t.timer);
    this.typing.delete(k);
  }

  /**
   * Render a completed assistant text as one or more Telegram messages.
   * Markdown is converted to HTML once, then split at safe boundaries.
   * Returns the sent message IDs in order.
   */
  async renderFinal(chatId: number, text: string, topicId?: number): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const html = toTelegramHTML(trimmed);
    if (!html) return [];

    const chunks = splitMessage(html, TELEGRAM_MSG_LIMIT);
    const ids: number[] = [];

    for (const chunk of chunks) {
      const id = await this.sendOrFallback(chatId, topicId, chunk);
      if (id !== null) ids.push(id);
    }
    return ids;
  }

  /** Send a single chunk; fall back to plain text if HTML parse fails. */
  private async sendOrFallback(
    chatId: number,
    topicId: number | undefined,
    chunk: string,
  ): Promise<number | null> {
    try {
      const sent = await this.api.sendMessage(chatId, chunk, {
        parse_mode: "HTML",
        message_thread_id: topicId,
      });
      return sent.message_id;
    } catch (err) {
      log.warn("HTML send failed, retrying as plain text", { error: String(err) });
      try {
        const sent = await this.api.sendMessage(chatId, stripHtmlTags(chunk), {
          message_thread_id: topicId,
        });
        return sent.message_id;
      } catch (fallbackErr) {
        log.error("Failed to send message", { error: String(fallbackErr) });
        return null;
      }
    }
  }
}
