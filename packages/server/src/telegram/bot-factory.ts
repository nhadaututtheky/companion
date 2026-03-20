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
  role: "claude" | "anti" | "general";
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
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 3,
    maxDelaySeconds: 10,
  }));

  // ── Auth middleware: restrict to allowed chats + users ────────────────

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    // Check chat ID whitelist
    if (config.allowedChatIds.length > 0 && !config.allowedChatIds.includes(chatId)) {
      log.warn("Unauthorized chat", { chatId, userId, botId: config.botId });
      return;
    }

    // Check user ID whitelist (admin restriction)
    if (config.allowedUserIds.length > 0 && userId && !config.allowedUserIds.includes(userId)) {
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
    await bot.api.setMyCommands([
      { command: "start", description: "Show projects & start session" },
      { command: "new", description: "New session with project" },
      { command: "stop", description: "Stop current session" },
      { command: "status", description: "Show session status" },
      { command: "cost", description: "Show session cost" },
      { command: "model", description: "Change AI model" },
      { command: "help", description: "Show all commands" },
      { command: "projects", description: "List all projects" },
      { command: "exitplan", description: "Force exit plan mode" },
      { command: "allow", description: "Allow pending permission" },
      { command: "deny", description: "Deny pending permission" },
      { command: "autoapprove", description: "Toggle auto-approve" },
      { command: "debate", description: "Start a debate session" },
      { command: "compact", description: "Compact context window" },
      { command: "todo", description: "Show Claude's task list" },
      { command: "files", description: "Show modified files" },
      { command: "history", description: "Recent session history" },
      { command: "usage", description: "Cost & usage summary" },
      { command: "btw", description: "Inject context to Claude (no reply)" },
      { command: "file", description: "Read a file and show content" },
      { command: "cat", description: "Alias for /file" },
      { command: "send", description: "Send a file as document attachment" },
      { command: "skill", description: "List or invoke a skill" },
      { command: "note", description: "Save a note for this session" },
      { command: "notes", description: "Show all notes for this session" },
      { command: "pin", description: "Pin settings panel to chat" },
      { command: "templates", description: "Browse session templates" },
      { command: "template", description: "Save or delete a template" },
      { command: "stream", description: "Attach to an existing session" },
      { command: "detach", description: "Detach from streamed session" },
      { command: "resume", description: "Resume last interrupted session" },
    ]);
    log.info("Commands registered");
  } catch (err) {
    log.error("Failed to register commands", { error: String(err) });
  }
}
