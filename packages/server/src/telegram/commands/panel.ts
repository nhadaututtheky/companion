/**
 * Panel commands — Settings panel callbacks and resume/fresh flow.
 *
 * Callback patterns:
 *   panel:model:{sessionId}   → show model selection keyboard
 *   panel:status:{sessionId}  → refresh status info (edit panel)
 *   panel:aa:{timeout}:{sessionId} → set auto-approve (off|15|30|60|safe)
 *   panel:idle:{seconds}:{sessionId} → set idle timeout (0=never, 1800, 3600, 14400, 43200)
 *   panel:back:{sessionId}    → delete the settings message
 *   panel:cancel:{sessionId}  → interrupt Claude
 *   panel:stop:{sessionId}    → stop session with confirmation
 *   panel:stop:confirm:{sessionId} → confirmed stop
 *
 *   resume:{projectSlug}:{chatId} → resume with --resume <cliSessionId>
 *   fresh:{projectSlug}:{chatId}  → create new session (skip resume)
 */

import { InlineKeyboard } from "grammy";
import { escapeHTML } from "../formatter.js";
import type { TelegramBridge } from "../telegram-bridge.js";
import { getProject } from "../../services/project-profiles.js";
import { getSessionRecord } from "../../services/session-store.js";

// ─── Model options ───────────────────────────────────────────────────────────

const MODELS = [
  { label: "Sonnet", value: "claude-sonnet-4-6" },
  { label: "Opus", value: "claude-opus-4-6" },
  { label: "Haiku", value: "claude-haiku-4-5" },
];

// ─── Thinking mode options ──────────────────────────────────────────────────

const THINKING_MODES = [
  { label: "⚡ Adaptive", value: "adaptive" },
  { label: "💤 Off", value: "off" },
  { label: "🧠 Deep", value: "deep" },
] as const;

// ─── Register ────────────────────────────────────────────────────────────────

