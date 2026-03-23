/**
 * Session commands: /start, /new, /stop, /resume, /projects
 */

import { InlineKeyboard } from "grammy";
import { listProjects, getProject } from "../../services/project-profiles.js";
import { escapeHTML } from "../formatter.js";
import { createLogger } from "../../logger.js";
import type { TelegramBridge } from "../telegram-bridge.js";
import { findDeadSessionForChat } from "../../services/session-store.js";

const log = createLogger("cmd:session");

export function registerSessionCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /start — Show projects list ─────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const projects = listProjects();

    if (projects.length === 0) {
      await ctx.reply(
        "👋 <b>Welcome to Companion!</b>\n\nNo projects configured yet. Add a project via the web UI or API.\n\nOr start a quick session:",
        { parse_mode: "HTML", reply_markup: {
          inline_keyboard: [[
            { text: "⚡ Quick Session", callback_data: "quick:session", style: "primary" as const },
          ]],
        }},
      );
      return;
    }

    // Build 2-column grid of projects
    type Btn = { text: string; callback_data: string };
    const rows: Btn[][] = [];
    for (let i = 0; i < projects.length; i += 2) {
      const row: Btn[] = [{ text: `📂 ${projects[i]!.name}`, callback_data: `project:${projects[i]!.slug}` }];
      if (i + 1 < projects.length) {
        row.push({ text: `📂 ${projects[i + 1]!.name}`, callback_data: `project:${projects[i + 1]!.slug}` });
      }
      rows.push(row);
    }
    // Quick session at bottom
    rows.push([{ text: "⚡ Quick Session (no project)", callback_data: "quick:session" }]);

    await ctx.reply(
      "No active session. Select a project to connect:",
      { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } },
    );
  });

  // ── /projects — List all projects ───────────────────────────────────────

  bot.command("projects", async (ctx) => {
    const projects = listProjects();

    if (projects.length === 0) {
      await ctx.reply("No projects configured.");
      return;
    }

    const lines = projects.map(
      (p) => `📂 <b>${escapeHTML(p.name)}</b> (<code>${escapeHTML(p.slug)}</code>)\n   ${escapeHTML(p.dir)}`,
    );

    await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });
  });

  // ── /new [project] — New session ────────────────────────────────────────

  bot.command("new", async (ctx) => {
    const args = ctx.match?.trim();

    if (!args) {
      // Show project selection
      const projects = listProjects();
      if (projects.length === 0) {
        await ctx.reply("No projects configured.");
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const p of projects) {
        keyboard.text(`📂 ${p.name}`, `new:${p.slug}`).row();
      }

      await ctx.reply("Select a project for new session:", {
        reply_markup: keyboard,
      });
      return;
    }

    // Start session for specified project
    await bridge.startSessionForChat(ctx, args);
  });

  // ── /stop — Stop current session ────────────────────────────────────────

  bot.command("stop", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);

    if (!mapping) {
      await ctx.reply("No active session in this chat.");
      return;
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Stop", `stop:confirm:${mapping.sessionId}`)
      .text("❌ Cancel", "stop:cancel");

    await ctx.reply(
      `Stop session <code>${mapping.sessionId.slice(0, 8)}</code>?`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  // ── /resume — Resume last dead session ─────────────────────────────────

  bot.command("resume", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;

    // If there's already an active session, just inform the user
    const mapping = bridge.getMapping(chatId, topicId);
    if (mapping && bridge.wsBridge.getSession(mapping.sessionId)) {
      await ctx.reply("Session is already active.");
      return;
    }

    // Show project list to choose which session to resume
    const projects = listProjects();
    if (projects.length === 0) {
      await ctx.reply("No projects configured.");
      return;
    }

    if (projects.length === 1) {
      const slug = projects[0]!.slug;
      const dead = findDeadSessionForChat({ chatId, projectSlug: slug });
      if (dead) {
        const project = getProject(slug);
        const keyboard = {
          inline_keyboard: [[
            { text: "Resume Session", callback_data: `resume:${slug}:${chatId}`, style: "success" as const },
            { text: "Start Fresh", callback_data: `fresh:${slug}:${chatId}`, style: "primary" as const },
          ]],
        };
        await ctx.reply(
          `Found a previous <b>${escapeHTML(project?.name ?? slug)}</b> session that was interrupted.\nResume to continue where you left off, or start fresh.`,
          { parse_mode: "HTML", reply_markup: keyboard as unknown as import("grammy").InlineKeyboard },
        );
      } else {
        await ctx.reply("No resumable session found. Use /new to start fresh.");
      }
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const p of projects) {
      const dead = findDeadSessionForChat({ chatId, projectSlug: p.slug });
      const label = dead ? `↩ ${p.name}` : `📂 ${p.name} (new)`;
      keyboard.text(label, dead ? `resume:${p.slug}:${chatId}` : `new:${p.slug}`).row();
    }

    await ctx.reply("Select a project to resume or start:", { reply_markup: keyboard });
  });

  // ── /fork — Fork current session (keep old alive) ──────────────────────

  bot.command("fork", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);

    if (!mapping) {
      await ctx.reply("No active session to fork.");
      return;
    }

    const project = getProject(mapping.projectSlug);
    if (!project) {
      await ctx.reply("Project not found.");
      return;
    }

    const oldSessionId = mapping.sessionId;

    try {
      const newSessionId = await bridge.wsBridge.startSession({
        projectSlug: project.slug,
        cwd: project.dir,
        model: mapping.model,
        permissionMode: project.permissionMode,
        source: "telegram",
      });

      // Update mapping to new session (old session keeps running)
      bridge.setMapping(chatId, topicId, {
        sessionId: newSessionId,
        projectSlug: project.slug,
        model: mapping.model,
      });
      bridge.subscribeToSession(newSessionId, chatId, topicId);

      log.info("Session forked", { chatId, oldSessionId, newSessionId, projectSlug: project.slug });

      await ctx.reply(
        `🔀 <b>Session forked</b>\n` +
        `Old: <code>${escapeHTML(oldSessionId.slice(0, 8))}</code> (still running)\n` +
        `New: <code>${escapeHTML(newSessionId.slice(0, 8))}</code>\n\n` +
        `Use <code>/stream ${escapeHTML(oldSessionId.slice(0, 8))}</code> to watch the old session.`,
        { parse_mode: "HTML" },
      );
    } catch {
      await ctx.reply("Failed to fork session.");
    }
  });

  // ── Callback queries for session commands ───────────────────────────────

  bot.callbackQuery(/^project:(.+)$/, async (ctx) => {
    const slug = ctx.match[1]!;
    await ctx.answerCallbackQuery();

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    // Check for a dead/interrupted session for this project
    const dead = findDeadSessionForChat({ chatId, projectSlug: slug });
    if (dead) {
      const project = getProject(slug);
      const keyboard = {
        inline_keyboard: [[
          { text: "Resume Session", callback_data: `resume:${slug}:${chatId}`, style: "success" as const },
          { text: "Start Fresh", callback_data: `fresh:${slug}:${chatId}`, style: "primary" as const },
        ]],
      };

      await ctx.editMessageText(
        `Found a previous <b>${escapeHTML(project?.name ?? slug)}</b> session that was interrupted.\nResume to continue where you left off, or start fresh.`,
        { parse_mode: "HTML", reply_markup: keyboard as unknown as import("grammy").InlineKeyboard },
      ).catch(() => {
        ctx.reply(
          `Found a previous <b>${escapeHTML(project?.name ?? slug)}</b> session that was interrupted.\nResume to continue where you left off, or start fresh.`,
          { parse_mode: "HTML", reply_markup: keyboard },
        );
      });
      return;
    }

    await bridge.startSessionForChat(ctx, slug);
  });

  bot.callbackQuery(/^new:(.+)$/, async (ctx) => {
    const slug = ctx.match[1]!;
    await ctx.answerCallbackQuery();
    await bridge.startSessionForChat(ctx, slug);
  });

  bot.callbackQuery(/^stop:confirm:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Session stopped");
    bridge.killSession(sessionId);
    await ctx.editMessageText("Session stopped.");
  });

  bot.callbackQuery("stop:cancel", async (ctx) => {
    await ctx.answerCallbackQuery("Cancelled");
    await ctx.editMessageText("Stop cancelled.");
  });

  // ── Quick Session (no project) ──────────────────────────────────────────

  bot.callbackQuery("quick:session", async (ctx) => {
    await ctx.answerCallbackQuery("Starting quick session...");
    await ctx.editMessageText("⚡ Starting quick session...").catch(() => {});

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })?.message_thread_id;

    // Use home directory as CWD
    const os = await import("os");
    const homeDir = os.homedir();

    try {
      const sessionId = await bridge.wsBridge.startSession({
        cwd: homeDir,
        model: "claude-sonnet-4-6",
        permissionMode: "default",
        source: "telegram",
      });

      bridge.setMapping(chatId, topicId, {
        sessionId,
        projectSlug: "quick",
        model: "claude-sonnet-4-6",
      });
      bridge.subscribeToSession(sessionId, chatId, topicId);

      const panelMsg = await bridge.sendSettingsPanel(chatId, topicId, sessionId, "Quick Session", "claude-sonnet-4-6");
      if (panelMsg) {
        bridge.setSessionPanelMessageId(sessionId, panelMsg.message_id);
      }

      log.info("Quick session started", { chatId, sessionId });
    } catch (err) {
      await ctx.editMessageText(`Failed: ${String(err)}`).catch(() => {});
    }
  });
}
