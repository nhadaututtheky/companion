/**
 * Control commands: /allow, /deny, /exitplan, /cancel, /compact
 */

import type { TelegramBridge } from "../telegram-bridge.js";
import { isPermissionDangerous } from "../formatter.js";
import type { PermissionRequest } from "@companion/shared";

export function registerControlCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // ── /allow — Allow pending permission ─────────────────────────────────

  bot.command("allow", async (ctx) => {
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

    // Allow all pending permissions
    const pending = [...session.pendingPermissions.keys()];
    if (pending.length === 0) {
      await ctx.reply("No pending permissions.");
      return;
    }

    bridge.cancelAllAutoApproveCountdowns();

    for (const requestId of pending) {
      bridge.wsBridge.handleBrowserMessage(
        mapping.sessionId,
        JSON.stringify({
          type: "permission_response",
          request_id: requestId,
          behavior: "allow",
        }),
      );
    }

    await ctx.reply(`✅ Allowed ${pending.length} permission(s)`);
  });

  // ── /deny — Deny pending permission ───────────────────────────────────

  bot.command("deny", async (ctx) => {
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

    const pending = [...session.pendingPermissions.keys()];
    if (pending.length === 0) {
      await ctx.reply("No pending permissions.");
      return;
    }

    bridge.cancelAllAutoApproveCountdowns();

    for (const requestId of pending) {
      bridge.wsBridge.handleBrowserMessage(
        mapping.sessionId,
        JSON.stringify({
          type: "permission_response",
          request_id: requestId,
          behavior: "deny",
        }),
      );
    }

    await ctx.reply(`❌ Denied ${pending.length} permission(s)`);
  });

  // ── /exitplan — Force exit plan mode ──────────────────────────────────

  bot.command("exitplan", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    // Send both interrupt + exitplan combo for maximum effect
    bridge.wsBridge.sendUserMessage(mapping.sessionId, "/exitplan", "telegram");

    // Also send interrupt
    bridge.wsBridge.handleBrowserMessage(
      mapping.sessionId,
      JSON.stringify({
        type: "interrupt",
      }),
    );

    await ctx.reply("🔄 Sent exitplan + interrupt to session");
  });

  // ── /cancel — Cancel current operation ────────────────────────────────

  bot.command("cancel", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    bridge.wsBridge.handleBrowserMessage(
      mapping.sessionId,
      JSON.stringify({
        type: "interrupt",
      }),
    );

    await ctx.reply("⚡ Interrupt sent");
  });

  // ── /compact — Compact context window ─────────────────────────────────

  bot.command("compact", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    bridge.wsBridge.sendUserMessage(mapping.sessionId, "/compact", "telegram");
    await ctx.reply("📦 Compacting context...");
  });

  // ── /clear — Reset context (clear conversation, keep session) ─────────

  bot.command("clear", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    bridge.wsBridge.sendUserMessage(mapping.sessionId, "/clear", "telegram");
    await ctx.reply("🧹 Context cleared — session continues with fresh conversation.");
  });

  // ── Permission callback queries ───────────────────────────────────────

  bot.callbackQuery(/^perm:(allow|deny):(.+):(.+)$/, async (ctx) => {
    const behavior = ctx.match[1] as "allow" | "deny";
    const sessionId = ctx.match[2]!;
    const requestId = ctx.match[3]!;

    // Cancel auto-approve countdown for this message if active
    const msgId = ctx.callbackQuery.message?.message_id;
    if (msgId !== undefined) {
      bridge.cancelAutoApproveCountdown(msgId);
    }

    bridge.wsBridge.handleBrowserMessage(
      sessionId,
      JSON.stringify({
        type: "permission_response",
        request_id: requestId,
        behavior,
      }),
    );

    const emoji = behavior === "allow" ? "✅" : "❌";
    await ctx.answerCallbackQuery(`${emoji} ${behavior === "allow" ? "Allowed" : "Denied"}`);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  });

  // ── perm:allowsafe — Approve only non-dangerous pending permissions ────────

  bot.callbackQuery(/^perm:allowsafe:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;

    const msgId = ctx.callbackQuery.message?.message_id;
    if (msgId !== undefined) {
      bridge.cancelAutoApproveCountdown(msgId);
    }

    const session = bridge.wsBridge.getSession(sessionId);
    if (!session) {
      await ctx.answerCallbackQuery("Session not found.");
      return;
    }

    const allPending = [...session.pendingPermissions.entries()] as [string, PermissionRequest][];
    const safeEntries = allPending.filter(
      ([, perm]) => !isPermissionDangerous(perm.tool_name, perm.input),
    );

    if (safeEntries.length === 0) {
      await ctx.answerCallbackQuery("No safe permissions pending.");
      return;
    }

    for (const [requestId] of safeEntries) {
      bridge.wsBridge.handleBrowserMessage(
        sessionId,
        JSON.stringify({
          type: "permission_response",
          request_id: requestId,
          behavior: "allow",
        }),
      );
    }

    const remaining = allPending.length - safeEntries.length;
    await ctx.answerCallbackQuery(`✅ Allowed ${safeEntries.length} safe permission(s)`);
    if (remaining === 0) {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    } else {
      // Keep message — dangerous ones still need individual review
      await ctx
        .editMessageText(
          (ctx.callbackQuery.message?.text ?? "") +
            `\n\n⚠️ <b>${remaining} dangerous permission(s) still pending — use Allow/Deny above.</b>`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
    }
  });

  // ── perm:reviewdanger — Inform user dangerous items need individual review ─

  bot.callbackQuery(/^perm:reviewdanger:(.+)$/, async (ctx) => {
    const sessionId = ctx.match[1]!;
    const session = bridge.wsBridge.getSession(sessionId);

    const dangerCount = session
      ? ([...session.pendingPermissions.values()] as PermissionRequest[]).filter((p) =>
          isPermissionDangerous(p.tool_name, p.input),
        ).length
      : 0;

    const alertText =
      dangerCount > 0
        ? `⚠️ ${dangerCount} dangerous permission(s) — use Allow/Deny buttons per item above.`
        : "No dangerous permissions pending.";
    await ctx.api.answerCallbackQuery(ctx.callbackQuery.id, {
      text: alertText,
      show_alert: true,
    });
  });
}
