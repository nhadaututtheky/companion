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

const log = createLogger("bot-registry");

interface BotEntry {
  config: BotConfig;
  bridge: TelegramBridge;
  running: boolean;
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
        role: (process.env.TELEGRAM_BOT_ROLE as "claude" | "anti" | "general") ?? "claude",
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
          token: row.botToken,
          botId: row.id,
          label: row.label,
          role: row.role as "claude" | "anti" | "general",
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

  saveBotConfig(config: {
    id: string;
    label: string;
    role: string;
    botToken: string;
    allowedChatIds: number[];
    allowedUserIds: number[];
    enabled: boolean;
  }): void {
    const db = getDb();

    const existing = db.select().from(telegramBots).where(eq(telegramBots.id, config.id)).get();

    if (existing) {
      db.update(telegramBots)
        .set({
          label: config.label,
          role: config.role,
          botToken: config.botToken,
          allowedChatIds: config.allowedChatIds,
          allowedUserIds: config.allowedUserIds,
          enabled: config.enabled,
        })
        .where(eq(telegramBots.id, config.id))
        .run();
    } else {
      db.insert(telegramBots)
        .values({
          id: config.id,
          label: config.label,
          role: config.role,
          botToken: config.botToken,
          allowedChatIds: config.allowedChatIds,
          allowedUserIds: config.allowedUserIds,
          enabled: config.enabled,
          createdAt: new Date(),
        })
        .run();
    }
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
  }> {
    const db = getDb();
    return db.select({
      id: telegramBots.id,
      label: telegramBots.label,
      role: telegramBots.role,
      enabled: telegramBots.enabled,
      allowedChatIds: telegramBots.allowedChatIds,
      allowedUserIds: telegramBots.allowedUserIds,
    }).from(telegramBots).all();
  }
}
