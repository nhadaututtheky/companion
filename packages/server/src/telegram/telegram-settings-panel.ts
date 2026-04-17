/**
 * Telegram settings panel — builds and sends the inline settings panel.
 * Extracted from TelegramBridge to reduce god-file complexity.
 */

import { escapeHTML, shortModelName, modelStrength, statusEmoji } from "./formatter.js";
import { createLogger } from "../logger.js";
import { getMaxContextTokens, modelSupports1M } from "@companion/shared";
import type { TelegramBridge } from "./telegram-bridge.js";

const log = createLogger("telegram-settings-panel");

/** Build and send (or edit) the settings panel message. */
export async function sendSettingsPanel(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  projectName: string,
  model: string,
  editMessageId?: number,
): Promise<{ message_id: number } | undefined> {
  const session = bridge.wsBridge.getSession(sessionId);
  const cfg = bridge.getSessionConfig(sessionId);

  const status = session?.state.status ?? "starting";
  const cost = session?.state.total_cost_usd ?? 0;
  const turns = session?.state.num_turns ?? 0;
  const updatedAt = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const aa = session?.autoApproveConfig;
  const aaLabel = !aa?.enabled
    ? "Off"
    : `${aa.timeoutSeconds}s · ${aa.allowBash ? "⚠️ Full" : "🛡 Safe"}`;
  const idleMs = cfg.idleTimeoutMs;
  const idleLabel =
    idleMs <= 0
      ? "Never"
      : idleMs === 1_800_000
        ? "30m"
        : idleMs === 3_600_000
          ? "1h"
          : idleMs === 14_400_000
            ? "4h"
            : idleMs === 43_200_000
              ? "12h"
              : `${Math.round(idleMs / 60_000)}m`;
  const _permMode = session?.state.permissionMode ?? "default";

  // Context meter — uses cumulative tokens as rough estimate (actual window may be smaller after compaction)
  const state = session?.state;
  const contextMode = state?.context_mode ?? "200k";
  const supports1M = state ? modelSupports1M(state.model) : false;
  let contextStr = "";
  if (state) {
    const totalTokens =
      state.total_input_tokens + state.total_output_tokens + state.cache_read_tokens;
    if (totalTokens > 0) {
      const maxTokens = getMaxContextTokens(state.model, contextMode);
      const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
      const modeBadge = contextMode === "1m" ? " · 1M" : "";
      contextStr = ` · Tokens: ~${pct}%${modeBadge}`;
    }
  }

  // Short ID for @mention / #mention
  const shortId = session?.state.short_id;
  const shortIdStr = shortId ? ` · <code>#${escapeHTML(shortId)}</code>` : "";

  const thinkingMode = session?.state.thinking_mode ?? "adaptive";
  const thinkingLabel =
    thinkingMode === "adaptive" ? "⚡Adaptive" : thinkingMode === "off" ? "💤Off" : "🧠Deep";

  const modelShort = shortModelName(model);
  const strength = modelStrength(model);
  const strengthStr = strength ? ` · <i>${escapeHTML(strength)}</i>` : "";

  const text = [
    `<b>${escapeHTML(projectName)}</b> · <b>${escapeHTML(modelShort)}</b> · ${statusEmoji(status)} ${status}${shortIdStr}`,
    `$${cost.toFixed(4)} · ${turns} turns · Updated ${updatedAt}${contextStr}`,
    `${strengthStr ? `${strengthStr}\n` : ""}Auto-Approve: <b>${aaLabel}</b> · Auto-stop: <b>${idleLabel}</b> · Think: <b>${thinkingLabel}</b>`,
  ].join("\n");

  // Build keyboard with styled buttons (Telegram Bot API style field)
  type BtnStyle = "danger" | "success" | "primary" | undefined;
  const btn = (text: string, data: string, style?: BtnStyle) => ({
    text,
    callback_data: data,
    ...(style ? { style } : {}),
  });

  const aaOff = !aa?.enabled;
  const aa15 = aa?.enabled && aa.timeoutSeconds === 15;
  const aa30 = aa?.enabled && aa.timeoutSeconds === 30;
  const aa60 = aa?.enabled && aa.timeoutSeconds === 60;
  const aaEnabled = aa?.enabled ?? false;
  const aaBash = aaEnabled && (aa?.allowBash ?? false);

  const iNever = idleMs <= 0;
  const i30m = idleMs === 1_800_000;
  const i1h = idleMs === 3_600_000;
  const i4h = idleMs === 14_400_000;
  const i12h = idleMs === 43_200_000;

  const ctx200k = contextMode === "200k";
  const ctx1m = contextMode === "1m";

  const keyboard = {
    inline_keyboard: [
      // Row 1: Model + Status
      [
        btn(`Model: ${modelShort}`, `panel:model:${sessionId}`, "primary"),
        btn("Status", `panel:status:${sessionId}`),
      ],
      // Row 1b: Context window toggle (only if model supports 1M)
      ...(supports1M
        ? [
            [
              btn(
                `200K${ctx200k ? " ✓" : ""}`,
                `panel:ctx:200k:${sessionId}`,
                ctx200k ? "success" : undefined,
              ),
              btn(
                `1M${ctx1m ? " ✓" : ""}`,
                `panel:ctx:1m:${sessionId}`,
                ctx1m ? "success" : undefined,
              ),
            ],
          ]
        : []),
      // Row 2: Auto-approve timeout
      [
        btn(
          `Off${aaOff ? " ✓" : ""}`,
          `panel:aa:off:${sessionId}`,
          aaOff ? "success" : undefined,
        ),
        btn(`15s${aa15 ? " ✓" : ""}`, `panel:aa:15:${sessionId}`, aa15 ? "success" : undefined),
        btn(`30s${aa30 ? " ✓" : ""}`, `panel:aa:30:${sessionId}`, aa30 ? "success" : undefined),
        btn(`60s${aa60 ? " ✓" : ""}`, `panel:aa:60:${sessionId}`, aa60 ? "success" : undefined),
      ],
      // Row 3: Auto-approve mode (only meaningful when AA is enabled)
      [
        btn(
          `🛡 Safe${aaEnabled && !aaBash ? " ✓" : ""}`,
          aaEnabled ? `panel:aamode:safe:${sessionId}` : `panel:aamode:disabled:${sessionId}`,
          aaEnabled && !aaBash ? "success" : undefined,
        ),
        btn(
          `⚠️ Full${aaBash ? " ✓" : ""}`,
          aaEnabled ? `panel:aamode:full:${sessionId}` : `panel:aamode:disabled:${sessionId}`,
          aaBash ? "danger" : undefined,
        ),
      ],
      // Row 3: Idle timeout presets
      [
        btn(
          `Never${iNever ? " ✓" : ""}`,
          `panel:idle:0:${sessionId}`,
          iNever ? "success" : undefined,
        ),
        btn(
          `30m${i30m ? " ✓" : ""}`,
          `panel:idle:1800:${sessionId}`,
          i30m ? "success" : undefined,
        ),
        btn(`1h${i1h ? " ✓" : ""}`, `panel:idle:3600:${sessionId}`, i1h ? "success" : undefined),
        btn(`4h${i4h ? " ✓" : ""}`, `panel:idle:14400:${sessionId}`, i4h ? "success" : undefined),
        btn(
          `12h${i12h ? " ✓" : ""}`,
          `panel:idle:43200:${sessionId}`,
          i12h ? "success" : undefined,
        ),
      ],
      // Row 4: Actions
      [
        btn("📊 Context", `ctx:detail:${sessionId}`),
        btn("⏸ Pause", `panel:cancel:${sessionId}`),
        btn("Stop", `panel:stop:${sessionId}`, "danger"),
      ],
    ],
  };

  // Cast raw keyboard for grammY (style field not in grammY types yet)
  const replyMarkup = keyboard as unknown as import("grammy").InlineKeyboard;

  try {
    if (editMessageId) {
      await bridge.bot.api.editMessageText(chatId, editMessageId, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      return { message_id: editMessageId };
    } else {
      const sent = await bridge.bot.api.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
        message_thread_id: topicId,
      });
      return { message_id: sent.message_id };
    }
  } catch (err) {
    const errStr = String(err);
    // Silently ignore "message is not modified" — panel content unchanged
    if (!errStr.includes("message is not modified")) {
      log.error("Failed to send settings panel", { sessionId, error: errStr });
    }
    return undefined;
  }
}
