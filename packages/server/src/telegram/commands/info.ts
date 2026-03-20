/**
 * Info commands: /status, /cost, /files, /help, /model, /todo, /history, /usage
 */

import { InlineKeyboard } from "grammy";
import { gte, sql } from "drizzle-orm";
import {
  escapeHTML,
  formatCost,
  formatTokens,
  formatDuration,
  formatSessionStatus,
} from "../formatter.js";
import { getDb } from "../../db/client.js";
import { sessions, dailyCosts } from "../../db/schema.js";
import { listSessions } from "../../services/session-store.js";
import type { TelegramBridge } from "../telegram-bridge.js";

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

  // ── /todo — Forward to Claude's built-in task list ────────────────────

  bot.command("todo", async (ctx) => {
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

    bridge.wsBridge.sendUserMessage(mapping.sessionId, "/todo", "telegram");
    await ctx.reply("📋 Fetching task list...");
  });

  // ── /history [n] — Recent session history ─────────────────────────────

  bot.command("history", async (ctx) => {
    const arg = ctx.match?.trim();
    const limit = Math.min(Math.max(parseInt(arg || "5", 10) || 5, 1), 20);

    const result = listSessions({ limit });

    if (result.items.length === 0) {
      await ctx.reply("No session history.");
      return;
    }

    const lines = result.items.map((s) => {
      const project = s.projectSlug ? `<b>${escapeHTML(s.projectSlug)}</b>` : "<i>quick</i>";
      const model = s.model.includes("opus") ? "Opus" : s.model.includes("haiku") ? "Haiku" : "Sonnet";
      const cost = `$${s.total_cost_usd.toFixed(4)}`;
      const duration = s.endedAt
        ? formatDuration(s.endedAt - s.startedAt)
        : formatDuration(Date.now() - s.startedAt) + " (active)";
      const statusDot = s.status === "ended" ? "⚫" : s.status === "error" ? "🔴" : "🟢";
      const date = new Date(s.startedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

      return `${statusDot} ${project} · ${model} · ${cost} · ${duration}\n   <code>${date}</code> · ${s.num_turns} turns`;
    });

    const header = `<b>📜 Recent Sessions</b> (${result.items.length}/${result.total})`;
    await ctx.reply(`${header}\n\n${lines.join("\n\n")}`, { parse_mode: "HTML" });
  });

  // ── /usage [today|week|month] — Cost & usage summary ──────────────────

  bot.command("usage", async (ctx) => {
    const period = (ctx.match?.trim() || "today").toLowerCase();
    const db = getDb();

    // Calculate date range
    const now = new Date();
    let startDate: string;
    let periodLabel: string;

    if (period === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().slice(0, 10);
      periodLabel = "Last 7 days";
    } else if (period === "month") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().slice(0, 10);
      periodLabel = "Last 30 days";
    } else {
      startDate = now.toISOString().slice(0, 10);
      periodLabel = "Today";
    }

    // Query daily_costs table
    const costRows = db
      .select({
        projectSlug: dailyCosts.projectSlug,
        totalCost: sql<number>`SUM(${dailyCosts.totalCostUsd})`,
        totalSessions: sql<number>`SUM(${dailyCosts.totalSessions})`,
        totalTokens: sql<number>`SUM(${dailyCosts.totalTokens})`,
      })
      .from(dailyCosts)
      .where(gte(dailyCosts.date, startDate))
      .groupBy(dailyCosts.projectSlug)
      .all();

    if (costRows.length === 0) {
      // Fallback: count from sessions table directly
      const sessionRows = db
        .select({
          projectSlug: sessions.projectSlug,
          totalCost: sql<number>`SUM(${sessions.totalCostUsd})`,
          sessionCount: sql<number>`COUNT(*)`,
          totalTokens: sql<number>`SUM(${sessions.totalInputTokens} + ${sessions.totalOutputTokens})`,
        })
        .from(sessions)
        .where(gte(sessions.startedAt, new Date(startDate)))
        .groupBy(sessions.projectSlug)
        .all();

      if (sessionRows.length === 0) {
        await ctx.reply(`No usage data for ${periodLabel.toLowerCase()}.`);
        return;
      }

      const totalCost = sessionRows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);
      const totalSessions = sessionRows.reduce((sum, r) => sum + (r.sessionCount ?? 0), 0);
      const totalTokens = sessionRows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

      const lines = [
        `📊 <b>Usage — ${periodLabel}</b>`,
        `Total cost: <code>$${totalCost.toFixed(4)}</code>`,
        `Sessions: <code>${totalSessions}</code>`,
        `Tokens: ${formatTokens(totalTokens)}`,
        "",
        "<b>Per project:</b>",
        ...sessionRows.map((r) => {
          const name = r.projectSlug ? escapeHTML(r.projectSlug) : "quick";
          return `  ${name}: <code>$${(r.totalCost ?? 0).toFixed(4)}</code> · ${r.sessionCount} sessions`;
        }),
      ];

      await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
      return;
    }

    const totalCost = costRows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);
    const totalSessions = costRows.reduce((sum, r) => sum + (r.totalSessions ?? 0), 0);
    const totalTokens = costRows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

    const lines = [
      `📊 <b>Usage — ${periodLabel}</b>`,
      `Total cost: <code>$${totalCost.toFixed(4)}</code>`,
      `Sessions: <code>${totalSessions}</code>`,
      `Tokens: ${formatTokens(totalTokens)}`,
      "",
      "<b>Per project:</b>",
      ...costRows.map((r) => {
        const name = r.projectSlug ? escapeHTML(r.projectSlug) : "quick";
        return `  ${name}: <code>$${(r.totalCost ?? 0).toFixed(4)}</code> · ${r.totalSessions} sessions`;
      }),
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ── /help [command] — Categorized help ────────────────────────────────

  bot.command("help", async (ctx) => {
    const arg = ctx.match?.trim();

    // Per-command help
    if (arg) {
      const cmd = arg.replace(/^\//, "");
      const detail = COMMAND_HELP[cmd];
      if (detail) {
        await ctx.reply(`<b>/${escapeHTML(cmd)}</b>\n${detail}`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`Unknown command: <code>/${escapeHTML(cmd)}</code>`, { parse_mode: "HTML" });
      }
      return;
    }

    const helpText = [
      "<b>📖 Companion Commands</b>",
      "",
      "📱 <b>Session</b>",
      "/start — Show projects",
      "/new [project] — New session",
      "/stop — Stop session",
      "/resume — Resume session",
      "/projects — List projects",
      "",
      "🎛️ <b>Control</b>",
      "/allow — Allow permission",
      "/deny — Deny permission",
      "/cancel — Interrupt Claude",
      "/exitplan — Exit plan mode",
      "/compact — Compact context",
      "",
      "📋 <b>Templates</b>",
      "/templates — Browse templates",
      "/template save — Create template",
      "/template delete — Remove template",
      "",
      "🔧 <b>Utility</b>",
      "/btw — Inject context (no reply)",
      "/file — Read file content",
      "/send — Send file as document",
      "/skill — List/invoke skills",
      "/note — Save session note",
      "/notes — Show session notes",
      "/todo — Show Claude's task list",
      "",
      "📊 <b>Info</b>",
      "/status — Session status",
      "/cost — Cost breakdown",
      "/files — Modified files",
      "/model — Change model",
      "/history — Recent sessions",
      "/usage — Cost summary",
      "",
      "🔗 <b>Stream</b>",
      "/stream — Attach to session",
      "/detach — Detach from stream",
      "",
      "⚙️ <b>Config</b>",
      "/autoapprove — Auto-approve settings",
      "",
      "<i>Use /help &lt;command&gt; for details.</i>",
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

// ─── Per-command Help Details ──────────────────────────────────────────────────

const COMMAND_HELP: Record<string, string> = {
  start: "Show available projects and start a session.\nAlso shows Quick Session option if no projects are configured.",
  new: "<code>/new [project-slug]</code>\nStart a new session. If no project specified, shows project picker.",
  stop: "Stop the current active session with confirmation prompt.",
  resume: "Resume a previously interrupted session.\nShows resumable sessions per project.",
  projects: "List all configured projects with their slugs and directories.",
  allow: "Allow all pending permission requests from Claude.",
  deny: "Deny all pending permission requests from Claude.",
  cancel: "Send interrupt signal to Claude — stops current operation.",
  exitplan: "Force exit from plan mode (sends /exitplan + interrupt).",
  compact: "Compact Claude's context window to free up token space.",
  templates: "Show all available session templates as clickable buttons.\nAlias: /t",
  template: "<code>/template save \"Name\" prompt text</code> — Create a template\n<code>/template delete slug</code> — Delete a template",
  btw: "<code>/btw message</code>\nInject context into Claude's conversation without expecting a response.",
  file: "<code>/file path/to/file</code>\nRead and display file content. Files under 4KB shown inline, larger sent as document.\nAlias: /cat",
  cat: "Alias for /file.",
  send: "<code>/send path/to/file</code>\nSend a file as a Telegram document attachment.",
  skill: "<code>/skill</code> — List available skills\n<code>/skill name</code> — Invoke a specific skill",
  note: "<code>/note text</code>\nSave a note for the current session.",
  notes: "Show all saved notes for the current session.",
  todo: "Forward /todo to Claude to display the current task list.",
  status: "Show current session status: model, turns, cost, tokens, files.",
  cost: "Show detailed cost breakdown: tokens, cache, duration.",
  files: "Show files created, modified, and read in the current session.",
  model: "<code>/model</code> — Show model picker\n<code>/model claude-sonnet-4-6</code> — Set model directly",
  history: "<code>/history [n]</code>\nShow last N sessions (default 5, max 20).\nIncludes project, model, cost, duration, and turn count.",
  usage: "<code>/usage [today|week|month]</code>\nShow cost and usage summary.\nBreaks down by project with session count and token totals.",
  stream: "<code>/stream</code> — List active sessions to stream\n<code>/stream sessionId</code> — Attach to specific session\nReceive live events from a session without controlling it.",
  detach: "Detach from a streamed session. The session continues running.",
  autoapprove: "<code>/autoapprove [on|off|seconds]</code>\nToggle auto-approve for permission requests.\nWhen on, permissions are automatically allowed after the timeout.",
  debate: "<code>/debate [topic]</code>\nStart a multi-agent debate session.",
};
