/**
 * StreamHandler — Accumulates AI response text and sends incrementally.
 *
 * Flow:
 * 1. Show "typing..." while Claude responds
 * 2. Accumulate text chunks, flush on natural breaks:
 *    - Paragraph break (\n\n)
 *    - Buffer > 800 chars
 *    - 3-second idle (no new text)
 * 3. Use editMessageText to update the current message
 * 4. Start a new message when hitting Telegram's 4096 char limit
 * 5. completeStream() does final flush + cleanup
 *
 * Typing indicator refreshed every 4s (Telegram expires after 5s).
 */

import type { Api } from "grammy";
import { toTelegramHTML, splitMessage, stripHtmlTags } from "./formatter.js";
import { createLogger } from "../logger.js";

const log = createLogger("stream-handler");

/** Telegram typing indicator expires after ~5s, refresh every 4s */
const TYPING_REFRESH_MS = 4_000;
/** Max chars to accumulate before forcing a flush */
const FLUSH_BUFFER_THRESHOLD = 800;
/** Idle time before auto-flushing partial text */
const IDLE_FLUSH_MS = 3_000;
/** Minimum interval between message edits (avoid rate limits) */
const MIN_EDIT_INTERVAL_MS = 1_500;
/** Telegram message text limit — start new message before hitting this */
const TELEGRAM_MSG_LIMIT = 4000;

interface PendingResponse {
  chatId: number;
  topicId?: number;
  /** Accumulated raw markdown text (unflushed portion) */
  rawText: string;
  /** All text sent so far in the current message (for edit mode) */
  sentText: string;
  /** Current Telegram message ID being edited (null = need to send new) */
  messageId: number | null;
  /** All message IDs sent during this stream */
  allMessageIds: number[];
  /** Typing indicator refresh timer */
  typingTimer: ReturnType<typeof setInterval>;
  /** Idle flush timer — fires if no new text arrives for IDLE_FLUSH_MS */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Last time we edited/sent a message (for rate limiting) */
  lastEditTime: number;
}

export class StreamHandler {
  private pending = new Map<string, PendingResponse>();
  private needsSeparator = new Set<string>();
  private api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  private key(chatId: number, topicId?: number): string {
    return `${chatId}:${topicId ?? 0}`;
  }

  /** Mark that a tool break occurred — next text append will get a line break separator */
  markBreak(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    if (this.pending.has(k)) {
      this.needsSeparator.add(k);
    }
  }

  /**
   * Append incremental text. Flushes on natural breaks.
   */
  async appendText(chatId: number, text: string, topicId?: number): Promise<void> {
    const k = this.key(chatId, topicId);
    let p = this.pending.get(k);

    if (!p) {
      // First chunk — start typing indicator
      this.api
        .sendChatAction(chatId, "typing", {
          message_thread_id: topicId,
        })
        .catch(() => {});

      p = {
        chatId,
        topicId,
        rawText: text,
        sentText: "",
        messageId: null,
        allMessageIds: [],
        typingTimer: setInterval(() => {
          this.api
            .sendChatAction(chatId, "typing", {
              message_thread_id: topicId,
            })
            .catch(() => {});
        }, TYPING_REFRESH_MS),
        idleTimer: null,
        lastEditTime: 0,
      };

      this.pending.set(k, p);
      this.resetIdleTimer(k, p);
      return;
    }

    // Add separator if a tool break occurred between text blocks
    if (this.needsSeparator.has(k)) {
      this.needsSeparator.delete(k);
      // Insert separator between previous content and new text.
      // When rawText is empty, sentText holds previous content — still need the break.
      const hasPrior = p.rawText.length > 0 || p.sentText.length > 0;
      if (hasPrior && !p.rawText.endsWith("\n\n") && !p.sentText.endsWith("\n\n")) {
        p.rawText += "\n\n";
      }
    }

    // Accumulate
    p.rawText += text;

    // Reset idle timer
    this.resetIdleTimer(k, p);

    // Check flush triggers
    const hasNaturalBreak = text.includes("\n\n");
    const bufferFull = p.rawText.length >= FLUSH_BUFFER_THRESHOLD;

    if (hasNaturalBreak || bufferFull) {
      await this.flushPartial(k);
    }
  }

