/**
 * TelegramIdleManager — Manages idle timeout and busy watchdog logic per session.
 * Extracted from TelegramBridge for separation of concerns.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramSessionMappings } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("telegram-idle-manager");

/** Interval to notify user when session is busy with no CLI events (15 min) — notification only, never kills */
const BUSY_NOTIFY_MS = 15 * 60 * 1000;

/** Per-session panel + idle config stored in memory */
export interface SessionConfig {
  /** Telegram message_id of the settings panel message (for editing) */
  panelMessageId?: number;
  /** Idle timeout in ms (0 = never) */
  idleTimeoutMs: number;
  /** Idle timeout timer handle */
  idleTimer?: ReturnType<typeof setTimeout>;
  /** Warning timer — fires before idle kill */
  idleWarningTimer?: ReturnType<typeof setTimeout>;
  /** Busy notification timer — notifies user when CLI has been silent for a while (never kills) */
  busyWatchdog?: ReturnType<typeof setTimeout>;
  /** Whether we already sent a "still running" notification this busy cycle */
  busyNotified?: boolean;
  /** Last time idle timer was reset — used to debounce resets from stream events */
  lastIdleReset?: number;
  /** Generation counter — incremented on each resetIdleTimer call; stale callbacks check this */
  idleGeneration: number;
}

/**
 * Minimal interface required by TelegramIdleManager from TelegramBridge.
 * Keeps the dependency surface small and avoids circular type imports.
 */
export interface IdleManagerBridgeDeps {
  bot: { api: import("grammy").Api };
  wsBridge: { getSession(id: string): { state: { status: string } } | undefined };
  getMapping(chatId: number, topicId?: number): { sessionId: string } | undefined;
  killSession(sessionId: string): void;
  removeMapping(chatId: number, topicId?: number): void;
  clearDeadSession(chatId: number, topicId: number): void;
}

export class TelegramIdleManager {
  private readonly sessionConfigs: Map<string, SessionConfig>;
  private readonly bridge: IdleManagerBridgeDeps;

  constructor(sessionConfigs: Map<string, SessionConfig>, bridge: IdleManagerBridgeDeps) {
    this.sessionConfigs = sessionConfigs;
    this.bridge = bridge;
  }

  getSessionConfig(sessionId: string): SessionConfig {
    let cfg = this.sessionConfigs.get(sessionId);
    if (!cfg) {
      cfg = { idleTimeoutMs: this.loadPersistedTimeout(sessionId), idleGeneration: 0 };
      this.sessionConfigs.set(sessionId, cfg);
    }
    return cfg;
  }

  /**
   * Load idle timeout from DB mapping (per-session persistence).
   * Returns 0 when user disabled timeout, default 1h otherwise.
   * Called on first getSessionConfig — subsequent calls hit the in-memory cache.
   */
  private loadPersistedTimeout(sessionId: string): number {
    try {
      const db = getDb();
      const row = db
        .select({
          idleTimeoutMs: telegramSessionMappings.idleTimeoutMs,
          idleTimeoutEnabled: telegramSessionMappings.idleTimeoutEnabled,
        })
        .from(telegramSessionMappings)
        .where(eq(telegramSessionMappings.sessionId, sessionId))
        .get();
      if (row) return row.idleTimeoutEnabled ? row.idleTimeoutMs : 0;
    } catch (err) {
      log.warn("Failed to load persisted idle timeout, falling back to default", {
        sessionId,
        error: String(err),
      });
    }
    return 3_600_000;
  }

  setSessionPanelMessageId(sessionId: string, messageId: number): void {
    this.getSessionConfig(sessionId).panelMessageId = messageId;
  }

  setIdleTimeout(sessionId: string, ms: number): void {
    const cfg = this.getSessionConfig(sessionId);
    cfg.idleTimeoutMs = ms;
    this.persistIdleTimeout(sessionId, ms);
  }

  private persistIdleTimeout(sessionId: string, ms: number): void {
    try {
      const db = getDb();
      db.update(telegramSessionMappings)
        .set({
          idleTimeoutEnabled: ms > 0,
          idleTimeoutMs: ms,
        })
        .where(eq(telegramSessionMappings.sessionId, sessionId))
        .run();
    } catch (err) {
      log.error("Failed to persist idle timeout", { sessionId, error: String(err) });
    }
  }

