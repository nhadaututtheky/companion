/**
 * Config commands: /autoapprove, /debate
 */

import { InlineKeyboard } from "grammy";
import { escapeHTML } from "../formatter.js";
import type { TelegramBridge } from "../telegram-bridge.js";

export function registerConfigCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /autoapprove [on|off|seconds] — Toggle auto-approve ──────────────

  bot.command("autoapprove", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session not found.");
      return;
    }

    const args = ctx.match?.trim().toLowerCase();

    if (args === "off" || args === "0") {
      session.autoApproveConfig = { enabled: false, timeoutSeconds: 0, allowBash: false };
      await ctx.reply("Auto-approve <b>disabled</b>", { parse_mode: "HTML" });
      return;
    }

    if (args === "on") {
      session.autoApproveConfig = { enabled: true, timeoutSeconds: 30, allowBash: false };
      await ctx.reply("Auto-approve <b>enabled</b> (30s timeout, Bash excluded)", { parse_mode: "HTML" });
      return;
    }

    const seconds = parseInt(args ?? "", 10);
    if (seconds > 0) {
      session.autoApproveConfig = { enabled: true, timeoutSeconds: seconds, allowBash: false };
      await ctx.reply(`Auto-approve <b>enabled</b> (${seconds}s timeout)`, { parse_mode: "HTML" });
      return;
    }

    // Show current status + toggle keyboard
    const config = session.autoApproveConfig;
    const status = config.enabled
      ? `Enabled (${config.timeoutSeconds}s, bash=${config.allowBash ? "yes" : "no"})`
      : "Disabled";

    const keyboard = new InlineKeyboard()
      .text(config.enabled ? "🔴 Disable" : "🟢 Enable (30s)", `aa:toggle:${mapping.sessionId}`)
      .text("⚡ 10s", `aa:set:${mapping.sessionId}:10`)
      .text("⏱️ 60s", `aa:set:${mapping.sessionId}:60`);

    await ctx.reply(`Auto-approve: <b>${status}</b>`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // ── /debate [topic] — Start debate (prepare for Phase 5) ──────────────

  bot.command("debate", async (ctx) => {
    const topic = ctx.match?.trim();

    if (!topic) {
      await ctx.reply(
        "Usage: <code>/debate Should we use microservices or monolith?</code>",
        { parse_mode: "HTML" },
      );
      return;
    }

    // Placeholder for Phase 5 — show what will happen
    await ctx.reply(
      [
        `🎭 <b>Debate Mode</b>`,
        `Topic: <i>${escapeHTML(topic)}</i>`,
        ``,
        `<i>Debate Mode will be available in Phase 5.</i>`,
        `<i>It will spawn multiple Claude instances to debate this topic.</i>`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  // ── Auto-approve callbacks ────────────────────────────────────────────

  bot.callbackQuery(/^aa:toggle:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found");
      return;
    }

    const newEnabled = !session.autoApproveConfig.enabled;
    session.autoApproveConfig = {
      enabled: newEnabled,
      timeoutSeconds: newEnabled ? 30 : 0,
      allowBash: false,
    };

    await ctx.answerCallbackQuery(newEnabled ? "Enabled" : "Disabled");
    await ctx.editMessageText(
      `Auto-approve: <b>${newEnabled ? "Enabled (30s)" : "Disabled"}</b>`,
      { parse_mode: "HTML" },
    );
  });

  bot.callbackQuery(/^aa:set:(.+):(\d+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const seconds = parseInt(ctx.match[2]!, 10);
    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found");
      return;
    }

    session.autoApproveConfig = { enabled: true, timeoutSeconds: seconds, allowBash: false };
    await ctx.answerCallbackQuery(`Set to ${seconds}s`);
    await ctx.editMessageText(
      `Auto-approve: <b>Enabled (${seconds}s)</b>`,
      { parse_mode: "HTML" },
    );
  });
}
