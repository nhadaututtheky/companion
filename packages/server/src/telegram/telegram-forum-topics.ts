/**
 * TelegramForumTopics — Manages forum topic creation and lookup per group chat.
 * Extracted from TelegramBridge for separation of concerns.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramForumTopics } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("telegram-forum-topics");

export class TelegramForumTopics {
  private readonly bot: { api: import("grammy").Api };
  private readonly streamSubscriptions: Map<string, string>;

  constructor(bot: { api: import("grammy").Api }, streamSubscriptions: Map<string, string>) {
    this.bot = bot;
    this.streamSubscriptions = streamSubscriptions;
  }

  /**
   * Get or create a forum topic for a project in a group chat.
   * Returns the topic ID, or undefined if forum topics are not supported.
   */
  async getOrCreateForumTopic(
    chatId: number,
    projectSlug: string,
    projectName: string,
  ): Promise<number | undefined> {
    // Only works in group chats (negative chatId)
    if (chatId >= 0) return undefined;

    const db = getDb();

    // Check if we already have a topic for this project in this group
    const existing = db
      .select()
      .from(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .get();

    if (existing) {
      return existing.topicId;
    }

    // Try to create a new forum topic
    try {
      const topicName = `📂 ${projectName}`;
      const forumTopic = await this.bot.api.createForumTopic(chatId, topicName);
      const topicId = forumTopic.message_thread_id;

      db.insert(telegramForumTopics)
        .values({
          chatId,
          projectSlug,
          topicId,
          topicName,
        })
        .run();

      log.info("Created forum topic", { chatId, projectSlug, topicId, topicName });
      return topicId;
    } catch {
      // Forum topics not enabled in this group — that's fine
      return undefined;
    }
  }

  /** Get the stored forum topic for a project (no creation). */
  getForumTopicId(chatId: number, projectSlug: string): number | undefined {
    const db = getDb();
    const row = db
      .select({ topicId: telegramForumTopics.topicId })
      .from(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .get();
    return row?.topicId;
  }

  /** List all forum topics for a group chat. */
  listForumTopics(
    chatId: number,
  ): Array<{ projectSlug: string; topicId: number; topicName: string }> {
    const db = getDb();
    return db
      .select({
        projectSlug: telegramForumTopics.projectSlug,
        topicId: telegramForumTopics.topicId,
        topicName: telegramForumTopics.topicName,
      })
      .from(telegramForumTopics)
      .where(eq(telegramForumTopics.chatId, chatId))
      .all();
  }

  /** Delete a forum topic mapping (does NOT delete the Telegram topic itself). */
  deleteForumTopicMapping(chatId: number, projectSlug: string): void {
    const db = getDb();
    db.delete(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .run();
  }

  /** Reverse lookup: find the stream subscriber info for a given sessionId */
  getStreamSubscriberForSession(
    sessionId: string,
  ): { chatId: number; topicId: number } | undefined {
    for (const [chatKey, sid] of this.streamSubscriptions.entries()) {
      if (sid === sessionId) {
        const [chatIdStr, topicIdStr] = chatKey.split(":");
        return { chatId: Number(chatIdStr), topicId: Number(topicIdStr) };
      }
    }
    return undefined;
  }
}
