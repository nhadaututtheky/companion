/**
 * BotRegistry — Manages multiple Telegram bot instances.
 * Each bot can have a different role (claude, anti, general).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramBots } from "../db/schema.js";
import { TelegramBridge } from "./telegram-bridge.js";
import { createLogger } from "../logger.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BotConfig } from "./bot-factory.js";
import { escapeHTML } from "./formatter.js";
import { encrypt, decrypt, warnIfNoEncryption } from "../services/crypto.js";

const log = createLogger("bot-registry");

interface BotEntry {
  config: BotConfig;
  bridge: TelegramBridge;
  running: boolean;
  /** Telegram chat/group ID to receive notifications */
  notificationGroupId?: number;
}

export class BotRegistry {
  private bots = new Map<string, BotEntry>();
  private wsBridge: WsBridge;

  constructor(wsBridge: WsBridge) {
    this.wsBridge = wsBridge;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start a bot by config. Returns success status.
   */
  async startBot(config: BotConfig): Promise<boolean> {
    if (this.bots.has(config.botId)) {
      log.warn("Bot already registered", { botId: config.botId });
      await this.stopBot(config.botId);
    }

    try {
      const bridge = new TelegramBridge(this.wsBridge, config);
      const entry: BotEntry = { config, bridge, running: false };

      this.bots.set(config.botId, entry);

      await bridge.start();
      entry.running = true;

      // Load notificationGroupId from DB
      try {
        const db = getDb();
        const row = db
          .select({ notificationGroupId: telegramBots.notificationGroupId })
          .from(telegramBots)
          .where(eq(telegramBots.id, config.botId))
          .get();
        if (row?.notificationGroupId) {
          entry.notificationGroupId = row.notificationGroupId;
        }
      } catch {
        /* ignore — env-only bots won't have DB rows */
      }

      log.info("Bot started", { botId: config.botId, label: config.label, role: config.role });
      return true;
    } catch (err) {
      log.error("Failed to start bot", { botId: config.botId, error: String(err) });
      this.bots.delete(config.botId);
      return false;
    }
  }

  /**
   * Stop a bot by ID.
   */
  async stopBot(botId: string): Promise<void> {
    const entry = this.bots.get(botId);
    if (!entry) return;

    try {
      await entry.bridge.stop();
    } catch (err) {
      log.error("Error stopping bot", { botId, error: String(err) });
    }

    this.bots.delete(botId);
    log.info("Bot stopped", { botId });
  }

  /**
   * Stop all bots.
   */
  async stopAll(): Promise<void> {
    const ids = [...this.bots.keys()];
    for (const id of ids) {
      await this.stopBot(id);
    }
  }

  /**
   * Auto-start all enabled bots from database + env vars.
   */
  async autoStart(): Promise<void> {
    // 1. Load from environment variables (backward-compatible)
    const envToken = process.env.TELEGRAM_BOT_TOKEN;
    if (envToken) {
      const envChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const envUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      await this.startBot({
        token: envToken,
        botId: "bot1",
        label: process.env.TELEGRAM_BOT_LABEL ?? "Claude",
        role:
          (process.env.TELEGRAM_BOT_ROLE as
            | "claude"
            | "codex"
            | "gemini"
            | "opencode"
            | "general") ?? "claude",
        allowedChatIds: envChatIds,
        allowedUserIds: envUserIds,
      });
    }

    // 2. Load additional bots from database
    try {
      const db = getDb();
      const rows = db.select().from(telegramBots).all();

      for (const row of rows) {
        if (!row.enabled) continue;
        if (this.bots.has(row.id)) continue; // Skip if already started from env

        await this.startBot({
          token: decrypt(row.botToken),
          botId: row.id,
          label: row.label,
          role: row.role as "claude" | "codex" | "gemini" | "opencode" | "general",
          allowedChatIds: row.allowedChatIds ?? [],
          allowedUserIds: row.allowedUserIds ?? [],
        });
      }
    } catch (err) {
      log.error("Failed to load bots from DB", { error: String(err) });
    }

    log.info("Auto-start complete", { activeBots: this.bots.size });
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  getBridge(botId: string): TelegramBridge | undefined {
    return this.bots.get(botId)?.bridge;
  }

  getBridgeByRole(role: string): TelegramBridge | undefined {
    for (const entry of this.bots.values()) {
      if (entry.config.role === role && entry.running) {
        return entry.bridge;
      }
    }
    return undefined;
  }

  getPrimary(): TelegramBridge | undefined {
    return this.getBridge("bot1") ?? this.getBridgeByRole("claude");
  }

  getAll(): Array<{ botId: string; label: string; role: string; running: boolean }> {
    return [...this.bots.entries()].map(([id, entry]) => ({
      botId: id,
      label: entry.config.label,
      role: entry.config.role,
      running: entry.running,
    }));
  }

  // ── DB operations for bot management ──────────────────────────────────

  // ── Notifications ─────────────────────────────────────────────────

  /**
   * Send a notification to all bots with a configured notificationGroupId.
   * Called on session lifecycle events (complete, error, idle timeout).
   */
  async sendNotification(event: {
    type:
      | "session_complete"
      | "session_error"
      | "session_idle_timeout"
      | "account_captured"
      | "account_switched"
      | "account_rate_limited"
      | "account_all_limited";
    sessionId?: string;
    shortId?: string;
    projectSlug?: string;
    model?: string;
    costUsd?: number;
    turns?: number;
    reason?: string;
    durationMs?: number;
    accountLabel?: string;
    isNewAccount?: boolean;
  }): Promise<void> {
    const targets: Array<{ botToken: string; chatId: number; label: string }> = [];

    // Collect from running bots
    for (const [, entry] of this.bots) {
      if (entry.running && entry.notificationGroupId) {
        targets.push({
          botToken: entry.config.token,
          chatId: entry.notificationGroupId,
          label: entry.config.label,
        });
      }
    }

    if (targets.length === 0) return;

    const text = this.formatNotification(event);

    for (const target of targets) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${target.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: target.chatId,
            text,
            parse_mode: "HTML",
            disable_notification: event.type === "session_complete",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          log.error("Telegram notification rejected", {
            chatId: target.chatId,
            status: res.status,
            body,
          });
        }
      } catch (err) {
        log.error("Failed to send notification", {
          botLabel: target.label,
          chatId: target.chatId,
          error: String(err),
        });
      }
    }
  }

