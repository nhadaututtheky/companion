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

import { escapeHTML, shortModelName, modelStrength } from "../formatter.js";
import { createLogger } from "../../logger.js";
import type { TelegramBridge } from "../telegram-bridge.js";
import { getProject } from "../../services/project-profiles.js";
import { getSessionRecord } from "../../services/session-store.js";

const log = createLogger("telegram:panel");

// ─── Model options ───────────────────────────────────────────────────────────

const MODELS = [
  { label: "Opus 4.6", key: "o46", value: "claude-opus-4-6" },
  { label: "Sonnet 4.6", key: "s46", value: "claude-sonnet-4-6" },
  { label: "Haiku 4.5", key: "h45", value: "claude-haiku-4-5" },
  { label: "Opus 4.5", key: "o45", value: "claude-opus-4-5" },
  { label: "Sonnet 4.5", key: "s45", value: "claude-sonnet-4-5" },
];

const MODEL_KEY_MAP = new Map(MODELS.map((m) => [m.key, m.value]));

type BtnStyle = "success" | "danger" | "primary" | undefined;

function styledBtn(text: string, data: string, style?: BtnStyle) {
  return { text, callback_data: data, ...(style ? { style } : {}) };
}

function buildModelKeyboard(sessionId: string, currentModel: string, currentThinking: string) {
  const currentShort = shortModelName(currentModel);

  const modelButtons = MODELS.map((m) => {
    const isCurrent = currentShort === m.label;
    return styledBtn(
      `${m.label}${isCurrent ? " ✓" : ""}`,
      `pm:${m.key}:${sessionId}`,
      isCurrent ? "success" : undefined,
    );
  });

  const thinkButtons = (
    [
      { label: "Adaptive", value: "adaptive" },
      { label: "Off", value: "off" },
      { label: "Deep", value: "deep" },
    ] as const
  ).map((t) => {
    const isCurrent = currentThinking === t.value;
    return styledBtn(
      `${t.label}${isCurrent ? " ✓" : ""}`,
      `pt:${t.value}:${sessionId}`,
      isCurrent ? "success" : undefined,
    );
  });

  return {
    inline_keyboard: [
      modelButtons.slice(0, 3),
      modelButtons.slice(3),
      thinkButtons,
      [styledBtn("↩ Back", `panel:status:${sessionId}`)],
    ],
  };
}

// ─── Register ────────────────────────────────────────────────────────────────

