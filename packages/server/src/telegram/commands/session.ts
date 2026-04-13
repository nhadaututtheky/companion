/**
 * Session commands: /start, /new, /stop, /resume, /projects, /sessions
 */

import { InlineKeyboard } from "grammy";
import { listProjects, getProject } from "../../services/project-profiles.js";
import { getAllActiveSessions, listResumableSessions } from "../../services/session-store.js";
import { escapeHTML } from "../formatter.js";
import { createLogger } from "../../logger.js";
import type { TelegramBridge } from "../telegram-bridge.js";
import { DEFAULT_MODEL } from "@companion/shared";

const log = createLogger("cmd:session");

export function registerSessionCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /start — Show projects list ─────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const projects = listProjects();

    if (projects.length === 0) {
      // First-time user: no projects configured yet — show detailed setup guide
      await ctx.reply(
        [
          "👋 <b>Welcome to Companion!</b>",
          "",
          "Looks like this is your first time. Let's get you set up.",
          "",
          "📋 <b>Setup checklist:</b>",
          "",
          "1️⃣ <b>Install Claude CLI</b>",
          "   <code>npm install -g @anthropic-ai/claude-code</code>",
          "",
          "2️⃣ <b>Configure a project directory</b>",
          "   Open the web UI and go to <b>Settings → Projects</b>",
          "   Map a local folder (e.g. <code>/workspace</code>) to a project slug.",
          "",
          "   Using Docker? Mount your directory:",
          "   <code>volumes:\n  - /path/to/code:/workspace</code>",
          "",
          "3️⃣ <b>Start a session</b>",
          "   Use /new once projects are configured.",
          "",
          "⚡ <b>Or start a quick session right now</b> (no project needed).",
          "",
          "<b>Key commands:</b>",
          "/new — Start a new session",
          "/stop — Stop current session",
          "/allow · /deny — Handle permissions",
          "/status — Session info",
          "/model — Switch AI model",
          "/help — Full command list",
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "⚡ Quick Session", callback_data: "quick:session" }]],
          },
        },
      );
      return;
    }

    // Check if any sessions have ever been created
    const hasSessions = getAllActiveSessions().length > 0;

    if (!hasSessions) {
      // Projects exist but no sessions yet — "ready to go" message
      const keyboard = new InlineKeyboard();
      for (let i = 0; i < projects.length; i += 2) {
        keyboard.text(`📂 ${projects[i]!.name}`, `project:${projects[i]!.slug}`);
        if (i + 1 < projects.length) {
          keyboard.text(`📂 ${projects[i + 1]!.name}`, `project:${projects[i + 1]!.slug}`);
        }
        keyboard.row();
      }
      keyboard.text("⚡ Quick Session (no project)", "quick:session").row();

      await ctx.reply(
        [
          "🚀 <b>Ready to go!</b>",
          "",
          `${projects.length} project(s) configured. Use /new to start your first Claude session.`,
          "",
          "Select a project below, or launch a quick session:",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: keyboard },
      );
      return;
    }

    // Regular flow: projects + sessions exist — show project picker
    type Btn = { text: string; callback_data: string };
    const rows: Btn[][] = [];
    for (let i = 0; i < projects.length; i += 2) {
      const row: Btn[] = [
        { text: `📂 ${projects[i]!.name}`, callback_data: `project:${projects[i]!.slug}` },
      ];
      if (i + 1 < projects.length) {
        row.push({
          text: `📂 ${projects[i + 1]!.name}`,
          callback_data: `project:${projects[i + 1]!.slug}`,
        });
      }
      rows.push(row);
    }
    // Quick session at bottom
    rows.push([{ text: "⚡ Quick Session (no project)", callback_data: "quick:session" }]);

    await ctx.reply(
      [
        "👋 <b>Companion</b> — Select a project to start:",
        "",
        "<b>Quick commands:</b>",
        "/new — Start a session  ·  /stop — Stop",
        "/allow · /deny — Permissions  ·  /status — Info",
        "/model — Switch model  ·  /help — All commands",
      ].join("\n"),
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
      (p) =>
        `📂 <b>${escapeHTML(p.name)}</b> (<code>${escapeHTML(p.slug)}</code>)\n   ${escapeHTML(p.dir)}`,
    );

    await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML" });
  });

  // ── /sessions — List all active sessions with #shortIds ────────────────

  bot.command("sessions", async (ctx) => {
    const sessions = getAllActiveSessions();

    if (sessions.length === 0) {
      await ctx.reply("No active sessions.");
      return;
    }

    const lines = sessions.map((s) => {
      const shortId = s.state.short_id;
      const tag = shortId ? `<code>#${escapeHTML(shortId)}</code>` : "—";
      const cwd = s.state.cwd ?? "";
      const project = cwd.split(/[\\/]/).pop() || "quick";
      const model = s.state.model?.replace("claude-", "").replace(/-\d+$/, "") ?? "?";
      const label = s.state.name
        ? `<b>${escapeHTML(s.state.name)}</b>`
        : `📂 ${escapeHTML(project)}`;
      return `${tag}  ${label}  · ${model}`;
    });

    await ctx.reply([`🗂 <b>Active Sessions</b> (${sessions.length})`, "", ...lines].join("\n"), {
      parse_mode: "HTML",
    });
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

    await ctx.reply(`Stop session <code>${mapping.sessionId.slice(0, 8)}</code>?`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // ── /resume — Resume last dead session ─────────────────────────────────

  bot.command("resume", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;
    const searchQuery = ctx.match?.trim() || undefined;

    // If there's already an active session, just inform the user
    const mapping = bridge.getMapping(chatId, topicId);
    if (mapping && bridge.wsBridge.getSession(mapping.sessionId)) {
      await ctx.reply("Session is already active.");
      return;
    }

    // If search query provided, search all resumable sessions
    if (searchQuery) {
      const results = listResumableSessions({ search: searchQuery, limit: 10 });
      if (results.length === 0) {
        await ctx.reply(`No resumable sessions matching "<b>${escapeHTML(searchQuery)}</b>".`, {
          parse_mode: "HTML",
        });
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const s of results) {
        const label = s.name || s.projectSlug || "quick";
        const model = s.model?.replace("claude-", "").replace(/-\d+$/, "") ?? "";
        const ago = Math.round((Date.now() - s.endedAt) / 60000);
        const agoText = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
        keyboard.text(`↩ ${label} · ${model} · ${agoText}`, `resume_id:${s.id}`).row();
      }

      await ctx.reply(
        `🔍 Found <b>${results.length}</b> resumable session(s) matching "<b>${escapeHTML(searchQuery)}</b>":`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
      return;
    }

    // No search — show all resumable sessions (up to 10)
    const resumable = listResumableSessions({ limit: 10 });
    if (resumable.length > 0) {
      const keyboard = new InlineKeyboard();
      for (const s of resumable) {
        const label = s.name || s.projectSlug || "quick";
        const model = s.model?.replace("claude-", "").replace(/-\d+$/, "") ?? "";
        const ago = Math.round((Date.now() - s.endedAt) / 60000);
        const agoText = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
        keyboard.text(`↩ ${label} · ${model} · ${agoText}`, `resume_id:${s.id}`).row();
      }
      keyboard.text("🆕 Start Fresh", "quick:session").row();

      await ctx.reply(`↩ <b>Resumable Sessions</b> (${resumable.length})`, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    }

    // Fallback to project-based resume (original flow)
    const projects = listProjects();
    if (projects.length === 0) {
      await ctx.reply("No resumable sessions or projects found. Use /new to start.");
      return;
    }

    if (projects.length === 1) {
      const slug = projects[0]!.slug;
      const dead = bridge.getDeadSessionByProject(chatId, slug);
      if (dead) {
        const project = getProject(slug);
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "Resume Session",
                callback_data: `resume:${slug}:${chatId}`,
                style: "success" as const,
              },
              {
                text: "Start Fresh",
                callback_data: `fresh:${slug}:${chatId}`,
                style: "primary" as const,
              },
            ],
          ],
        };
        await ctx.reply(
          `Found a previous <b>${escapeHTML(project?.name ?? slug)}</b> session that was interrupted.\nResume to continue where you left off, or start fresh.`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
          },
        );
      } else {
        await ctx.reply("No resumable session found. Use /new to start fresh.");
      }
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const p of projects) {
      const dead = bridge.getDeadSessionByProject(chatId, p.slug);
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

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;

    // Check if there's already an active session for this chat
    const existingMapping = bridge.getMapping(chatId, topicId);
    if (existingMapping) {
      const activeSession = bridge.wsBridge.getSession(existingMapping.sessionId);
      if (activeSession) {
        // Session is alive — ask user what to do
        const keyboard = {
          inline_keyboard: [
            [
              { text: "Keep Current", callback_data: `keep:${existingMapping.sessionId}` },
              { text: "Restart", callback_data: `restart:${slug}:${chatId}` },
            ],
          ],
        };
        const project = getProject(existingMapping.projectSlug);
        await ctx
          .editMessageText(
            `<b>${escapeHTML(project?.name ?? existingMapping.projectSlug)}</b> is already running.\nKeep current session or restart?`,
            {
              parse_mode: "HTML",
              reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
            },
          )
          .catch(() => {});
        return;
      }
      // Session mapping exists but CLI died — clean up stale mapping
      bridge.removeMapping(chatId, topicId);
    }

    // Check for a dead/interrupted session for this project
    const dead = bridge.getDeadSessionByProject(chatId, slug);
    if (dead) {
      const project = getProject(slug);
      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "Resume Session",
              callback_data: `resume:${slug}:${chatId}`,
              style: "success" as const,
            },
            {
              text: "Start Fresh",
              callback_data: `fresh:${slug}:${chatId}`,
              style: "primary" as const,
            },
          ],
        ],
      };

      await ctx
        .editMessageText(
          `Found a previous <b>${escapeHTML(project?.name ?? slug)}</b> session that was interrupted.\nResume to continue where you left off, or start fresh.`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
          },
        )
        .catch(() => {
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

  // Keep current session (dismiss the prompt)
  bot.callbackQuery(/^keep:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Keeping current session");
    await ctx.editMessageText("Session is active. Send a message to continue.").catch(() => {});
  });

  // Restart: kill existing session + start fresh
  bot.callbackQuery(/^restart:(.+):(\d+)$/, async (ctx) => {
    const slug = ctx.match[1]!;
    const chatId = Number(ctx.match[2]);
    await ctx.answerCallbackQuery("Restarting...");
    await ctx.editMessageText("Restarting session...").catch(() => {});

    // Kill existing session for this chat
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);
    if (mapping) {
      bridge.killSession(mapping.sessionId);
      bridge.removeMapping(chatId, topicId);
    }

    await bridge.startSessionForChat(ctx, slug);
  });

  // ── Quick Session (no project) ──────────────────────────────────────────

  bot.callbackQuery("quick:session", async (ctx) => {
    await ctx.answerCallbackQuery("Starting quick session...");
    await ctx.editMessageText("⚡ Starting quick session...").catch(() => {});

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;

    // Use home directory as CWD
    const os = await import("os");
    const homeDir = os.homedir();

    try {
      const sessionId = await bridge.wsBridge.startSession({
        cwd: homeDir,
        model: DEFAULT_MODEL,
        permissionMode: "default",
        source: "telegram",
      });

      bridge.setMapping(chatId, topicId, {
        sessionId,
        projectSlug: "quick",
        model: DEFAULT_MODEL,
      });
      bridge.subscribeToSession(sessionId, chatId, topicId);

      const panelMsg = await bridge.sendSettingsPanel(
        chatId,
        topicId,
        sessionId,
        "Quick Session",
        DEFAULT_MODEL,
      );
      if (panelMsg) {
        bridge.setSessionPanelMessageId(sessionId, panelMsg.message_id);
      }

      log.info("Quick session started", { chatId, sessionId });
    } catch (err) {
      log.error("Failed to start quick session", { error: String(err) });
      await ctx
        .editMessageText(
          "❌ Failed to start session. Check that the project directory exists and Claude CLI is available.",
        )
        .catch(() => {});
    }
  });
}
