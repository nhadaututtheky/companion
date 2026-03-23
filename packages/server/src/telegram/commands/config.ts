/**
 * Config commands: /autoapprove, /debate
 */

import { InlineKeyboard } from "grammy";
import { escapeHTML } from "../formatter.js";
import type { TelegramBridge } from "../telegram-bridge.js";
import {
  startDebate,
  concludeDebate,
  getActiveDebate,
  type DebateFormat,
  type DebateAgent,
} from "../../services/debate-engine.js";

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

  // ── /debate [format] [topic] — Start a structured debate ──────────────

  bot.command("debate", async (ctx) => {
    const raw = ctx.match?.trim() ?? "";
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;

    if (!raw) {
      await ctx.reply(
        [
          `🎭 <b>Debate Mode</b>`,
          ``,
          `Usage:`,
          `<code>/debate Should we use Redis or SQLite?</code>`,
          `<code>/debate review Our auth middleware design</code>`,
          `<code>/debate redteam Payment API security</code>`,
          `<code>/debate brainstorm New feature ideas</code>`,
          ``,
          `Formats: <b>pro_con</b> (default), <b>review</b>, <b>redteam</b>, <b>brainstorm</b>`,
        ].join("\n"),
        { parse_mode: "HTML" },
      );
      return;
    }

    // Parse format + topic
    const formatMap: Record<string, DebateFormat> = {
      review: "review",
      redteam: "red_team",
      "red-team": "red_team",
      brainstorm: "brainstorm",
    };

    let format: DebateFormat = "pro_con";
    let topic = raw;

    const firstWord = raw.split(" ")[0]?.toLowerCase() ?? "";
    if (formatMap[firstWord]) {
      format = formatMap[firstWord]!;
      topic = raw.slice(firstWord.length).trim();
    }

    if (!topic) {
      await ctx.reply("Please provide a topic after the format.");
      return;
    }

    // Check if there's already an active debate in this chat
    // (we track by channel, not chat — allow multiple)

    await ctx.reply(
      [
        `🎭 <b>Starting Debate</b>`,
        ``,
        `📋 Topic: <i>${escapeHTML(topic)}</i>`,
        `🎯 Format: <b>${format.replace("_", " ")}</b>`,
        `🔄 Max 5 rounds | 💰 Max $0.50`,
        ``,
        `<i>Agents are thinking...</i>`,
      ].join("\n"),
      { parse_mode: "HTML", message_thread_id: topicId },
    );

    try {
      const state = await startDebate(
        { topic, format },
        // onMessage callback — route to Telegram
        async (channelId: string, agent: DebateAgent, content: string, round: number) => {
          const label = `${agent.emoji} <b>${escapeHTML(agent.label)}</b> <i>(Round ${round})</i>`;
          const text = `${label}\n\n${escapeHTML(content)}`;

          // Split if too long (Telegram 4096 limit)
          if (text.length <= 4000) {
            await bridge.bot.api.sendMessage(chatId, text, {
              parse_mode: "HTML",
              message_thread_id: topicId,
            }).catch(() => {});
          } else {
            // Send label first, then content
            await bridge.bot.api.sendMessage(chatId, label, {
              parse_mode: "HTML",
              message_thread_id: topicId,
            }).catch(() => {});
            await bridge.bot.api.sendMessage(chatId, escapeHTML(content), {
              message_thread_id: topicId,
            }).catch(() => {});
          }
        },
      );

      // Store debate channelId for /verdict command
      bridge.setActiveDebate(chatId, topicId, state.channelId);
    } catch (err) {
      await ctx.reply(`❌ Failed to start debate: ${escapeHTML(String(err))}`, {
        parse_mode: "HTML",
        message_thread_id: topicId,
      });
    }
  });

  // ── /verdict — Force conclude active debate ─────────────────────────────

  bot.command("verdict", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;

    const channelId = bridge.getActiveDebateChannel(chatId, topicId);
    if (!channelId) {
      await ctx.reply("No active debate in this chat. Start one with /debate.", {
        message_thread_id: topicId,
      });
      return;
    }

    const debate = getActiveDebate(channelId);
    if (!debate || debate.status !== "active") {
      await ctx.reply("Debate is not active (may have already concluded).", {
        message_thread_id: topicId,
      });
      bridge.clearActiveDebate(chatId, topicId);
      return;
    }

    await ctx.reply("⚖️ Forcing verdict...", { message_thread_id: topicId });

    await concludeDebate(channelId, async (_cId, agent, content, _round) => {
      const label = `${agent.emoji} <b>${escapeHTML(agent.label)}</b>`;
      await bridge.bot.api.sendMessage(chatId, `${label}\n\n${escapeHTML(content)}`, {
        parse_mode: "HTML",
        message_thread_id: topicId,
      }).catch(() => {});
    });

    bridge.clearActiveDebate(chatId, topicId);
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