export function registerPanelCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── Model selector ──────────────────────────────────────────────────────

  // ── Open model picker ────────────────────────────────────────────────────

  bot.callbackQuery(/^panel:model:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery();

    const session = bridge.wsBridge.getSession(sessionId);
    const currentModel = session?.state.model ?? "";
    const currentThinking = session?.state.thinking_mode ?? "adaptive";
    const strength = modelStrength(currentModel);
    const short = shortModelName(currentModel);

    const keyboard = buildModelKeyboard(sessionId, currentModel, currentThinking);
    const header = `<b>${escapeHTML(short)}</b>${strength ? ` — <i>${escapeHTML(strength)}</i>` : ""}`;

    try {
      await ctx.editMessageText(`${header}\n\nSelect model & thinking mode:`, {
        parse_mode: "HTML",
        reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
      });
    } catch (err) {
      log.error("Failed to show model picker", { sessionId, error: String(err) });
    }
  });

  // ── Model selected ──────────────────────────────────────────────────────

  bot.callbackQuery(/^pm:([^:]+):(.+)$/, async (ctx) => {
    const key = ctx.match[1]!;
    const sessionId = ctx.match[2]!;
    const model = MODEL_KEY_MAP.get(key) ?? key;
    await ctx.answerCallbackQuery(`Model: ${shortModelName(model)}`);

    bridge.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({ type: "set_model", model }));

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
      const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
        ?.message_thread_id;
      const mapping = bridge.getMapping(chatId, topicId);
      if (mapping) {
        const project = getProject(mapping.projectSlug);
        try {
          await bridge.sendSettingsPanel(
            chatId, topicId, sessionId,
            project?.name ?? mapping.projectSlug, model, messageId,
          );
        } catch (err) {
          log.error("Failed to refresh panel after model change", { sessionId, error: String(err) });
        }
      }
    }
  });

  // ── Thinking mode selected ──────────────────────────────────────────────

  bot.callbackQuery(/^pt:([^:]+):(.+)$/, async (ctx) => {
    const mode = ctx.match[1]! as "adaptive" | "off" | "deep";
    const sessionId = ctx.match[2]!;
    await ctx.answerCallbackQuery(`Thinking: ${mode}`);

    bridge.wsBridge.handleBrowserMessage(
      sessionId,
      JSON.stringify({ type: "set_thinking_mode", mode }),
    );

    const session = bridge.wsBridge.getSession(sessionId);
    const currentModel = session?.state.model ?? "";
    const strength = modelStrength(currentModel);
    const short = shortModelName(currentModel);

    const keyboard = buildModelKeyboard(sessionId, currentModel, mode);
    const header = `<b>${escapeHTML(short)}</b>${strength ? ` — <i>${escapeHTML(strength)}</i>` : ""}`;

    try {
      await ctx.editMessageText(`${header}\n\nSelect model & thinking mode:`, {
        parse_mode: "HTML",
        reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
      });
    } catch (err) {
      log.error("Failed to refresh model picker after thinking change", { sessionId, error: String(err) });
    }
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

  // ── Auto-approve timeout presets ─────────────────────────────────────────

  bot.callbackQuery(/^panel:aa:(off|15|30|60):(.+)$/, async (ctx) => {
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
    } else {
      const seconds = parseInt(preset, 10);
      // Preserve current allowBash setting when changing timeout
      const allowBash = session.autoApproveConfig.allowBash;
      session.autoApproveConfig = { enabled: true, timeoutSeconds: seconds, allowBash };
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

  // ── Auto-approve mode (safe vs full) ───────────────────────────────────

  bot.callbackQuery(/^panel:aamode:(safe|full|disabled):(.+)$/, async (ctx) => {
    const mode = ctx.match[1]!;
    const sessionId = ctx.match[2]!;

    if (mode === "disabled") {
      await ctx.answerCallbackQuery("Enable auto-approve first (pick a timeout)");
      return;
    }

    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found");
      return;
    }

    if (mode === "full") {
      session.autoApproveConfig = {
        ...session.autoApproveConfig,
        allowBash: true,
      };
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
      await ctx.answerCallbackQuery("⚠️ Full mode — all tools approved");
    } else {
      session.autoApproveConfig = {
        ...session.autoApproveConfig,
        allowBash: false,
      };
      await ctx.answerCallbackQuery("🛡 Safe mode — dangerous tools excluded");
    }

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

  // ── Idle warning actions (extend / let go) ──────────────────────────────

  bot.callbackQuery(/^panel:idle:extend:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found");
      await ctx.deleteMessage().catch(() => {});
      return;
    }

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;

    // Reset idle timer with current timeout (extends from now)
    if (chatId) {
      bridge.resetIdleTimer(sessionId, chatId, topicId);
    }

    await ctx.answerCallbackQuery("Session kept alive");
    await ctx.deleteMessage().catch(() => {});
  });

  bot.callbackQuery(/^panel:idle:letgo:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery("Stopping session...");

    bridge.killSession(sessionId);

    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    if (chatId) bridge.removeMapping(chatId, topicId);

    await ctx.editMessageText("⏹ Session stopped.").catch(() => {});
  });

  // ── Idle timeout presets ────────────────────────────────────────────────

  bot.callbackQuery(/^panel:idle:(\d+):(.+)$/, async (ctx) => {
    const seconds = parseInt(ctx.match[1]!, 10);
    const sessionId = ctx.match[2]!;
    const ms = seconds * 1000;

    bridge.setIdleTimeout(sessionId, ms);

    // Reset idle timer with new duration
    const chatId = ctx.chat?.id ?? ctx.callbackQuery.message?.chat.id;
    const topicId = (ctx.callbackQuery.message as { message_thread_id?: number })
      ?.message_thread_id;
    if (chatId) {
      bridge.resetIdleTimer(sessionId, chatId, topicId);
    }

    const label =
      ms <= 0
        ? "Auto-stop: Never"
        : ms < 3_600_000
          ? `Auto-stop: ${Math.round(ms / 60_000)}m idle`
          : `Auto-stop: ${Math.round(ms / 3_600_000)}h idle`;
    await ctx.answerCallbackQuery(label);

    // Refresh panel
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId && messageId) {
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

  // ── Context breakdown expand ────────────────────────────────────────────

  bot.callbackQuery(/^ctx:detail:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    await ctx.answerCallbackQuery();

    const detailed = (
      bridge as unknown as { contextBreakdowns: Map<string, string> }
    ).contextBreakdowns.get(sessionId);

    if (!detailed) {
      await ctx.editMessageText("Context breakdown no longer available.").catch(() => {});
      return;
    }

    await ctx.editMessageText(detailed, { parse_mode: "HTML" }).catch(() => {});
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