  /** Reset the idle timer for a session. Called on session start, user message, CLI activity + result events. */
  resetIdleTimer(sessionId: string, chatId: number, topicId?: number): void {
    const cfg = this.getSessionConfig(sessionId);
    cfg.lastIdleReset = Date.now();

    // Bump generation — any in-flight callbacks from previous timers will see a mismatch and bail
    const generation = ++cfg.idleGeneration;

    if (cfg.idleTimer) {
      clearTimeout(cfg.idleTimer);
      cfg.idleTimer = undefined;
    }
    if (cfg.idleWarningTimer) {
      clearTimeout(cfg.idleWarningTimer);
      cfg.idleWarningTimer = undefined;
    }

    // Clear busy watchdog — session is no longer busy
    if (cfg.busyWatchdog) {
      clearTimeout(cfg.busyWatchdog);
      cfg.busyWatchdog = undefined;
    }

    if (cfg.idleTimeoutMs <= 0) return;

    const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

    // Warning before kill (only if timeout > 5 min)
    if (cfg.idleTimeoutMs > WARN_BEFORE_MS) {
      cfg.idleWarningTimer = setTimeout(async () => {
        cfg.idleWarningTimer = undefined;

        // Stale timer guard: if resetIdleTimer was called since this timer was set, skip
        if (cfg.idleGeneration !== generation) return;

        // Guard: check session still exists AND still belongs to this chat
        const session = this.bridge.wsBridge.getSession(sessionId);
        if (!session) return;
        const currentMapping = this.bridge.getMapping(chatId, topicId);
        if (currentMapping?.sessionId !== sessionId) return; // chat moved to different session

        const keyboard = {
          inline_keyboard: [
            [
              { text: "💬 Keep Alive", callback_data: `panel:idle:extend:${sessionId}` },
              { text: "💤 Let it go", callback_data: `panel:idle:letgo:${sessionId}` },
            ],
          ],
        };

        await this.bridge.bot.api
          .sendMessage(
            chatId,
            "⏰ Session idle — auto-stop in <b>5 minutes</b>. Send a message or tap below.",
            {
              parse_mode: "HTML",
              reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
              message_thread_id: topicId,
            },
          )
          .catch(() => {});
      }, cfg.idleTimeoutMs - WARN_BEFORE_MS);
    }

    // Kill timer
    cfg.idleTimer = setTimeout(async () => {
      cfg.idleTimer = undefined;

      // Stale timer guard: if resetIdleTimer was called since this timer was set, skip
      if (cfg.idleGeneration !== generation) {
        log.info("Stale idle kill timer skipped (generation mismatch)", {
          sessionId,
          timerGen: generation,
          currentGen: cfg.idleGeneration,
        });
        return;
      }

      // Guard: check session still exists AND still belongs to this chat
      const session = this.bridge.wsBridge.getSession(sessionId);
      if (!session) return;
      const currentMapping = this.bridge.getMapping(chatId, topicId);
      if (currentMapping?.sessionId !== sessionId) return; // chat moved to different session

      log.info("Idle timeout expired, stopping session permanently", {
        sessionId,
        idleMs: cfg.idleTimeoutMs,
      });
      this.bridge.killSession(sessionId);
      this.bridge.removeMapping(chatId, topicId);

      // Idle timeout = permanent kill — clear cliSessionId so session can't be resumed
      this.bridge.clearDeadSession(chatId, topicId ?? 0);
      try {
        const db = getDb();
        db.update(telegramSessionMappings)
          .set({ cliSessionId: null })
          .where(eq(telegramSessionMappings.sessionId, sessionId))
          .run();
      } catch {
        // non-fatal
      }

      const minutes = Math.round(cfg.idleTimeoutMs / 60_000);
      const label = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
      await this.bridge.bot.api
        .sendMessage(
          chatId,
          `⏰ Session idle for ${label}, stopped. Use /start for a new session.`,
          {
            message_thread_id: topicId,
          },
        )
        .catch(() => {});
    }, cfg.idleTimeoutMs);
  }

  /**
   * Reset the busy watchdog. Called on any sign of life from CLI (tool_progress, assistant, stream).
   * After BUSY_NOTIFY_MS of silence while busy, sends a one-time notification — NEVER kills.
   */
  resetBusyWatchdog(sessionId: string, chatId: number, topicId?: number): void {
    const cfg = this.getSessionConfig(sessionId);

    if (cfg.busyWatchdog) {
      clearTimeout(cfg.busyWatchdog);
      cfg.busyWatchdog = undefined;
    }

    cfg.busyNotified = false;

    cfg.busyWatchdog = setTimeout(async () => {
      cfg.busyWatchdog = undefined;
      const session = this.bridge.wsBridge.getSession(sessionId);
      if (!session) return;
      if (session.state.status !== "busy") return;
      if (cfg.busyNotified) return;

      cfg.busyNotified = true;
      log.info("Session busy with no CLI events for 15 min — notifying user", { sessionId });

      await this.bridge.bot.api
        .sendMessage(
          chatId,
          `ℹ️ Session has been running silently for 15 min (likely a long tool). It will continue until the idle timeout expires or you /stop it.`,
          { message_thread_id: topicId },
        )
        .catch(() => {});
    }, BUSY_NOTIFY_MS);
  }
}
