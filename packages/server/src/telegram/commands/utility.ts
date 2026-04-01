/**
 * Utility commands: /btw, /file, /cat, /send, /skill, /note, /notes
 */

import * as fs from "fs";
import * as path from "path";
import { InputFile } from "grammy";
import { eq, desc } from "drizzle-orm";
import { createLogger } from "../../logger.js";
import { escapeHTML } from "../formatter.js";
import { getDb } from "../../db/client.js";
import { sessionNotes as notesTable } from "../../db/schema.js";
import { getSessionMessages, getSessionRecord } from "../../services/session-store.js";
import type { TelegramBridge } from "../telegram-bridge.js";

const log = createLogger("cmd:utility");

/** Max file size to read inline (50 KB) */
const MAX_FILE_BYTES = 50 * 1024;

/** Telegram message character limit */
const TG_MAX_CHARS = 4096;

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve and validate a user-supplied path against the session CWD.
 * Returns the resolved absolute path, or null if the path escapes CWD (traversal attempt).
 */
function safeResolvePath(userPath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, userPath);
  const safeCwd = path.resolve(cwd);
  if (!resolved.startsWith(safeCwd + path.sep) && resolved !== safeCwd) {
    return null;
  }
  return resolved;
}

/**
 * Get the CWD for a session from the WsBridge state.
 */
function getSessionCwd(bridge: TelegramBridge, sessionId: string): string | null {
  const session = bridge.wsBridge.getSession(sessionId);
  return session?.state.cwd ?? null;
}

// ── File reading helper ──────────────────────────────────────────────────────

function readFileContent(
  filePath: string,
): { content: string; truncated: boolean } | { error: string } {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { error: "Path is not a file." };
    }

    const size = stat.size;
    const truncated = size > MAX_FILE_BYTES;
    const buffer = Buffer.alloc(truncated ? MAX_FILE_BYTES : size);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    return { content: buffer.toString("utf-8"), truncated };
  } catch (err) {
    return { error: String(err) };
  }
}

// ─── Command Registration ────────────────────────────────────────────────────

