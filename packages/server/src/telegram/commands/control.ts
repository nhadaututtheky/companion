/**
 * Control commands: /allow, /deny, /exitplan, /cancel, /compact
 */

import type { TelegramBridge } from "../telegram-bridge.js";

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
      bridge.wsBridge.handleBrowserMessage(mapping.sessionId, JSON.stringify({
        type: "permission_response",
        request_id: requestId,
        behavior: "allow",
      }));
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
      bridge.wsBridge.handleBrowserMessage(mapping.sessionId, JSON.stringify({
        type: "permission_response",
        request_id: requestId,
        behavior: "deny",
      }));
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
    bridge.wsBridge.handleBrowserMessage(mapping.sessionId, JSON.stringify({
      type: "interrupt",
    }));

    await ctx.reply("🔄 Sent exitplan + interrupt to session");
  });

  // ── /cancel — Cancel current operation ────────────────────────────────

  bot.command("cancel", async (ctx) => {
    const mapping = bridge.getMapping(ctx.chat.id, ctx.message?.message_thread_id);
    if (!mapping) {
      await ctx.reply("No active session.");
      return;
    }

    bridge.wsBridge.handleBrowserMessage(mapping.sessionId, JSON.stringify({
      type: "interrupt",
    }));

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

    bridge.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({
      type: "permission_response",
      request_id: requestId,
      behavior,
    }));

    const emoji = behavior === "allow" ? "✅" : "❌";
    await ctx.answerCallbackQuery(`${emoji} ${behavior === "allow" ? "Allowed" : "Denied"}`);
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  });
}
