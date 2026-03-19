/**
 * Info commands: /status, /cost, /files, /help, /model
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  escapeHTML,
  formatCost,
  formatTokens,
  formatDuration,
  formatSessionStatus,
} from "../formatter.js";
import { createLogger } from "../../logger.js";
import type { TelegramBridge } from "../telegram-bridge.js";

const log = createLogger("cmd:info");

export function registerInfoCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /status — Session status ──────────────────────────────────────────

  bot.command("status", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session. Use /start to begin.");
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session ended. Use /new to start a new one.");
      return;
    }

    const html = formatSessionStatus({
      model: session.state.model,
      status: session.state.status,
      numTurns: session.state.num_turns,
      totalCost: session.state.total_cost_usd,
      inputTokens: session.state.total_input_tokens,
      outputTokens: session.state.total_output_tokens,
      filesModified: session.state.files_modified,
      linesAdded: session.state.total_lines_added,
      linesRemoved: session.state.total_lines_removed,
    });

    await ctx.reply(html, { parse_mode: "HTML" });
  });

  // ── /cost — Show cost breakdown ───────────────────────────────────────

  bot.command("cost", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session ended.");
      return;
    }

    const s = session.state;
    const lines = [
      `💰 <b>Cost Report</b>`,
      `Total: ${formatCost(s.total_cost_usd)}`,
      `Turns: <code>${s.num_turns}</code>`,
      `Input: ${formatTokens(s.total_input_tokens)}`,
      `Output: ${formatTokens(s.total_output_tokens)}`,
      `Cache Create: ${formatTokens(s.cache_creation_tokens)}`,
      `Cache Read: ${formatTokens(s.cache_read_tokens)}`,
      `Duration: ${formatDuration(Date.now() - s.started_at)}`,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ── /files — Show modified files ──────────────────────────────────────

  bot.command("files", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session ended.");
      return;
    }

    const s = session.state;
    const sections: string[] = [];

    if (s.files_created.length > 0) {
      sections.push(`🟢 <b>Created (${s.files_created.length})</b>\n` +
        s.files_created.map((f) => `  <code>${escapeHTML(f)}</code>`).join("\n"));
    }
    if (s.files_modified.length > 0) {
      sections.push(`🟡 <b>Modified (${s.files_modified.length})</b>\n` +
        s.files_modified.map((f) => `  <code>${escapeHTML(f)}</code>`).join("\n"));
    }
    if (s.files_read.length > 0) {
      sections.push(`🔵 <b>Read (${s.files_read.length})</b>\n` +
        s.files_read.slice(-10).map((f) => `  <code>${escapeHTML(f)}</code>`).join("\n") +
        (s.files_read.length > 10 ? `\n  <i>... and ${s.files_read.length - 10} more</i>` : ""));
    }

    if (sections.length === 0) {
      await ctx.reply("No file activity yet.");
      return;
    }

    await ctx.reply(sections.join("\n\n"), { parse_mode: "HTML" });
  });

  // ── /model [name] — Change model ──────────────────────────────────────

  bot.command("model", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const args = ctx.match?.trim();

    if (args) {
      // Direct model set
      bridge.wsBridge.handleBrowserMessage(mapping.sessionId, JSON.stringify({
        type: "set_model",
        model: args,
      }));
      await ctx.reply(`Model set to <code>${escapeHTML(args)}</code>`, { parse_mode: "HTML" });
      return;
    }

    // Show model selection keyboard
    const keyboard = new InlineKeyboard()
      .text("⚡ Haiku 4.5", `model:${mapping.sessionId}:haiku`)
      .text("🎯 Sonnet 4.6", `model:${mapping.sessionId}:sonnet`)
      .row()
      .text("🧠 Opus 4.6", `model:${mapping.sessionId}:opus`);

    await ctx.reply("Select model:", { reply_markup: keyboard });
  });

  // ── /help — Show all commands ─────────────────────────────────────────

  bot.command("help", async (ctx) => {
    const helpText = [
      "<b>📖 Companion Commands</b>",
      "",
      "<b>Session</b>",
      "/start — Show projects",
      "/new [project] — New session",
      "/stop — Stop session",
      "/resume — Resume session",
      "/projects — List projects",
      "",
      "<b>Control</b>",
      "/allow — Allow permission",
      "/deny — Deny permission",
      "/exitplan — Force exit plan mode",
      "/cancel — Interrupt Claude",
      "/compact — Compact context",
      "",
      "<b>Info</b>",
      "/status — Session status",
      "/cost — Cost breakdown",
      "/files — Modified files",
      "/model [name] — Change model",
      "",
      "<b>Config</b>",
      "/autoapprove — Toggle auto-approve",
      "",
      "<b>Agent</b>",
      "/debate [topic] — Start debate",
      "",
      "<i>Or just type a message to chat with Claude!</i>",
    ].join("\n");

    await ctx.reply(helpText, { parse_mode: "HTML" });
  });

  // ── Model selection callback ──────────────────────────────────────────

  bot.callbackQuery(/^model:(.+):(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const model = ctx.match[2]!;

    bridge.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({
      type: "set_model",
      model,
    }));

    await ctx.answerCallbackQuery(`Model: ${model}`);
    await ctx.editMessageText(`Model set to <code>${escapeHTML(model)}</code>`, {
      parse_mode: "HTML",
    });
  });
}
