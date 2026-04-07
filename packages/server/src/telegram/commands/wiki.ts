/**
 * Wiki commands: /wiki — Knowledge base management from Telegram.
 *
 * Usage:
 *   /wiki                  — list all domains
 *   /wiki <domain>         — show domain index (articles)
 *   /wiki <domain> <slug>  — read article (truncated)
 *   /wiki compile <domain> — trigger compilation
 *   /wiki search <query>   — search across default domain
 *   /wiki lint <domain>    — run freshness lint
 */

import { InlineKeyboard } from "grammy";
import { escapeHTML } from "../formatter.js";
import {
  listDomains,
  readIndex,
  readArticle,
  searchArticles,
  compileWiki,
  lintDomain,
  getWikiConfig,
} from "../../wiki/index.js";
import type { TelegramBridge } from "../telegram-bridge.js";

/** Minimal context type for handler functions that only need reply() */
interface ReplyCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: (text: string, opts?: any) => Promise<unknown>;
}

/** Max chars to show for article content in Telegram */
const ARTICLE_PREVIEW_LIMIT = 2000;

export function registerWikiCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  bot.command("wiki", async (ctx) => {
    const args = (ctx.match ?? "").trim().split(/\s+/).filter(Boolean);

    // /wiki — list domains
    if (args.length === 0) {
      return handleListDomains(ctx);
    }

    const arg0 = args[0] ?? "";
    const arg1 = args[1] ?? "";

    // /wiki compile <domain>
    if (arg0 === "compile" && arg1) {
      return handleCompile(ctx, arg1);
    }

    // /wiki search <query...>
    if (arg0 === "search" && args.length > 1) {
      return handleSearch(ctx, args.slice(1).join(" "));
    }

    // /wiki lint <domain>
    if (arg0 === "lint" && arg1) {
      return handleLint(ctx, arg1);
    }

    // /wiki <domain>
    if (args.length === 1) {
      return handleDomainIndex(ctx, arg0);
    }

    // /wiki <domain> <slug>
    if (args.length === 2) {
      return handleReadArticle(ctx, arg0, arg1);
    }

    await ctx.reply("Usage: /wiki [domain] [article] | compile <domain> | search <query> | lint <domain>");
  });

  // ── Callback queries for inline buttons ──────────────────────────────

  bot.callbackQuery(/^wiki:domain:(.+)$/, async (ctx) => {
    const domain = ctx.match?.[1] ?? "";
    await ctx.answerCallbackQuery();
    await sendDomainIndex(ctx, domain);
  });

  bot.callbackQuery(/^wiki:article:(.+):(.+)$/, async (ctx) => {
    const domain = ctx.match?.[1] ?? "";
    const slug = ctx.match?.[2] ?? "";
    await ctx.answerCallbackQuery();
    await sendArticle(ctx, domain, slug);
  });

  bot.callbackQuery(/^wiki:compile:(.+)$/, async (ctx) => {
    const domain = ctx.match?.[1] ?? "";
    await ctx.answerCallbackQuery("Compiling...");
    await doCompile(ctx, domain);
  });
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleListDomains(ctx: ReplyCtx): Promise<void> {
  const domains = listDomains();

  if (domains.length === 0) {
    await ctx.reply("No wiki domains yet. Create one from the web UI.");
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = ["<b>📚 Wiki Domains</b>\n"];

  for (const d of domains) {
    lines.push(
      `• <b>${escapeHTML(d.name)}</b> (${d.articleCount} articles, ${d.totalTokens} tokens)`,
    );
    keyboard.text(d.name, `wiki:domain:${d.slug}`).row();
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function handleDomainIndex(ctx: ReplyCtx, domain: string): Promise<void> {
  await sendDomainIndex(ctx, domain);
}

async function sendDomainIndex(ctx: ReplyCtx, domain: string): Promise<void> {
  const index = readIndex(domain);
  if (!index) {
    await ctx.reply(`Domain "${escapeHTML(domain)}" not found.`);
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = [
    `<b>📚 ${escapeHTML(index.domain)}</b>`,
    `${index.articleCount} articles · ${index.totalTokens} tokens`,
    "",
  ];

  if (index.articles.length === 0) {
    lines.push("<i>No articles yet. Drop raw files and compile.</i>");
  } else {
    for (const a of index.articles) {
      const tags = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
      lines.push(`• <b>${escapeHTML(a.title)}</b> — ${a.tokens}t${escapeHTML(tags)}`);
      keyboard.text(a.title, `wiki:article:${domain}:${a.slug}`).row();
    }
  }

  keyboard.text("🔄 Compile", `wiki:compile:${domain}`).row();

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function handleReadArticle(ctx: ReplyCtx, domain: string, slug: string): Promise<void> {
  await sendArticle(ctx, domain, slug);
}

async function sendArticle(ctx: ReplyCtx, domain: string, slug: string): Promise<void> {
  const article = readArticle(domain, slug);
  if (!article) {
    await ctx.reply(`Article "${escapeHTML(slug)}" not found in domain "${escapeHTML(domain)}".`);
    return;
  }

  let content = article.content;
  let truncated = false;
  if (content.length > ARTICLE_PREVIEW_LIMIT) {
    content = content.slice(0, ARTICLE_PREVIEW_LIMIT);
    truncated = true;
  }

  const tags = article.meta.tags.length > 0 ? `\nTags: ${article.meta.tags.join(", ")}` : "";
  const edited = article.meta.manuallyEdited ? " ✏️" : "";

  const lines = [
    `<b>📄 ${escapeHTML(article.meta.title)}</b>${edited}`,
    `<i>${article.meta.tokens} tokens · ${article.meta.compiledBy}</i>${tags}`,
    "",
    escapeHTML(content),
  ];

  if (truncated) {
    lines.push("\n<i>... (truncated — view full article in web UI)</i>");
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleSearch(ctx: ReplyCtx, query: string): Promise<void> {
  const config = getWikiConfig();
  const domain = config.defaultDomain;

  if (!domain) {
    await ctx.reply("No default wiki domain configured. Set one in Settings → AI & Knowledge.");
    return;
  }

  const results = searchArticles(domain, query);

  if (results.length === 0) {
    await ctx.reply(`No results for "${escapeHTML(query)}" in domain "${escapeHTML(domain)}".`);
    return;
  }

  const keyboard = new InlineKeyboard();
  const lines = [`<b>🔍 Search: "${escapeHTML(query)}"</b> in ${escapeHTML(domain)}\n`];

  for (const r of results.slice(0, 10)) {
    const score = Math.round(r.score * 100);
    lines.push(`• <b>${escapeHTML(r.title)}</b> (${score}%) — ${escapeHTML(r.snippet)}`);
    keyboard.text(r.title, `wiki:article:${domain}:${r.slug}`).row();
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function handleCompile(ctx: ReplyCtx, domain: string): Promise<void> {
  await ctx.reply(`⏳ Compiling wiki domain "${escapeHTML(domain)}"...`);
  await doCompile(ctx, domain);
}

async function doCompile(ctx: ReplyCtx, domain: string): Promise<void> {
  try {
    const result = await compileWiki({ domain });
    const lines = [
      `<b>✅ Compilation complete</b>`,
      `Domain: ${escapeHTML(domain)}`,
      `Articles written: ${result.articlesWritten.length}`,
      `Raw files processed: ${result.rawFilesProcessed.length}`,
      `Total tokens: ${result.totalTokens}`,
      `Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
    ];

    if (result.errors.length > 0) {
      lines.push(`\n⚠️ ${result.errors.length} error(s):`);
      for (const e of result.errors) {
        lines.push(`• ${escapeHTML(e.file)}: ${escapeHTML(e.error)}`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(`❌ Compilation failed: ${escapeHTML(String(err))}`);
  }
}

async function handleLint(ctx: ReplyCtx, domain: string): Promise<void> {
  try {
    const result = lintDomain(domain);

    if (result.issues.length === 0) {
      await ctx.reply(
        `<b>✅ Wiki lint clean</b>\n${escapeHTML(domain)}: ${result.articlesChecked} articles, ${result.rawFilesChecked} raw files — no issues.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const lines = [
      `<b>🔍 Wiki Lint: ${escapeHTML(domain)}</b>`,
      `${result.articlesChecked} articles, ${result.rawFilesChecked} raw files\n`,
    ];

    for (const issue of result.issues) {
      const icon = issue.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`${icon} <b>${escapeHTML(issue.target)}</b>: ${escapeHTML(issue.message)}`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(`❌ Lint failed: ${escapeHTML(String(err))}`);
  }
}