  private formatNotification(event: {
    type:
      | "session_complete"
      | "session_error"
      | "session_idle_timeout"
      | "account_captured"
      | "account_switched"
      | "account_rate_limited"
      | "account_all_limited";
    sessionId?: string;
    shortId?: string;
    projectSlug?: string;
    model?: string;
    costUsd?: number;
    turns?: number;
    reason?: string;
    durationMs?: number;
    accountLabel?: string;
    isNewAccount?: boolean;
  }): string {
    const name = escapeHTML(event.shortId ?? event.sessionId?.slice(0, 8) ?? "–");
    const project = event.projectSlug ? ` [${escapeHTML(event.projectSlug)}]` : "";
    const model = escapeHTML(event.model ?? "–");
    const cost = event.costUsd != null ? `$${event.costUsd.toFixed(4)}` : "–";
    const turns = event.turns ?? 0;
    const duration = event.durationMs ? `${Math.round(event.durationMs / 1000)}s` : "–";

    switch (event.type) {
      case "session_complete":
        return [
          `<b>Session Complete</b>${project}`,
          `<code>${name}</code> | ${model} | ${turns} turns`,
          `Cost: ${cost} | Duration: ${duration}`,
        ].join("\n");

      case "session_error":
        return [
          `<b>Session Error</b>${project}`,
          `<code>${name}</code> | ${model}`,
          event.reason ? `Reason: ${escapeHTML(event.reason.slice(0, 200))}` : "",
        ]
          .filter(Boolean)
          .join("\n");

      case "session_idle_timeout":
        return [
          `<b>Session Idle Timeout</b>${project}`,
          `<code>${name}</code> stopped after inactivity`,
          `${turns} turns | Cost: ${cost}`,
        ].join("\n");

      case "account_captured": {
        const label = escapeHTML(event.accountLabel ?? "Unknown");
        const verb = event.isNewAccount ? "captured" : "updated";
        return `📥 <b>Account ${verb}:</b> ${label}`;
      }

      case "account_switched": {
        const label = escapeHTML(event.accountLabel ?? "Unknown");
        return `🔄 <b>Switched to:</b> ${label}`;
      }

      case "account_rate_limited": {
        const label = escapeHTML(event.accountLabel ?? "Unknown");
        return `⚠️ <b>Rate limited:</b> ${label}\n${event.reason ? escapeHTML(event.reason.slice(0, 200)) : ""}`.trim();
      }

      case "account_all_limited":
        return `🚫 <b>All accounts rate-limited.</b> Wait for cooldown or add a new account.`;

      default:
        return `Session event: ${escapeHTML(String(event.type))} — ${name}`;
    }
  }

  /**
   * Update the notificationGroupId for a running bot (in-memory).
   */
  setNotificationGroupId(botId: string, groupId: number | null): void {
    const entry = this.bots.get(botId);
    if (entry) {
      entry.notificationGroupId = groupId ?? undefined;
    }
  }

  // ── DB operations for bot management ──────────────────────────────

  saveBotConfig(config: {
    id: string;
    label: string;
    role: string;
    botToken: string;
    allowedChatIds: number[];
    allowedUserIds: number[];
    enabled: boolean;
    notificationGroupId?: number | null;
  }): void {
    const db = getDb();

    const existing = db.select().from(telegramBots).where(eq(telegramBots.id, config.id)).get();

    if (existing) {
      db.update(telegramBots)
        .set({
          label: config.label,
          role: config.role,
          botToken: encrypt(config.botToken),
          allowedChatIds: config.allowedChatIds,
          allowedUserIds: config.allowedUserIds,
          enabled: config.enabled,
          notificationGroupId: config.notificationGroupId ?? null,
        })
        .where(eq(telegramBots.id, config.id))
        .run();
    } else {
      db.insert(telegramBots)
        .values({
          id: config.id,
          label: config.label,
          role: config.role,
          botToken: encrypt(config.botToken),
          allowedChatIds: config.allowedChatIds,
          allowedUserIds: config.allowedUserIds,
          enabled: config.enabled,
          notificationGroupId: config.notificationGroupId ?? null,
          createdAt: new Date(),
        })
        .run();
    }

    // Update in-memory if bot is running
    this.setNotificationGroupId(config.id, config.notificationGroupId ?? null);
  }

  deleteBotConfig(botId: string): void {
    const db = getDb();
    db.delete(telegramBots).where(eq(telegramBots.id, botId)).run();
  }

  listBotConfigs(): Array<{
    id: string;
    label: string;
    role: string;
    enabled: boolean;
    allowedChatIds: number[];
    allowedUserIds: number[];
    notificationGroupId: number | null;
  }> {
    const db = getDb();
    return db
      .select({
        id: telegramBots.id,
        label: telegramBots.label,
        role: telegramBots.role,
        enabled: telegramBots.enabled,
        allowedChatIds: telegramBots.allowedChatIds,
        allowedUserIds: telegramBots.allowedUserIds,
        notificationGroupId: telegramBots.notificationGroupId,
      })
      .from(telegramBots)
      .all();
  }
}
