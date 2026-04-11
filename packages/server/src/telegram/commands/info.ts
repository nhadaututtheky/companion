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
  shortModelName,
} from "../formatter.js";
import { getDb } from "../../db/client.js";
import { sessions, dailyCosts } from "../../db/schema.js";
import { listSessions, renameSession } from "../../services/session-store.js";
import { getMaxContextTokens } from "@companion/shared";
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
      sections.push(
        `🟢 <b>Created (${s.files_created.length})</b>\n` +
          s.files_created.map((f) => `  <code>${escapeHTML(f)}</code>`).join("\n"),
      );
    }
    if (s.files_modified.length > 0) {
      sections.push(
        `🟡 <b>Modified (${s.files_modified.length})</b>\n` +
          s.files_modified.map((f) => `  <code>${escapeHTML(f)}</code>`).join("\n"),
      );
    }
    if (s.files_read.length > 0) {
      sections.push(
        `🔵 <b>Read (${s.files_read.length})</b>\n` +
          s.files_read
            .slice(-10)
            .map((f) => `  <code>${escapeHTML(f)}</code>`)
            .join("\n") +
          (s.files_read.length > 10 ? `\n  <i>... and ${s.files_read.length - 10} more</i>` : ""),
      );
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
      bridge.wsBridge.handleBrowserMessage(
        mapping.sessionId,
        JSON.stringify({
          type: "set_model",
          model: args,
        }),
      );
      await ctx.reply(`Model set to <code>${escapeHTML(args)}</code>`, { parse_mode: "HTML" });
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    const current = shortModelName(session?.state.model ?? mapping.model);
    const sid = mapping.sessionId;

    const models = [
      { label: "Opus 4.6", key: "o46" },
      { label: "Sonnet 4.6", key: "s46" },
      { label: "Haiku 4.5", key: "h45" },
      { label: "Opus 4.5", key: "o45" },
      { label: "Sonnet 4.5", key: "s45" },
    ];

    const btns = models.map((m) => {
      const isCurrent = current === m.label;
      return { text: `${isCurrent ? "🟢 " : ""}${m.label}${isCurrent ? " ✓" : ""}`, callback_data: `pm:${m.key}:${sid}` };
    });

    const keyboard = {
      inline_keyboard: [btns.slice(0, 3), btns.slice(3)],
    };

    await ctx.reply(`Current: <b>${escapeHTML(current)}</b>\nSelect model:`, {
      parse_mode: "HTML",
      reply_markup: keyboard as unknown as InlineKeyboard,
    });
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
      const model = s.model.includes("opus")
        ? "Opus"
        : s.model.includes("haiku")
          ? "Haiku"
          : "Sonnet";
      const cost = `$${s.total_cost_usd.toFixed(4)}`;
      const duration = s.endedAt
        ? formatDuration(s.endedAt - s.startedAt)
        : formatDuration(Date.now() - s.startedAt) + " (active)";
      const statusDot = s.status === "ended" ? "⚫" : s.status === "error" ? "🔴" : "🟢";
      const date = new Date(s.startedAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

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

  // ── /context — Context window usage meter ────────────────────────────

  bot.command("context", async (ctx) => {
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

    const s = session.state;
    const model = s.model ?? mapping.model ?? "";

    // Determine context window size by model family
    const maxTokens = getMaxContextTokens(model);

    const inputTokens = s.total_input_tokens ?? 0;
    const outputTokens = s.total_output_tokens ?? 0;
    const totalUsed = inputTokens + outputTokens;
    const totalPct = Math.min(Math.round((totalUsed / maxTokens) * 100), 100);
    const inputPct = Math.min(Math.round((inputTokens / maxTokens) * 100), 100);
    const outputPct = Math.min(Math.round((outputTokens / maxTokens) * 100), 100);

    // Build dual progress bars (20 blocks each for better resolution)
    const BAR_LEN = 20;
    const makeBar = (pct: number): string => {
      const filled = Math.round((pct / 100) * BAR_LEN);
      return "█".repeat(filled) + "░".repeat(BAR_LEN - filled);
    };

    // Warning level
    let statusIcon = "📊";
    if (totalPct >= 85) statusIcon = "🔴";
    else if (totalPct >= 60) statusIcon = "🟡";

    const remaining = Math.max(maxTokens - totalUsed, 0);
    const maxLabel =
      maxTokens >= 1_000_000
        ? `${(maxTokens / 1_000_000).toFixed(0)}M`
        : `${(maxTokens / 1_000).toFixed(0)}K`;

    // Compact model display
    const modelShort = model.includes("opus")
      ? "opus-4-6"
      : model.includes("haiku")
        ? "haiku-4-5"
        : "sonnet-4-6";

    const lines = [
      `${statusIcon} <b>Context Window</b>  ·  <code>${modelShort}</code>`,
      ``,
      `📥 Input   <code>${makeBar(inputPct)}</code>  ${inputPct}%`,
      `   ${formatTokens(inputTokens)}`,
      `📤 Output  <code>${makeBar(outputPct)}</code>  ${outputPct}%`,
      `   ${formatTokens(outputTokens)}`,
      ``,
      `Total: ${formatTokens(totalUsed)} / ${maxLabel}  ·  ${formatTokens(remaining)} left`,
      `Turns: ${s.num_turns ?? 0}  ·  Cost: ${formatCost(s.total_cost_usd ?? 0)}`,
    ];

    if (totalPct >= 60) {
      lines.push(``, `💡 <code>/compact</code> to free up context space`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // ── /rename <name> — Rename current session ────────────────────────────

  bot.command("rename", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session. Use /start to begin.");
      return;
    }

    const name = ctx.match?.trim() || null;
    const ok = renameSession(mapping.sessionId, name);
    if (!ok) {
      await ctx.reply("Failed to rename session.");
      return;
    }

    if (name) {
      await ctx.reply(`✏️ Session renamed to <b>${escapeHTML(name)}</b>`, { parse_mode: "HTML" });
    } else {
      await ctx.reply("✏️ Session name cleared.");
    }
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
        await ctx.reply(`Unknown command: <code>/${escapeHTML(cmd)}</code>`, {
          parse_mode: "HTML",
        });
      }
      return;
    }

    const helpText = [
      "<b>📖 Companion — All Commands</b>",
      "",
      "🗂 <b>Session</b>",
      "/new [project] — New session",
      "/stop — Stop session",
      "/resume — Resume interrupted session",
      "/status — Session status",
      "/rename — Rename session",
      "/templates — Browse session templates",
      "/fork — Fork session (keep old running)",
      "/projects — List all projects",
      "",
      "🎛 <b>Control</b>",
      "/allow — Allow pending permission",
      "/deny — Deny pending permission",
      "/model — Change AI model",
      "/thinking — Toggle thinking mode",
      "/budget — Set cost budget",
      "/compact — Compact context window",
      "/settings — Bot settings",
      "",
      "🔧 <b>Tools</b>",
      "/file — Read a file and show content",
      "/cat — Alias for /file",
      "/send — Send file as document",
      "/btw — Inject context (no reply)",
      "/skill — List or invoke a skill",
      "/mcp — List MCP servers",
      "/stream — Attach to an active session",
      "/detach — Detach from streamed session",
      "/clear — Clear recent bot messages",
      "",
      "📊 <b>Info</b>",
      "/cost — Cost breakdown",
      "/context — Context window usage",
      "/files — Modified files",
      "/todo — Claude's task list",
      "/history — Recent session history",
      "/usage [today|week|month] — Cost summary",
      "",
      "⚙️ <b>Advanced</b>",
      "/planmode — Toggle plan mode",
      "/exitplan — Force exit plan mode",
      "/verdict — Conclude active debate",
      "/mention — @mention routing",
      "/notes — Session notes",
      "/note — Save a note",
      "/panel — Settings panel",
      "/autoapprove — Auto-approve toggle",
      "/forum — Forum topic mappings (groups)",
      "",
      "<i>Use /help &lt;command&gt; for details on any command.</i>",
      "<i>Or just type a message to chat with Claude!</i>",
    ].join("\n");

    await ctx.reply(helpText, { parse_mode: "HTML" });
  });

}

// ─── Per-command Help Details ──────────────────────────────────────────────────

const COMMAND_HELP: Record<string, string> = {
  start:
    "Show available projects and start a session.\nAlso shows Quick Session option if no projects are configured.",
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
  template:
    '<code>/template save "Name" prompt text</code> — Create a template\n<code>/template delete slug</code> — Delete a template',
  btw: "<code>/btw message</code>\nInject context into Claude's conversation without expecting a response.",
  file: "<code>/file path/to/file</code>\nRead and display file content. Files under 4KB shown inline, larger sent as document.\nAlias: /cat",
  cat: "Alias for /file.",
  send: "<code>/send path/to/file</code>\nSend a file as a Telegram document attachment.",
  skill:
    "<code>/skill</code> — List available skills\n<code>/skill name</code> — Invoke a specific skill",
  note: "<code>/note text</code>\nSave a note for the current session.",
  notes: "Show all saved notes for the current session.",
  todo: "Forward /todo to Claude to display the current task list.",
  status: "Show current session status: model, turns, cost, tokens, files.",
  cost: "Show detailed cost breakdown: tokens, cache, duration.",
  files: "Show files created, modified, and read in the current session.",
  model:
    "<code>/model</code> — Show model picker\n<code>/model claude-sonnet-4-6</code> — Set model directly",
  history:
    "<code>/history [n]</code>\nShow last N sessions (default 5, max 20).\nIncludes project, model, cost, duration, and turn count.",
  usage:
    "<code>/usage [today|week|month]</code>\nShow cost and usage summary.\nBreaks down by project with session count and token totals.",
  context:
    "Show a visual context window usage meter.\nDisplays tokens used vs. max capacity for the current session with a progress bar.\n⚠️ shown at 60%, 🔴 at 85%. Includes tip to /compact when high.",
  fork: "Fork current session — start a new session for the same project while keeping the old one running.\nOld session remains accessible via /stream.",
  stream:
    "<code>/stream</code> — List active sessions to stream\n<code>/stream sessionId</code> — Attach to specific session\nReceive live events from a session without controlling it.",
  detach: "Detach from a streamed session. The session continues running.",
  autoapprove:
    "<code>/autoapprove [on|off|seconds]</code>\nToggle auto-approve for permission requests.\nWhen on, permissions are automatically allowed after the timeout.",
  debate: "<code>/debate [topic]</code>\nStart a multi-agent debate session.",
  thinking:
    "<code>/thinking</code> — Show picker\n<code>/thinking on</code> — Deep thinking\n<code>/thinking off</code> — Disable\n<code>/thinking adaptive</code> — Auto-select",
  clear:
    "<code>/clear [n]</code>\nDelete the last N bot messages (default 20, max 100).\nOnly works for messages the bot can delete.",
  mcp: "Show MCP servers connected to the current session with their status.",
  forum:
    "<code>/forum</code> — List forum topic mappings\n<code>/forum reset</code> — Clear all mappings\n\nIn groups with forum topics enabled, each project auto-creates its own topic when you start a session.",
};