  /**
   * Flush current buffer — edit existing message or send new one.
   */
  private async flushPartial(k: string): Promise<void> {
    const p = this.pending.get(k);
    if (!p || p.rawText.length === 0) return;

    // Rate limit: don't edit too frequently
    const now = Date.now();
    if (now - p.lastEditTime < MIN_EDIT_INTERVAL_MS) return;

    const fullText = p.sentText + p.rawText;
    const html = toTelegramHTML(fullText);
    if (!html) return;

    // Check if current message would exceed Telegram limit
    if (p.messageId && html.length > TELEGRAM_MSG_LIMIT) {
      // Finalize current message with sentText, start new message with rawText
      await this.finalizeCurrentMessage(p);
      // Send rawText as new message
      await this.sendNewMessage(p, p.rawText);
      return;
    }

    if (p.messageId) {
      // Edit existing message with full accumulated text
      try {
        await this.api.editMessageText(p.chatId, p.messageId, html, {
          parse_mode: "HTML",
        });
        p.sentText = fullText;
        p.rawText = "";
        p.lastEditTime = Date.now();
      } catch (err) {
        const errStr = String(err);
        // Message was deleted by user or "message is not modified"
        if (errStr.includes("message to edit not found") || errStr.includes("MESSAGE_ID_INVALID")) {
          p.messageId = null;
          p.sentText = "";
          // Will try sending as new message next flush
        } else if (errStr.includes("message is not modified")) {
          // Content hasn't changed enough, skip
          p.lastEditTime = Date.now();
        } else {
          log.warn("Failed to edit message", { error: errStr });
        }
      }
    } else {
      // Send as new message
      await this.sendNewMessage(p, fullText);
    }
  }

  /** Send text as a new Telegram message, update state */
  private async sendNewMessage(p: PendingResponse, text: string): Promise<void> {
    const html = toTelegramHTML(text);
    if (!html) return;

    try {
      const sent = await this.api.sendMessage(p.chatId, html, {
        parse_mode: "HTML",
        message_thread_id: p.topicId,
      });
      p.messageId = sent.message_id;
      p.allMessageIds.push(sent.message_id);
      p.sentText = text;
      p.rawText = "";
      p.lastEditTime = Date.now();
    } catch (err) {
      log.warn("HTML send failed, trying plain text", { error: String(err) });
      try {
        const sent = await this.api.sendMessage(p.chatId, stripHtmlTags(html), {
          message_thread_id: p.topicId,
        });
        p.messageId = sent.message_id;
        p.allMessageIds.push(sent.message_id);
        p.sentText = text;
        p.rawText = "";
        p.lastEditTime = Date.now();
      } catch (fallbackErr) {
        log.error("Failed to send message", { error: String(fallbackErr) });
      }
    }
  }

  /** Finalize current message (no more edits) */
  private async finalizeCurrentMessage(p: PendingResponse): Promise<void> {
    if (!p.messageId || !p.sentText) return;
    // Message is already up-to-date with sentText — just detach
    p.messageId = null;
    p.sentText = "";
  }

  /** Reset idle flush timer */
  private resetIdleTimer(k: string, p: PendingResponse): void {
    if (p.idleTimer) clearTimeout(p.idleTimer);
    p.idleTimer = setTimeout(() => {
      p.idleTimer = null;
      this.flushPartial(k).catch(() => {});
    }, IDLE_FLUSH_MS);
  }

  /**
   * Complete — stop typing, flush remaining text, return last message ID.
   */
  async completeStream(chatId: number, topicId?: number): Promise<number | null> {
    const k = this.key(chatId, topicId);
    const p = this.pending.get(k);
    if (!p) return null;

    // Stop timers
    clearInterval(p.typingTimer);
    if (p.idleTimer) clearTimeout(p.idleTimer);
    this.pending.delete(k);
    this.needsSeparator.delete(k);

    // Final flush of remaining text
    if (p.rawText.length > 0) {
      const fullText = p.sentText + p.rawText;
      const html = toTelegramHTML(fullText);

      if (html) {
        if (p.messageId && html.length <= TELEGRAM_MSG_LIMIT) {
          // Edit existing message with final content
          try {
            await this.api.editMessageText(p.chatId, p.messageId, html, {
              parse_mode: "HTML",
            });
            return p.messageId;
          } catch {
            // Edit failed — old message still shows sentText.
            // Only send rawText as new message to avoid duplicating sentText.
            p.messageId = null;
          }
        }

        // Send remaining text as new message.
        // If sentText exists (either in current message or a failed-to-edit message),
        // only send rawText to avoid duplicating what's already visible.
        if (p.messageId || p.sentText) {
          await this.sendNewMessage(p, p.rawText);
        } else {
          // No prior message at all — send everything
          await this.sendNewMessage(p, fullText);
        }
      }
    }

    return p.allMessageIds.at(-1) ?? p.messageId ?? null;
  }

  /** Cancel without sending */
  cancelStream(chatId: number, topicId?: number): void {
    const k = this.key(chatId, topicId);
    const p = this.pending.get(k);
    if (p) {
      clearInterval(p.typingTimer);
      if (p.idleTimer) clearTimeout(p.idleTimer);
      this.pending.delete(k);
      this.needsSeparator.delete(k);
    }
  }

  /** Check if there's a pending response */
  hasActiveStream(chatId: number, topicId?: number): boolean {
    return this.pending.has(this.key(chatId, topicId));
  }
}
