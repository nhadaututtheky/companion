/**
 * StreamHandler — Accumulates AI response text, sends ONE message when complete.
 *
 * No streaming, no editing, no drafts. Just:
 * 1. Show "typing..." while Claude responds
 * 2. Accumulate all text chunks silently
 * 3. Send one clean message when result arrives
 *
 * Typing indicator refreshed every 4s (Telegram expires after 5s).
 */

import type { Api } from "grammy";
import { toTelegramHTML, splitMessage, stripHtmlTags } from "./formatter.js";
import { createLogger } from "../logger.js";

const log = createLogger("stream-handler");

/** Telegram typing indicator expires after ~5s, refresh every 4s */
const TYPING_REFRESH_MS = 4_000;

interface PendingResponse {
  chatId: number;
  topicId?: number;
  /** Accumulated raw markdown text from all chunks */
  rawText: string;
  /** Typing indicator refresh timer */
  typingTimer: ReturnType<typeof setInterval>;
}

export class StreamHandler {
  private pending = new Map<string, PendingResponse>();
  private api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  private key(chatId: number, topicId?: number): string {
    return `${chatId}:${topicId ?? 0}`;
  }

  /**
   * Append incremental text. Accumulates silently while showing typing indicator.
   */
  async appendText(chatId: number, text: string, topicId?: number): Promise<void> {
    const k = this.key(chatId, topicId);
    let p = this.pending.get(k);

    if (!p) {
      // First chunk — start typing indicator
      this.api.sendChatAction(chatId, "typing", {
        message_thread_id: topicId,
      }).catch(() => {});

      p = {
        chatId,
        topicId,
        rawText: text,
        typingTimer: setInterval(() => {
          this.api.sendChatAction(chatId, "typing", {
            message_thread_id: topicId,
          }).catch(() => {});
        }, TYPING_REFRESH_MS),
      };

      this.pending.set(k, p);
      return;
    }

    // Accumulate
    p.rawText += text;
  }

  /**
   * Complete — stop typing, send ONE final message with all accumulated text.
   */
  async completeStream(chatId: number, topicId?: number): Promise<number | null> {
    const k = this.key(chatId, topicId);
    const p = this.pending.get(k);
    if (!p) return null;

    // Stop typing
    clearInterval(p.typingTimer);
    this.pending.delete(k);

    const html = toTelegramHTML(p.rawText);
    if (!html) return null;

    // Send message(s)
    if (html.length > 4000) {
      const chunks = splitMessage(html, 3900);
      let lastMsgId = 0;
      const total = chunks.length;
      for (let i = 0; i < total; i++) {
        try {
          if (i > 0) await new Promise((r) => setTimeout(r, 500));
          const partLabel = total > 1 ? `\n\n<i>📄 Part ${i + 1}/${total}</i>` : "";
          const sent = await this.api.sendMessage(chatId, chunks[i]! + partLabel, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          });
          lastMsgId = sent.message_id;
        } catch (err) {
          log.warn("HTML chunk parse failed, falling back to plain text", { error: String(err) });
          try {
            const sent = await this.api.sendMessage(chatId, stripHtmlTags(chunks[i]!), {
              message_thread_id: topicId,
            });
            lastMsgId = sent.message_id;
          } catch (fallbackErr) {
            log.error("Failed to send fallback chunk", { error: String(fallbackErr) });
          }
        }
      }
      return lastMsgId;
    }

    try {
      const sent = await this.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        message_thread_id: topicId,
      });
      return sent.message_id;
    } catch (err) {
      log.warn("HTML parse failed, falling back to plain text", { error: String(err) });
      // Fallback: send raw markdown without parse_mode
      try {
        const sent = await this.api.sendMessage(chatId, p.rawText, {
          message_thread_id: topicId,
        });
        return sent.message_id;
      } catch (fallbackErr) {
        log.error("Failed to send fallback message", { error: String(fallbackErr) });
        return null;
      }
    }
  }

  /** Cancel without sending */
  cancelStream(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    const p = this.pending.get(k);
    if (p) {
      clearInterval(p.typingTimer);
      this.pending.delete(k);
    }
  }

  /** Check if there's a pending response */
  hasActiveStream(chatId: number, topicId?: number): boolean {
    return this.pending.has(this.key(chatId, topicId));
  }
}
