/**
 * Template commands: /templates, /template save, /template delete
 */

import { InlineKeyboard } from "grammy";
import { escapeHTML } from "../formatter.js";
import { createLogger } from "../../logger.js";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  findTemplateByIdPrefix,
} from "../../services/templates.js";
import type { TelegramBridge } from "../telegram-bridge.js";

const log = createLogger("cmd:template");

export function registerTemplateCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /templates or /t — Show template list as inline keyboard ────────────

  const handleTemplateList = async (ctx: import("grammy").Context) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;

    const topicId = ctx.message?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);
    const projectSlug = mapping?.projectSlug;

    const templates = listTemplates(projectSlug ?? undefined);

    if (templates.length === 0) {
      await ctx.reply(
        'No templates yet. Create one:\n<code>/template save "Name" Your prompt here</code>',
        { parse_mode: "HTML" },
      );
      return;
    }

    // Build 2-column grid
    type Btn = { text: string; callback_data: string };
    const rows: Btn[][] = [];
    for (let i = 0; i < templates.length; i += 2) {
      const row: Btn[] = [
        {
          text: `${templates[i]!.icon} ${templates[i]!.name}`,
          callback_data: `tpl:use:${templates[i]!.slug}`,
        },
      ];
      if (i + 1 < templates.length) {
        row.push({
          text: `${templates[i + 1]!.icon} ${templates[i + 1]!.name}`,
          callback_data: `tpl:use:${templates[i + 1]!.slug}`,
        });
      }
      rows.push(row);
    }

    const hasSession = !!mapping;
    const hint = hasSession
      ? "Tap a template to send its prompt to the active session."
      : "Tap a template to start a new session with its prompt.";

    await ctx.reply(`<b>📋 Templates</b>\n${hint}`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: rows },
    });
  };

  bot.command("templates", handleTemplateList);
  bot.command("t", handleTemplateList);

  // ── /template save "Name" prompt — quick create ─────────────────────────

  bot.command("template", async (ctx) => {
    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply(
        "<b>Template commands:</b>\n" +
          "• <code>/templates</code> — list templates\n" +
          '• <code>/template save "Name" prompt text</code> — create\n' +
          "• <code>/template delete name-slug</code> — delete",
        { parse_mode: "HTML" },
      );
      return;
    }

    // Parse subcommand
    const saveMatch = args.match(/^save\s+"([^"]+)"\s+(.+)$/s);
    const saveMatchSingle = !saveMatch ? args.match(/^save\s+(\S+)\s+(.+)$/s) : null;
    const deleteMatch = args.match(/^delete\s+(.+)$/);

    if (saveMatch || saveMatchSingle) {
      const name = saveMatch ? saveMatch[1]! : saveMatchSingle![1]!;
      const prompt = saveMatch ? saveMatch[2]! : saveMatchSingle![2]!;

      const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
      const projectSlug = mapping?.projectSlug === "quick" ? undefined : mapping?.projectSlug;

      try {
        const tpl = createTemplate({
          name,
          prompt: prompt.trim(),
          projectSlug: projectSlug ?? null,
          icon: "⚡",
        });
        const scope = tpl.projectSlug ? `project <b>${escapeHTML(tpl.projectSlug)}</b>` : "global";
        await ctx.reply(
          `✅ Template <b>${escapeHTML(tpl.name)}</b> created (${scope})\nSlug: <code>${escapeHTML(tpl.slug)}</code>`,
          { parse_mode: "HTML" },
        );
      } catch (err) {
        const msg = String(err);
        if (msg.includes("UNIQUE")) {
          await ctx.reply("⚠️ A template with that name already exists.");
        } else {
          log.error("Failed to create template", { error: msg });
          await ctx.reply("⚠️ Failed to create template.");
        }
      }
      return;
    }

    if (deleteMatch) {
      const slug = deleteMatch[1]!.trim();
      const tpl = getTemplate(slug);
      if (!tpl) {
        await ctx.reply(`Template <code>${escapeHTML(slug)}</code> not found.`, {
          parse_mode: "HTML",
        });
        return;
      }
      deleteTemplate(tpl.id);
      await ctx.reply(`🗑️ Template <b>${escapeHTML(tpl.name)}</b> deleted.`, {
        parse_mode: "HTML",
      });
      return;
    }

    await ctx.reply(
      "Unknown subcommand. Use:\n" +
        '<code>/template save "Name" prompt</code>\n' +
        "<code>/template delete slug</code>",
      { parse_mode: "HTML" },
    );
  });

  // ── Callback: tpl:use:{slug} — use a template ──────────────────────────

  bot.callbackQuery(/^tpl:use:(.+)$/, async (ctx) => {
    const slug = ctx.match[1]!;
    const tpl = getTemplate(slug);

    if (!tpl) {
      await ctx.answerCallbackQuery("Template not found");
      return;
    }

    await ctx.answerCallbackQuery(`Using ${tpl.name}...`);

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);

    if (mapping) {
      // Active session — send prompt directly
      const session = bridge.wsBridge.getSession(mapping.sessionId);
      if (session) {
        // Apply model override if specified
        if (tpl.model && tpl.model !== session.state.model) {
          bridge.wsBridge.handleBrowserMessage(
            mapping.sessionId,
            JSON.stringify({
              type: "set_model",
              model: tpl.model,
            }),
          );
        }
        bridge.wsBridge.sendUserMessage(mapping.sessionId, tpl.prompt, "telegram");
        await ctx
          .editMessageText(`${tpl.icon} <b>${escapeHTML(tpl.name)}</b> sent to session.`, {
            parse_mode: "HTML",
          })
          .catch(() => {});
        return;
      }
    }

    // No active session — need to start one
    // If template has a projectSlug, use that. Otherwise show project picker.
    if (tpl.projectSlug) {
      await ctx
        .editMessageText(`${tpl.icon} Starting <b>${escapeHTML(tpl.name)}</b> session...`, {
          parse_mode: "HTML",
        })
        .catch(() => {});
      await bridge.startSessionForChat(ctx, tpl.projectSlug, {
        initialPrompt: tpl.prompt,
        model: tpl.model ?? undefined,
        permissionMode: tpl.permissionMode ?? undefined,
      });
    } else {
      // Show project picker with template context
      const { listProjects } = await import("../../services/project-profiles.js");
      const projects = listProjects();

      if (projects.length === 0) {
        await ctx.editMessageText("No projects configured.").catch(() => {});
        return;
      }

      if (projects.length === 1) {
        await ctx
          .editMessageText(`${tpl.icon} Starting <b>${escapeHTML(tpl.name)}</b> session...`, {
            parse_mode: "HTML",
          })
          .catch(() => {});
        await bridge.startSessionForChat(ctx, projects[0]!.slug, {
          initialPrompt: tpl.prompt,
          model: tpl.model ?? undefined,
          permissionMode: tpl.permissionMode ?? undefined,
        });
        return;
      }

      // Multiple projects — let user pick (use short ID prefix to stay within 64-byte callback limit)
      const keyboard = new InlineKeyboard();
      const tplId = tpl.id.slice(0, 8);
      for (const p of projects) {
        keyboard.text(`📂 ${p.name}`, `tpl:p:${tplId}:${p.slug}`).row();
      }
      await ctx
        .editMessageText(`${tpl.icon} <b>${escapeHTML(tpl.name)}</b>\nSelect project:`, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        })
        .catch(() => {});
    }
  });

  // ── Callback: tpl:p:{templateIdPrefix}:{projectSlug} — start with template + project ──

  bot.callbackQuery(/^tpl:p:([^:]+):(.+)$/, async (ctx) => {
    const templateIdPrefix = ctx.match[1]!;
    const projectSlug = ctx.match[2]!;
    const tpl = findTemplateByIdPrefix(templateIdPrefix);

    if (!tpl) {
      await ctx.answerCallbackQuery("Template not found");
      return;
    }

    await ctx.answerCallbackQuery(`Starting ${tpl.name}...`);
    await ctx
      .editMessageText(
        `${tpl.icon} Starting <b>${escapeHTML(tpl.name)}</b> on <b>${escapeHTML(projectSlug)}</b>...`,
        { parse_mode: "HTML" },
      )
      .catch(() => {});

    await bridge.startSessionForChat(ctx, projectSlug, {
      initialPrompt: tpl.prompt,
      model: tpl.model ?? undefined,
      permissionMode: tpl.permissionMode ?? undefined,
    });
  });

  log.info("Template commands registered");
}