export function registerUtilityCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /btw <message> — inject context to Claude ────────────────────────────

  bot.command("btw", async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) {
      await ctx.reply("Usage: /btw <message>");
      return;
    }

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

    bridge.wsBridge.sendUserMessage(mapping.sessionId, `[BTW from user]: ${text}`, "telegram");
    await ctx.reply("📌 Context noted");
  });

  // ── /file <path> and /cat <path> — read file and send content ────────────

  const handleFileCommand = async (ctx: import("grammy").Context) => {
    const userPath = (ctx.match as string | undefined)?.trim();
    if (!userPath) {
      await ctx.reply("Usage: /file &lt;path&gt;", { parse_mode: "HTML" });
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const mapping = bridge.getMapping(chatId, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const cwd = getSessionCwd(bridge, mapping.sessionId);
    if (!cwd) {
      await ctx.reply("Session has no working directory.");
      return;
    }

    const resolved = safeResolvePath(userPath, cwd);
    if (!resolved) {
      await ctx.reply("⛔ Path traversal denied.");
      return;
    }

    const result = readFileContent(resolved);

    if ("error" in result) {
      await ctx.reply(`⚠️ ${escapeHTML(result.error)}`, { parse_mode: "HTML" });
      return;
    }

    const { content, truncated } = result;
    const ext = path.extname(resolved).slice(1) || "text";
    const relPath = path.relative(cwd, resolved);
    const header = truncated
      ? `<b>${escapeHTML(relPath)}</b> (first 50 KB shown)\n`
      : `<b>${escapeHTML(relPath)}</b>\n`;

    if (content.length < TG_MAX_CHARS - 200) {
      // Send as a single code block
      const msg = `${header}<pre><code class="language-${escapeHTML(ext)}">${escapeHTML(content)}</code></pre>`;
      await ctx.reply(msg, {
        parse_mode: "HTML",
        message_thread_id: ctx.message?.message_thread_id,
      });
    } else {
      // Send as a document attachment instead
      const fileName = path.basename(resolved);
      const inputFile = new InputFile(Buffer.from(content, "utf-8"), fileName);
      await ctx.replyWithDocument(inputFile, {
        caption: header + (truncated ? "(truncated to 50 KB)" : ""),
        parse_mode: "HTML",
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  };

  bot.command("file", handleFileCommand);
  bot.command("cat", handleFileCommand);

  // ── /send <path> — send file as document attachment ──────────────────────

  bot.command("send", async (ctx) => {
    const userPath = ctx.match?.trim();
    if (!userPath) {
      await ctx.reply("Usage: /send &lt;path&gt;", { parse_mode: "HTML" });
      return;
    }

    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const cwd = getSessionCwd(bridge, mapping.sessionId);
    if (!cwd) {
      await ctx.reply("Session has no working directory.");
      return;
    }

    const resolved = safeResolvePath(userPath, cwd);
    if (!resolved) {
      await ctx.reply("⛔ Path traversal denied.");
      return;
    }

    const result = readFileContent(resolved);
    if ("error" in result) {
      await ctx.reply(`⚠️ ${escapeHTML(result.error)}`, { parse_mode: "HTML" });
      return;
    }

    const { content, truncated } = result;
    const fileName = path.basename(resolved);
    const relPath = path.relative(cwd, resolved);
    const caption = truncated
      ? `<b>${escapeHTML(relPath)}</b> (truncated to 50 KB)`
      : `<b>${escapeHTML(relPath)}</b>`;

    const inputFile = new InputFile(Buffer.from(content, "utf-8"), fileName);
    await ctx.replyWithDocument(inputFile, {
      caption,
      parse_mode: "HTML",
      message_thread_id: ctx.message?.message_thread_id,
    });
  });

  // ── /skill [name] — list or invoke a skill ───────────────────────────────

  bot.command("skill", async (ctx) => {
    const arg = ctx.match?.trim();

    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const cwd = getSessionCwd(bridge, mapping.sessionId);

    if (!arg) {
      // List skills
      if (!cwd) {
        await ctx.reply("No working directory available.");
        return;
      }

      const skillFiles: string[] = [];
      const patterns = [
        path.join(cwd, ".rune", "skills", "*", "skill.md"),
        path.join(cwd, ".claude", "skills", "*", "skill.md"),
      ];

      for (const pattern of patterns) {
        const dir = path.dirname(path.dirname(pattern));
        if (!fs.existsSync(dir)) continue;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const skillFile = path.join(dir, entry.name, "skill.md");
              if (fs.existsSync(skillFile)) {
                skillFiles.push(entry.name);
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (skillFiles.length === 0) {
        await ctx.reply(
          "No skills found in <code>.rune/skills/</code> or <code>.claude/skills/</code>.",
          {
            parse_mode: "HTML",
          },
        );
        return;
      }

      const lines = skillFiles.map((name) => `• <code>/${escapeHTML(name)}</code>`);
      await ctx.reply(
        `<b>Available skills:</b>\n\n${lines.join("\n")}\n\nUse <code>/skill &lt;name&gt;</code> to invoke.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // Invoke skill: send /<name> as user message to Claude
    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session not found.");
      return;
    }

    bridge.wsBridge.sendUserMessage(mapping.sessionId, `/${arg}`, "telegram");
    await ctx.reply(`Running skill <code>${escapeHTML(arg)}</code>...`, { parse_mode: "HTML" });
  });

  // ── /note <text> — save a note (persisted to DB) ────────────────────────

  bot.command("note", async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) {
      await ctx.reply("Usage: /note &lt;text&gt;", { parse_mode: "HTML" });
      return;
    }

    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    try {
      const db = getDb();
      db.insert(notesTable).values({ sessionId: mapping.sessionId, content: text }).run();
      await ctx.reply(`📝 Note saved: ${escapeHTML(text)}`, { parse_mode: "HTML" });
    } catch (err) {
      log.warn("Failed to save note", { error: String(err) });
      await ctx.reply("Failed to save note.");
    }
  });

  // ── /notes — show all notes for current session ───────────────────────────

  bot.command("notes", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    try {
      const db = getDb();
      const notes = db
        .select()
        .from(notesTable)
        .where(eq(notesTable.sessionId, mapping.sessionId))
        .orderBy(desc(notesTable.createdAt))
        .all();

      if (notes.length === 0) {
        await ctx.reply("No notes for this session.");
        return;
      }

      const lines = notes.map((n, i) => `${i + 1}. ${escapeHTML(n.content)}`);
      await ctx.reply(`<b>Session notes (${notes.length}):</b>\n\n${lines.join("\n")}`, {
        parse_mode: "HTML",
      });
    } catch (err) {
      log.warn("Failed to load notes", { error: String(err) });
      await ctx.reply("Failed to load notes.");
    }
  });

  // ── /stream [sessionId] — attach to an existing session ─────────────────

  bot.command("stream", async (ctx) => {
    const arg = ctx.match?.trim();
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;

    if (arg) {
      // Direct attach to specified session
      const session = bridge.wsBridge.getSession(arg);
      if (!session) {
        await ctx.reply(
          `Session <code>${escapeHTML(arg.slice(0, 8))}</code> not found or not active.`,
          {
            parse_mode: "HTML",
          },
        );
        return;
      }

      const ok = bridge.attachStreamToSession(arg, chatId, topicId);
      if (!ok) {
        await ctx.reply("Failed to attach to session.");
        return;
      }

      const projectName =
        (session.state as unknown as { projectSlug?: string })?.projectSlug ?? "Session";
      await ctx.reply(
        `Streaming <b>${escapeHTML(projectName)}</b> <code>${escapeHTML(arg.slice(0, 8))}</code>\n\nEvents will be forwarded here. Use /detach to stop.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // List active sessions as inline keyboard
    const sessions = bridge.wsBridge.getActiveSessions();
    if (sessions.length === 0) {
      await ctx.reply("No active sessions. Start one with /new or from the web UI.");
      return;
    }

    const rows = sessions.map((s) => {
      const modelShort = s.state.model.includes("opus")
        ? "Opus"
        : s.state.model.includes("haiku")
          ? "Haiku"
          : "Sonnet";
      const slug =
        (s.state as unknown as { projectSlug?: string })?.projectSlug ?? s.id.slice(0, 6);
      const statusDot =
        s.state.status === "idle"
          ? "🟢"
          : s.state.status === "busy" || s.state.status === "compacting"
            ? "🔵"
            : s.state.status === "ended"
              ? "⚫"
              : "🟡";
      return [
        {
          text: `${statusDot} ${slug} · ${modelShort} · ${s.state.status}`,
          callback_data: `stream:${s.id}`,
        },
      ];
    });

    await ctx.reply("Select a session to stream:", {
      reply_markup: { inline_keyboard: rows },
    });
  });

  // ── /detach — unsubscribe from current stream without killing session ─────

  bot.command("detach", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;

    const detachedSessionId = bridge.detachStream(chatId, topicId);
    if (detachedSessionId) {
      await ctx.reply(
        `Detached from session <code>${escapeHTML(detachedSessionId.slice(0, 8))}</code>. Session continues running.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // Also check if this chat has a full mapping (from /stream-attached session)
    await ctx.reply("No stream subscription active in this chat.");
  });

  // ── stream:{sessionId} callback — attach from inline keyboard ────────────

  bot.callbackQuery(/^stream:([a-f0-9-]+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) {
      await ctx.answerCallbackQuery("Could not determine chat.");
      return;
    }

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;

    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session no longer active.");
      await ctx.editMessageText("Session ended.").catch(() => {});
      return;
    }

    const ok = bridge.attachStreamToSession(sessionId, chatId, topicId);
    if (!ok) {
      await ctx.answerCallbackQuery("Failed to attach.");
      return;
    }

    const projectName =
      (session.state as unknown as { projectSlug?: string })?.projectSlug ?? "Session";
    await ctx.answerCallbackQuery("Streaming started");
    await ctx
      .editMessageText(
        `Streaming <b>${escapeHTML(projectName)}</b> <code>${escapeHTML(sessionId.slice(0, 8))}</code>\n\nEvents will be forwarded here. Use /detach to stop.`,
        { parse_mode: "HTML" },
      )
      .catch(() => {});
  });

  // ── viewfile callback query ───────────────────────────────────────────────

  bot.callbackQuery(/^vf:(vf\d+)$/, async (ctx) => {
    const cacheKey = ctx.match[1]!;
    const cached = bridge.viewFileCache.get(cacheKey);
    if (!cached) {
      await ctx.answerCallbackQuery("File reference expired.");
      return;
    }
    const { sessionId, filePath: userPath } = cached;

    await ctx.answerCallbackQuery("Loading file...");

    const session = bridge.wsBridge.getSession(sessionId);
    const cwd = session?.state.cwd;
    if (!cwd) {
      await ctx.reply("Session not found or no working directory.");
      return;
    }

    const resolved = safeResolvePath(userPath, cwd);
    if (!resolved) {
      await ctx.reply("⛔ Path traversal denied.");
      return;
    }

    const result = readFileContent(resolved);
    if ("error" in result) {
      await ctx.reply(`⚠️ ${escapeHTML(result.error)}`, { parse_mode: "HTML" });
      return;
    }

    const { content, truncated } = result;
    const ext = path.extname(resolved).slice(1) || "text";
    const relPath = path.relative(cwd, resolved);
    const header = truncated
      ? `<b>${escapeHTML(relPath)}</b> (first 50 KB)\n`
      : `<b>${escapeHTML(relPath)}</b>\n`;
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;

    if (!chatId) return;

    if (content.length < TG_MAX_CHARS - 200) {
      await ctx.api.sendMessage(
        chatId,
        `${header}<pre><code class="language-${escapeHTML(ext)}">${escapeHTML(content)}</code></pre>`,
        { parse_mode: "HTML", message_thread_id: topicId },
      );
    } else {
      const fileName = path.basename(resolved);
      const inputFile = new InputFile(Buffer.from(content, "utf-8"), fileName);
      await ctx.api.sendDocument(chatId, inputFile, {
        caption: header + (truncated ? "(truncated to 50 KB)" : ""),
        parse_mode: "HTML",
        message_thread_id: topicId,
      });
    }
  });

  // ── /export — export current session as markdown document ──────────────

  bot.command("export", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const { sessionId } = mapping;
    const session = getSessionRecord(sessionId);
    if (!session) {
      await ctx.reply("Session record not found.");
      return;
    }

    const { items: msgs } = getSessionMessages(sessionId, { limit: 10000 });
    if (msgs.length === 0) {
      await ctx.reply("No messages in this session yet.");
      return;
    }

    const date = session.startedAt
      ? new Date(session.startedAt).toISOString().slice(0, 19).replace("T", " ")
      : "unknown";

    const lines: string[] = [
      `# Session Export`,
      ``,
      `- **Project**: ${session.projectSlug ?? "quick"}`,
      `- **Model**: ${session.model}`,
      `- **Status**: ${session.status}`,
      `- **Started**: ${date}`,
      `- **Turns**: ${session.numTurns}`,
      `- **Cost**: $${session.totalCostUsd.toFixed(4)}`,
      `- **Tokens**: ${session.totalInputTokens + session.totalOutputTokens}`,
      ``,
      `---`,
      ``,
    ];

    for (const msg of msgs) {
      const role =
        msg.role === "user"
          ? "## User"
          : msg.role === "assistant"
            ? "## Assistant"
            : `## ${msg.role}`;
      const time = new Date(msg.timestamp).toLocaleTimeString("en-US", { hour12: false });
      lines.push(`${role} _(${time})_`);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    const markdown = lines.join("\n");
    const filename = `session-${session.projectSlug ?? "quick"}-${sessionId.slice(0, 8)}.md`;
    const buffer = Buffer.from(markdown, "utf-8");
    const inputFile = new InputFile(buffer, filename);

    await ctx.replyWithDocument(inputFile, {
      caption: `<b>Session export</b> — ${session.projectSlug ?? "quick"} · ${msgs.length} messages`,
      parse_mode: "HTML",
      message_thread_id: ctx.message?.message_thread_id,
    });
  });

  // ── /web <url> — scrape web page via webclaw ────────────────────────────

  bot.command("web", async (ctx) => {
    const url = ctx.match?.trim();
    if (!url) {
      await ctx.reply("Usage: /web <url>\nFetches web content via webclaw.");
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      await ctx.reply("Invalid URL. Please provide a full URL (https://...).");
      return;
    }

    // Show typing while fetching
    await ctx.replyWithChatAction("typing");

    try {
      const { scrapeForContext, assertSafeUrl } = await import("../../services/web-intel.js");

      // SSRF protection
      try {
        assertSafeUrl(url);
      } catch {
        await ctx.reply("That URL is not allowed (private/internal addresses blocked).", {
          message_thread_id: ctx.message?.message_thread_id,
        });
        return;
      }

      const content = await scrapeForContext(url, 3000);

      if (!content) {
        await ctx.reply(
          "Could not fetch content — webclaw may be unavailable. Enable the webclaw sidecar in docker-compose.yml.",
          { message_thread_id: ctx.message?.message_thread_id },
        );
        return;
      }

      // Split long content for Telegram (max ~4000 chars per message)
      const header = `<b>🌐 Web</b>: ${escapeHTML(url)}\n\n`;
      const maxContent = TG_MAX_CHARS - header.length - 50;

      if (content.length <= maxContent) {
        await ctx.reply(`${header}<pre>${escapeHTML(content)}</pre>`, {
          parse_mode: "HTML",
          message_thread_id: ctx.message?.message_thread_id,
        });
      } else {
        // Send as document for long content
        const buffer = Buffer.from(content, "utf-8");
        const filename = `web-${new URL(url).hostname}.md`;
        const inputFile = new InputFile(buffer, filename);
        await ctx.replyWithDocument(inputFile, {
          caption: `🌐 Content from ${url}`,
          message_thread_id: ctx.message?.message_thread_id,
        });
      }
    } catch (err) {
      log.warn("Error in /web command", { url, error: String(err) });
      await ctx.reply("Error fetching web content.", {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  });

  // ── /research <query> — web research via webclaw ─────────────────────────

  bot.command("research", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: /research <query>\nSearches the web and synthesizes results.");
      return;
    }

    await ctx.replyWithChatAction("typing");

    try {
      const { research } = await import("../../services/web-intel.js");
      const result = await research(query, 3000);

      if (!result) {
        await ctx.reply("Research failed — WEBCLAW_API_KEY may be required for web search.", {
          message_thread_id: ctx.message?.message_thread_id,
        });
        return;
      }

      const sourceList = result.sources
        .map((s, i) => `${i + 1}. ${escapeHTML(s.title)}`)
        .join("\n");

      const header = `<b>🔍 Research:</b> ${escapeHTML(query)}\n<b>Sources:</b> ${result.sources.length}\n\n`;

      if (result.content.length + header.length + sourceList.length < TG_MAX_CHARS - 100) {
        await ctx.reply(`${header}<pre>${escapeHTML(result.content)}</pre>\n\n${sourceList}`, {
          parse_mode: "HTML",
          message_thread_id: ctx.message?.message_thread_id,
        });
      } else {
        const buffer = Buffer.from(
          `# Research: ${query}\n\n${result.content}\n\n## Sources\n${result.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n")}`,
          "utf-8",
        );
        const inputFile = new InputFile(buffer, `research-${Date.now()}.md`);
        await ctx.replyWithDocument(inputFile, {
          caption: `🔍 Research: ${query} (${result.sources.length} sources)`,
          message_thread_id: ctx.message?.message_thread_id,
        });
      }
    } catch (err) {
      log.warn("Error in /research command", { query, error: String(err) });
      await ctx.reply("Error performing research.", {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  });

  // ── /webstatus — webclaw health + cache stats ───────────────────────────

  bot.command("webstatus", async (ctx) => {
    try {
      const { isAvailable, getCacheStats } = await import("../../services/web-intel.js");
      const available = await isAvailable();
      const cache = getCacheStats();

      const status = available ? "✅ Online" : "❌ Offline";
      const hitRate =
        cache.hits + cache.misses > 0
          ? Math.round((cache.hits / (cache.hits + cache.misses)) * 100)
          : 0;

      await ctx.reply(
        `<b>🌐 WebIntel Status</b>\n\n` +
          `webclaw: ${status}\n` +
          `Cache: ${cache.size}/${cache.maxSize} entries\n` +
          `Hit rate: ${hitRate}% (${cache.hits} hits, ${cache.misses} misses)`,
        { parse_mode: "HTML", message_thread_id: ctx.message?.message_thread_id },
      );
    } catch (err) {
      log.warn("Error in /webstatus", { error: String(err) });
      await ctx.reply("Error checking status.", {
        message_thread_id: ctx.message?.message_thread_id,
      });
    }
  });

  log.info("Utility commands registered");
}