export function registerPanelCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── Model selector ──────────────────────────────────────────────────────

  bot.callbackQuery(/^panel:model:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery();

    const session = bridge.wsBridge.getSession(sessionId);
    const currentModel = session?.state.model ?? "";
    const currentThinking = session?.state.thinking_mode ?? "adaptive";

    const keyboard = new InlineKeyboard();
    // Model buttons
    for (const m of MODELS) {
      const checkmark = currentModel.includes(m.label.toLowerCase()) ? " ✓" : "";
      keyboard.text(`${m.label}${checkmark}`, `panel:setmodel:${m.value}:${sessionId}`).row();
    }
    // Thinking mode buttons (same row)
    for (const t of THINKING_MODES) {
      const checkmark = currentThinking === t.value ? " ✓" : "";
      keyboard.text(`${t.label}${checkmark}`, `panel:thinking:${t.value}:${sessionId}`);
    }
    keyboard.row();
    keyboard.text("↩ Back", `panel:status:${sessionId}`);

    await ctx
      .editMessageText("Select model & thinking mode:", { reply_markup: keyboard })
      .catch(() => {});
  });

  bot.callbackQuery(/^panel:setmodel:([^:]+):(.+)$/, async (ctx) => {
    const model = ctx.match[1]!;
    const sessionId = ctx.match[2]!;
    await ctx.answerCallbackQuery(`Model set to ${model}`);

    bridge.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({ type: "set_model", model }));

    // Refresh panel
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
      // Find mapping to get project info
      const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
        ?.message_thread_id;
      const mapping = bridge.getMapping(chatId, topicId);
      if (mapping) {
        const project = getProject(mapping.projectSlug);
        await bridge.sendSettingsPanel(
          chatId,
          topicId,
          sessionId,
          project?.name ?? mapping.projectSlug,
          model,
          messageId,
        );
      }
    }
  });

  // ── Thinking mode selector ──────────────────────────────────────────────

  bot.callbackQuery(/^panel:thinking:([^:]+):(.+)$/, async (ctx) => {
    const mode = ctx.match[1]! as "adaptive" | "off" | "deep";
    const sessionId = ctx.match[2]!;
    await ctx.answerCallbackQuery(`Thinking: ${mode}`);

    bridge.wsBridge.handleBrowserMessage(
      sessionId,
      JSON.stringify({ type: "set_thinking_mode", mode }),
    );

    // Refresh model+thinking keyboard
    const session = bridge.wsBridge.getSession(sessionId);
    const currentModel = session?.state.model ?? "";

    const keyboard = new InlineKeyboard();
    for (const m of MODELS) {
      const checkmark = currentModel.includes(m.label.toLowerCase()) ? " ✓" : "";
      keyboard.text(`${m.label}${checkmark}`, `panel:setmodel:${m.value}:${sessionId}`).row();
    }
    for (const t of THINKING_MODES) {
      const checkmark = mode === t.value ? " ✓" : "";
      keyboard.text(`${t.label}${checkmark}`, `panel:thinking:${t.value}:${sessionId}`);
    }
    keyboard.row();
    keyboard.text("↩ Back", `panel:status:${sessionId}`);

    await ctx
      .editMessageText("Select model & thinking mode:", { reply_markup: keyboard })
      .catch(() => {});
  });

  // ── Status refresh ──────────────────────────────────────────────────────

  bot.callbackQuery(/^panel:status:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Refreshed");

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (!chatId || !messageId) return;

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);
    if (!mapping) {
      await ctx.editMessageText("No active session.").catch(() => {});
      return;
    }

    const session = bridge.wsBridge.getSession(sessionId);
    const model = session?.state.model ?? mapping.model;
    const project = getProject(mapping.projectSlug);
    await bridge.sendSettingsPanel(
      chatId,
      topicId,
      sessionId,
      project?.name ?? mapping.projectSlug,
      model,
      messageId,
    );
  });

  // ── Auto-approve presets ────────────────────────────────────────────────

  bot.callbackQuery(/^panel:aa:(off|15|30|60|safe):(.+)$/, async (ctx) => {
    const preset = ctx.match[1]!;
    const sessionId = ctx.match[2]!;

    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found");
      return;
    }

    let label: string;
    if (preset === "off") {
      session.autoApproveConfig = { enabled: false, timeoutSeconds: 0, allowBash: false };
      label = "Auto-approve off";
    } else if (preset === "safe") {
      // Safe mode = auto-approve everything including bash, approve all pending
      session.autoApproveConfig = { enabled: true, timeoutSeconds: 0, allowBash: true };
      // Approve all pending permissions immediately
      for (const [reqId] of session.pendingPermissions) {
        bridge.wsBridge.handleBrowserMessage(
          sessionId,
          JSON.stringify({
            type: "permission_response",
            request_id: reqId,
            behavior: "allow",
          }),
        );
      }
      label = "Full auto-approve ON";
    } else {
      const seconds = parseInt(preset, 10);
      session.autoApproveConfig = { enabled: true, timeoutSeconds: seconds, allowBash: false };
      label = `Auto-approve ${seconds}s`;
    }

    await ctx.answerCallbackQuery(label);

    // Refresh panel
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
      const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
        ?.message_thread_id;
      const mapping = bridge.getMapping(chatId, topicId);
      const project = mapping ? getProject(mapping.projectSlug) : undefined;
      await bridge.sendSettingsPanel(
        chatId,
        topicId,
        sessionId,
        project?.name ?? mapping?.projectSlug ?? "",
        session.state.model,
        messageId,
      );
    }
  });

  // ── Idle timeout presets ────────────────────────────────────────────────

  bot.callbackQuery(/^panel:idle:(\d+):(.+)$/, async (ctx) => {
    const seconds = parseInt(ctx.match[1]!, 10);
    const sessionId = ctx.match[2]!;
    const ms = seconds * 1000;

    bridge.setIdleTimeout(sessionId, ms);

    const label =
      ms <= 0
        ? "Idle timeout: Never"
        : ms < 3_600_000
          ? `Idle timeout: ${Math.round(ms / 60_000)}m`
          : `Idle timeout: ${Math.round(ms / 3_600_000)}h`;
    await ctx.answerCallbackQuery(label);

    // Refresh panel
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
      const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
        ?.message_thread_id;
      const mapping = bridge.getMapping(chatId, topicId);
      const session = bridge.wsBridge.getSession(sessionId);
      const project = mapping ? getProject(mapping.projectSlug) : undefined;
      await bridge.sendSettingsPanel(
        chatId,
        topicId,
        sessionId,
        project?.name ?? mapping?.projectSlug ?? "",
        session?.state.model ?? mapping?.model ?? "",
        messageId,
      );
    }
  });

  // ── Back (dismiss panel) ────────────────────────────────────────────────

  bot.callbackQuery(/^panel:back:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => {});
  });

  // ── Cancel (interrupt Claude) ───────────────────────────────────────────

  bot.callbackQuery(/^panel:cancel:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Interrupting...");

    bridge.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({ type: "interrupt" }));

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
      await ctx.api
        .editMessageText(
          chatId,
          messageId,
          "⚠️ Claude interrupted. Type a new message to continue.",
        )
        .catch(() => {});
    }
  });

  // ── Stop session (confirm MUST be registered before generic stop) ────

  bot.callbackQuery(/^panel:stop:confirm:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Session stopped");

    bridge.killSession(sessionId);

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    if (chatId) bridge.removeMapping(chatId, topicId);

    await ctx.editMessageText("⏹ Session stopped.").catch(() => {});
  });

  bot.callbackQuery(/^panel:stop:([^:]+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery();

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ Confirm Stop",
            callback_data: `panel:stop:confirm:${sessionId}`,
            style: "danger" as const,
          },
          { text: "❌ Cancel", callback_data: `panel:status:${sessionId}` },
        ],
      ],
    };

    await ctx
      .editMessageText(
        `Stop session <code>${escapeHTML(sessionId.slice(0, 8))}</code>?\n\nThis will end the Claude session.`,
        {
          parse_mode: "HTML",
          reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
        },
      )
      .catch(() => {});
  });

  // ── /pin — Re-send and pin settings panel ─────────────────────────────

  bot.command("pin", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);

    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    const session = bridge.wsBridge.getSession(mapping.sessionId);
    if (!session) {
      await ctx.reply("Session ended.");
      return;
    }

    const project = getProject(mapping.projectSlug);
    const panelMsg = await bridge.sendSettingsPanel(
      chatId,
      topicId,
      mapping.sessionId,
      project?.name ?? mapping.projectSlug,
      session.state.model,
    );

    if (panelMsg) {
      bridge.setSessionPanelMessageId(mapping.sessionId, panelMsg.message_id);
      // Try to pin the message (may fail if bot lacks pin permissions)
      try {
        await ctx.api.pinChatMessage(chatId, panelMsg.message_id, { disable_notification: true });
      } catch {
        // Silently ignore — bot may not have pin permissions
      }
    }
  });

  // ── Quick action buttons callback ─────────────────────────────────────

  bot.callbackQuery(/^quick:tpl:(.+)$/, async (ctx) => {
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    const mapping = bridge.getMapping(chatId, topicId);
    if (!mapping) {
      await ctx.answerCallbackQuery("No active session.");
      return;
    }

    await ctx.answerCallbackQuery("Opening templates...");
    await ctx.deleteMessage().catch(() => {});

    // Import listTemplates dynamically to avoid circular deps
    const { listTemplates } = await import("../../services/templates.js");
    const templates = listTemplates(mapping.projectSlug);

    if (templates.length === 0) {
      await ctx.api.sendMessage(chatId, "No templates. Use /template save to create one.", {
        message_thread_id: topicId,
      });
      return;
    }

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

    await ctx.api.sendMessage(chatId, "<b>📋 Templates</b>\nTap to send prompt:", {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: rows },
      message_thread_id: topicId,
    });
  });

  bot.callbackQuery(/^quick:aa30:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Auto-approve 30s enabled");

    const session = bridge.wsBridge.getSession(sessionId);
    if (session) {
      session.autoApproveConfig = { enabled: true, timeoutSeconds: 30, allowBash: false };
    }

    await ctx.deleteMessage().catch(() => {});
  });

  bot.callbackQuery(/^quick:pin:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    await ctx.deleteMessage().catch(() => {});

    // Pin the existing panel message instead of creating a new one
    const cfg = bridge.getSessionConfig(sessionId);
    if (cfg.panelMessageId) {
      try {
        await ctx.api.pinChatMessage(chatId, cfg.panelMessageId, { disable_notification: true });
        await ctx.answerCallbackQuery("Panel pinned");
      } catch {
        await ctx.answerCallbackQuery("Cannot pin — missing permission");
      }
    } else {
      await ctx.answerCallbackQuery("No panel to pin");
    }
  });

  // ── Resume / Start Fresh flow ───────────────────────────────────────────

  bot.callbackQuery(/^resume:([^:]+):(-?\d+)$/, async (ctx) => {
    const projectSlug = ctx.match[1]!;
    const chatId = parseInt(ctx.match[2]!, 10);

    await ctx.answerCallbackQuery("Resuming session...");

    // Find dead session for this chat+project
    const dead = bridge.getDeadSessionByProject(chatId, projectSlug);
    if (!dead) {
      await ctx.editMessageText("No resumable session found. Starting fresh...").catch(() => {});
      await bridge.startSessionForChat(ctx, projectSlug);
      return;
    }

    await ctx
      .editMessageText(
        `Resuming session <code>${escapeHTML(dead.cliSessionId.slice(0, 8))}</code>...`,
        {
          parse_mode: "HTML",
        },
      )
      .catch(() => {});

    // Resume into the ORIGINAL topicId where the session died
    await bridge.startSessionForChat(ctx, projectSlug, {
      resume: true,
      cliSessionId: dead.cliSessionId,
    });

    // Clear dead session entry
    bridge.clearDeadSessionByProject(chatId, projectSlug);
  });

  // ── Resume by session ID (from /resume search results) ─────────────────

  bot.callbackQuery(/^resume_id:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Resuming session...");

    const record = getSessionRecord(sessionId);
    if (!record || !record.cliSessionId) {
      await ctx.editMessageText("Session no longer resumable.").catch(() => {});
      return;
    }

    await ctx
      .editMessageText(
        `Resuming session <code>${escapeHTML(record.cliSessionId.slice(0, 8))}</code>...`,
        { parse_mode: "HTML" },
      )
      .catch(() => {});

    await bridge.startSessionForChat(ctx, record.projectSlug ?? "quick", {
      resume: true,
      cliSessionId: record.cliSessionId,
    });
  });

  bot.callbackQuery(/^fresh:([^:]+):(-?\d+)$/, async (ctx) => {
    const projectSlug = ctx.match[1]!;
    const chatId = parseInt(ctx.match[2]!, 10);

    await ctx.answerCallbackQuery("Starting fresh session...");
    await ctx.editMessageText("Starting new session...").catch(() => {});

    // Clear dead session if any
    bridge.clearDeadSessionByProject(chatId, projectSlug);

    await bridge.startSessionForChat(ctx, projectSlug);
  });
}
