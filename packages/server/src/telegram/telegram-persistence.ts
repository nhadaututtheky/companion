/**
 * TelegramPersistence — Manages DB persistence of chat-to-session mappings.
 * Extracted from TelegramBridge for separation of concerns.
 */

import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramSessionMappings } from "../db/schema.js";
import { createLogger } from "../logger.js";
import { sessionSettingsService } from "../services/session-settings-service.js";

const log = createLogger("telegram-persistence");

interface ChatMapping {
  sessionId: string;
  projectSlug: string;
  model: string;
  topicId?: number;
}

export class TelegramPersistence {
  private readonly mappings: Map<string, ChatMapping>;

  constructor(mappings: Map<string, ChatMapping>) {
    this.mappings = mappings;
  }

  loadMappings(deps: {
    mapKey: (chatId: number, topicId?: number) => string;
    getSession: (sessionId: string) => unknown;
    subscribeToSession: (sessionId: string, chatId: number, topicId?: number) => void;
    getSessionConfig: (sessionId: string) => { idleTimeoutMs: number };
    resetIdleTimer: (sessionId: string, chatId: number, topicId?: number) => void;
    deadSessions: Map<
      string,
      {
        chatId: number;
        topicId: number;
        sessionId: string;
        cliSessionId: string;
        projectSlug: string;
        model: string;
        diedAt: number;
      }
    >;
  }): void {
    try {
      const db = getDb();
      const rows = db.select().from(telegramSessionMappings).all();

      let loaded = 0;
      let dead = 0;
      let stale = 0;

      for (const row of rows) {
        const topicId = row.topicId ?? 0;
        const activeSession = deps.getSession(row.sessionId);

        if (activeSession) {
          // Session is alive — restore mapping + subscribe
          const key = deps.mapKey(row.chatId, topicId || undefined);
          this.mappings.set(key, {
            sessionId: row.sessionId,
            projectSlug: row.projectSlug,
            model: row.model,
            topicId: topicId || undefined,
          });
          deps.subscribeToSession(row.sessionId, row.chatId, topicId || undefined);
          // Restore persisted idle timeout into session config via service.
          // Pre-migration-0045 this read `row.idleTimeoutMs` directly from
          // the mapping table; that column is gone now.
          const cfg = deps.getSessionConfig(row.sessionId);
          const persisted = sessionSettingsService.get(row.sessionId);
          cfg.idleTimeoutMs =
            persisted.idleTimeoutEnabled === false ? 0 : persisted.idleTimeoutMs;
          deps.resetIdleTimer(row.sessionId, row.chatId, topicId || undefined);
          loaded++;
        } else if (row.cliSessionId) {
          // CLI died but has cliSessionId — can be resumed
          const key = deps.mapKey(row.chatId, topicId || undefined);
          deps.deadSessions.set(key, {
            chatId: row.chatId,
            topicId,
            sessionId: row.sessionId,
            cliSessionId: row.cliSessionId,
            projectSlug: row.projectSlug,
            model: row.model,
            diedAt: Date.now(),
          });
          dead++;
        } else {
          // No cliSessionId — truly stale, clean up
          db.delete(telegramSessionMappings).where(eq(telegramSessionMappings.id, row.id)).run();
          stale++;
        }
      }

      log.info("Loaded Telegram mappings", { loaded, dead, stale, total: rows.length });
    } catch (err) {
      log.error("Failed to load mappings", { error: String(err) });
    }
  }

  persistMapping(chatId: number, topicId: number | undefined, mapping: ChatMapping): void {
    try {
      const db = getDb();

      // Upsert: delete existing for this chat+topic, then insert
      db.delete(telegramSessionMappings)
        .where(
          and(
            eq(telegramSessionMappings.chatId, chatId),
            topicId !== undefined
              ? eq(telegramSessionMappings.topicId, topicId)
              : isNull(telegramSessionMappings.topicId),
          ),
        )
        .run();

      db.insert(telegramSessionMappings)
        .values({
          chatId,
          sessionId: mapping.sessionId,
          projectSlug: mapping.projectSlug,
          model: mapping.model,
          topicId: topicId ?? null,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        })
        .run();
    } catch (err) {
      log.error("Failed to persist mapping", { error: String(err) });
    }
  }

  updateMappingCliSessionId(sessionId: string, cliSessionId: string): void {
    try {
      const db = getDb();
      db.update(telegramSessionMappings)
        .set({ cliSessionId })
        .where(eq(telegramSessionMappings.sessionId, sessionId))
        .run();
    } catch (err) {
      log.error("Failed to update mapping cliSessionId", { sessionId, error: String(err) });
    }
  }
}
