/**
 * BotFactory — Creates configured grammY bot instances with plugins.
 */

import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { createLogger } from "../logger.js";

const log = createLogger("bot-factory");

export interface BotConfig {
  token: string;
  botId: string;
  label: string;
  role: "claude" | "codex" | "gemini" | "opencode" | "general";
  allowedChatIds: number[];
  allowedUserIds: number[];
}

/**
 * Create a fully configured grammY bot instance.
 */
export function createBot(config: BotConfig): Bot {
  const bot = new Bot(config.token);

  // ── Transformers (outgoing request middleware) ─────────────────────────

  // Rate limiting: 30 req/s global, 1 msg/s per chat
  bot.api.config.use(apiThrottler());

  // Auto-retry on 429 and network errors
  bot.api.config.use(
    autoRetry({
      maxRetryAttempts: 3,
      maxDelaySeconds: 10,
    }),
  );

  // ── Auth middleware: restrict to allowed chats + users ────────────────

  // Self-hosted: when no whitelist is configured, allow all (open access)
  const openAccess = config.allowedChatIds.length === 0 && config.allowedUserIds.length === 0;
  if (openAccess) {
    log.info("No allowedChatIds or allowedUserIds configured — bot accepts all messages (self-hosted mode). Restrict in Settings → Telegram if needed.", { botId: config.botId });
  }

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    // Self-hosted: no whitelist = allow all
    if (openAccess) {
      await next();
      return;
    }

    // Admin users can DM the bot directly (bypass chat ID check)
    const isAdmin = userId && config.allowedUserIds.includes(userId);

    // Check chat ID whitelist (admins bypass this for DMs)
    if (config.allowedChatIds.length > 0 && !config.allowedChatIds.includes(chatId) && !isAdmin) {
      log.warn("Unauthorized chat", { chatId, userId, botId: config.botId });
      return;
    }

    // Check user ID whitelist (admin restriction — only applies when explicitly configured)
    if (config.allowedUserIds.length > 0 && userId && !isAdmin) {
      log.warn("Unauthorized user", { chatId, userId, botId: config.botId });
      return;
    }

    await next();
  });

  // ── Error handler ─────────────────────────────────────────────────────

  bot.catch((err) => {
    log.error("Bot error", {
      botId: config.botId,
      error: String(err.error),
      ctx: err.ctx?.update?.update_id,
    });
  });

  log.info("Bot created", { botId: config.botId, label: config.label, role: config.role });
  return bot;
}

/**
 * Register bot commands with Telegram.
 */
export async function registerCommands(bot: Bot): Promise<void> {
  try {
    // Only register essential commands in the Telegram menu (~10).
    // All other commands remain functional — use /help to see the full list.
    await bot.api.setMyCommands([
      { command: "start", description: "Show projects & start session" },
      { command: "new", description: "New session with project" },
      { command: "stop", description: "Stop current session" },
      { command: "resume", description: "Resume last interrupted session" },
      { command: "allow", description: "Allow pending permission" },
      { command: "deny", description: "Deny pending permission" },
      { command: "status", description: "Show session status" },
      { command: "model", description: "Change AI model" },
      { command: "templates", description: "Browse session templates" },
      { command: "mood", description: "Agent pulse / health check" },
      { command: "help", description: "Show all commands" },
    ]);
    log.info("Commands registered");
  } catch (err) {
    log.error("Failed to register commands", { error: String(err) });
  }
}
