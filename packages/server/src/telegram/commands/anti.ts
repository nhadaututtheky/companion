/**
 * Anti commands — Antigravity/Cursor IDE remote control via CDP.
 * /anti — Show control panel with inline buttons
 * /anti <subcommand> — Route to handler
 * /anti <text> — Send as chat message to IDE
 */

import type { TelegramBridge } from "../telegram-bridge.js";
import * as antiCdp from "../../services/anti-cdp.js";
import {
  startChatWatcher,
  stopChatWatcher,
  isChatWatcherRunning,
} from "../../services/anti-chat-watcher.js";
import {
  startTaskWatcher,
  stopTaskWatcher,
  isWatcherRunning,
} from "../../services/anti-task-watcher.js";
import { createLogger } from "../../logger.js";

const _log = createLogger("anti-commands");

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Subcommand routing table ──────────────────────────────────────────

type SubHandler = (bridge: TelegramBridge, chatId: number, topicId: number, args: string) => Promise<void>;

const SUBCOMMANDS: Record<string, SubHandler> = {
  accept:     handleAccept,
  reject:     handleReject,
  run:        handleRun,
  new:        handleNewConversation,
  ss:         handleScreenshot,
  screenshot: handleScreenshot,
  tasks:      handleTasks,
  watch:      handleTaskWatch,
  pending:    handlePending,
  sessions:   handleSessions,
  perm:       handlePerm,
  status:     handleStatus,
};

// ── Register /anti command ──────────────────────────────────────────────

export function registerAntiCommands(bridge: TelegramBridge): void {
  const bot = bridge.bot;

  // /anti — Main entry point
  bot.command("anti", async (ctx) => {
    const chatId = ctx.chat.id;
    const topicId = ctx.message?.message_thread_id ?? 0;
    const args = ctx.match?.trim() ?? "";

    if (!args) {
      await showAntiPanel(bridge, chatId, topicId);
      return;
    }

    // Check for subcommand
    const spaceIdx = args.indexOf(" ");
    const cmd = (spaceIdx === -1 ? args : args.slice(0, spaceIdx)).toLowerCase();
    const subArgs = spaceIdx === -1 ? "" : args.slice(spaceIdx + 1);

    const handler = SUBCOMMANDS[cmd];
    if (handler) {
      await handler(bridge, chatId, topicId, subArgs);
      return;
    }

    // Not a subcommand → send as chat message to IDE
    const result = await antiCdp.sendChatMessage(args);
    if (result.success) {
      await bridge.sendToChat(chatId, `➡️ <i>${escapeHtml(args.slice(0, 200))}</i>`, topicId);
    } else {
      await bridge.sendToChat(chatId, `⚠️ ${escapeHtml(result.detail)}`, topicId);
    }
  });

  // Callback query handlers for inline buttons
  bot.callbackQuery(/^anti_cmd:(.+)$/, async (ctx) => {
    const cmd = ctx.match![1]!;
    const chatId = ctx.chat!.id;
    const topicId = ctx.callbackQuery.message?.message_thread_id ?? 0;
    await ctx.answerCallbackQuery();

    const handler = SUBCOMMANDS[cmd];
    if (handler) {
      await handler(bridge, chatId, topicId, "");
    }
  });

  bot.callbackQuery(/^anti_perm:(.+)$/, async (ctx) => {
    const action = ctx.match![1]!;
    const chatId = ctx.chat!.id;
    await ctx.answerCallbackQuery(`Sending: ${action}`);

    const result = await antiCdp.respondPermission(action);
    const icon = result.success ? "✅" : "⚠️";
    await bridge.sendToChat(chatId, `${icon} ${escapeHtml(result.detail)}`);
  });

  bot.callbackQuery("anti_toggle:on", async (ctx) => {
    const chatId = ctx.chat!.id;
    const topicId = ctx.callbackQuery.message?.message_thread_id ?? 0;
    await ctx.answerCallbackQuery("Connecting...");
    await showAntiPanel(bridge, chatId, topicId);
  });

  bot.callbackQuery("anti_toggle:off", async (ctx) => {
    const chatId = ctx.chat!.id;
    const topicId = ctx.callbackQuery.message?.message_thread_id ?? 0;
    await ctx.answerCallbackQuery("Disconnected");

    if (bridge.isAntiMode(chatId, topicId)) {
      bridge.toggleAntiMode(chatId, topicId);
    }
    stopChatWatcher();
    stopTaskWatcher();
    await bridge.sendToChat(chatId, "🔴 <b>Anti Mode OFF</b>", topicId);
  });

  bot.callbackQuery(/^anti_cmd:watch_(on|off)$/, async (ctx) => {
    const action = ctx.match![1]!;
    const chatId = ctx.chat!.id;
    const topicId = ctx.callbackQuery.message?.message_thread_id ?? 0;
    await ctx.answerCallbackQuery();

    if (action === "on") {
      startTaskWatcher(bridge, chatId, topicId);
      await bridge.sendToChat(chatId, "👁️ Task watcher <b>ON</b> — polling every 15s.", topicId);
    } else {
      stopTaskWatcher();
      await bridge.sendToChat(chatId, "👁️ Task watcher <b>OFF</b>.", topicId);
    }
  });

  bot.callbackQuery(/^anti_session:(\d+)$/, async (ctx) => {
    const idx = parseInt(ctx.match![1]!, 10);
    await ctx.answerCallbackQuery(`Selecting session ${idx + 1}...`);

    const result = await antiCdp.selectAntiSession(idx);
    const chatId = ctx.chat!.id;
    const topicId = ctx.callbackQuery.message?.message_thread_id ?? 0;
    await bridge.sendToChat(
      chatId,
      result.success ? `✅ ${escapeHtml(result.detail)}` : `⚠️ ${escapeHtml(result.detail)}`,
      topicId,
    );
  });
}

// ── Panel ──────────────────────────────────────────────────────────────

async function showAntiPanel(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const available = await antiCdp.isAntiAvailable();
  if (!available) {
    await bridge.sendToChat(
      chatId,
      "⚠️ <b>Anti CDP not available.</b>\nStart Antigravity/Cursor with remote debugging enabled.",
      topicId,
    );
    return;
  }

  // Enable anti mode + start chat watcher
  if (!bridge.isAntiMode(chatId, topicId)) {
    bridge.toggleAntiMode(chatId, topicId);
  }
  if (!isChatWatcherRunning()) {
    startChatWatcher(bridge, chatId, topicId);
  }

  const watchIcon = isWatcherRunning() ? "🟢" : "⚪";
  const panelText = [
    `🟢 <b>Anti Mode ON</b>`,
    `${watchIcon} Watch: ${isWatcherRunning() ? "On" : "Off"}`,
    "",
    "Messages sent here will be forwarded to the IDE.",
  ].join("\n");

  const buttons = [
    [
      { text: "➕ New Chat", callback_data: "anti_cmd:new" },
      { text: "📸 Screenshot", callback_data: "anti_cmd:ss" },
    ],
    [
      { text: "📋 Tasks", callback_data: "anti_cmd:tasks" },
      { text: "📂 Sessions", callback_data: "anti_cmd:sessions" },
      { text: "🔐 Perms", callback_data: "anti_cmd:perm" },
    ],
    [
      { text: `${watchIcon} Watch ${isWatcherRunning() ? "Off" : "On"}`, callback_data: `anti_cmd:watch_${isWatcherRunning() ? "off" : "on"}` },
      { text: "📊 Status", callback_data: "anti_cmd:status" },
    ],
    [
      { text: "🔴 Disconnect", callback_data: "anti_toggle:off" },
    ],
  ];

  const msgId = await bridge.sendToChatWithKeyboard(chatId, panelText, { inline_keyboard: buttons }, topicId);
  await bridge.pinMessage(chatId, msgId);
}

// ── Subcommand handlers ────────────────────────────────────────────────

async function handleAccept(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.acceptDiffReview();
  await bridge.sendToChat(chatId, result.success ? `✅ ${result.detail}` : `⚠️ ${result.detail}`, topicId);
}

async function handleReject(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.rejectDiffReview();
  await bridge.sendToChat(chatId, result.success ? `❌ ${result.detail}` : `⚠️ ${result.detail}`, topicId);
}

async function handleRun(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.sendRun();
  await bridge.sendToChat(chatId, result.success ? "▶️ Running" : `⚠️ ${result.detail}`, topicId);
}

async function handleNewConversation(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.startNewConversation();
  await bridge.sendToChat(chatId, result.success ? "➕ New conversation started." : `⚠️ ${result.detail}`, topicId);
}

async function handleScreenshot(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.captureScreenshot();
  if (!result.success || !result.data) {
    await bridge.sendToChat(chatId, `⚠️ ${escapeHtml(result.detail)}`, topicId);
    return;
  }

  const photoBuffer = Buffer.from(result.data, "base64");
  const caption = `📸 <b>IDE Screenshot</b>\n<i>${escapeHtml(result.detail)}</i>`;

  try {
    await bridge.getAPI().sendPhoto(chatId, new InputFile(photoBuffer, "screenshot.png"), {
      caption,
      parse_mode: "HTML",
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
  } catch {
    await bridge.sendToChat(chatId, `⚠️ Failed to send screenshot.`, topicId);
  }
}

async function handleTasks(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.getTaskList();
  if (!result.success) {
    await bridge.sendToChat(chatId, `⚠️ ${escapeHtml(result.detail)}`, topicId);
    return;
  }

  if (result.tasks.length === 0) {
    await bridge.sendToChat(chatId, "📋 No tasks found.", topicId);
    return;
  }

  const lines = result.tasks.map((t) =>
    t.checked ? `✅ <s>${escapeHtml(t.text)}</s>` : `⬜ ${escapeHtml(t.text)}`
  );
  const done = result.tasks.filter((t) => t.checked).length;
  await bridge.sendToChat(
    chatId,
    `📋 <b>Tasks</b> (${done}/${result.tasks.length})\n${lines.join("\n")}`,
    topicId,
  );
}

async function handleTaskWatch(bridge: TelegramBridge, chatId: number, topicId: number, args: string): Promise<void> {
  const arg = args.trim().toLowerCase();

  if (arg === "on" || (!arg && !isWatcherRunning())) {
    startTaskWatcher(bridge, chatId, topicId);
    await bridge.sendToChat(chatId, "👁️ Task watcher <b>ON</b> — polling every 15s.", topicId);
  } else {
    stopTaskWatcher();
    await bridge.sendToChat(chatId, "👁️ Task watcher <b>OFF</b>.", topicId);
  }
}

async function handlePending(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.getInboxPending();
  if (!result.success) {
    await bridge.sendToChat(chatId, `⚠️ ${escapeHtml(result.detail)}`, topicId);
    return;
  }

  if (result.items.length === 0) {
    await bridge.sendToChat(chatId, "📭 No pending conversations.", topicId);
    return;
  }

  const lines = result.items.map((item, i) => `${i + 1}. ${escapeHtml(item.title)}`);
  await bridge.sendToChat(chatId, `📂 <b>Pending</b> (${result.items.length})\n${lines.join("\n")}`, topicId);
}

async function handleSessions(bridge: TelegramBridge, chatId: number, topicId: number, args: string): Promise<void> {
  // If args is a number, select that session
  const idx = parseInt(args.trim(), 10);
  if (!isNaN(idx) && idx > 0) {
    const result = await antiCdp.selectAntiSession(idx - 1);
    await bridge.sendToChat(chatId, result.success ? `✅ ${result.detail}` : `⚠️ ${result.detail}`, topicId);
    return;
  }

  const result = await antiCdp.listAntiSessions();
  if (!result.success) {
    await bridge.sendToChat(chatId, `⚠️ ${escapeHtml(result.detail)}`, topicId);
    return;
  }

  if (result.sessions.length === 0) {
    await bridge.sendToChat(chatId, "📭 No sessions found.", topicId);
    return;
  }

  // Build inline keyboard
  const keyboard = result.sessions.slice(0, 8).map((s) => [{
    text: s.age ? `${s.title.slice(0, 30)} (${s.age})` : s.title.slice(0, 35),
    callback_data: `anti_session:${s.index}`,
  }]);

  await bridge.sendToChatWithKeyboard(
    chatId,
    `📂 <b>IDE Sessions</b> (${result.sessions.length})\n\nSelect to resume:`,
    { inline_keyboard: keyboard },
    topicId,
  );
}

async function handlePerm(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const result = await antiCdp.detectPermissions();
  if (!result.success || result.permissions.length === 0) {
    await bridge.sendToChat(
      chatId,
      result.success ? "✅ No pending permissions." : `⚠️ ${result.detail}`,
      topicId,
    );
    return;
  }

  for (const perm of result.permissions) {
    const promptText = perm.text.length > 200 ? perm.text.slice(0, 200) + "..." : perm.text;
    const kb = [
      [
        { text: "🚫 Deny", callback_data: "anti_perm:deny" },
        { text: "✅ Allow", callback_data: "anti_perm:allow" },
      ],
    ];
    await bridge.sendToChatWithKeyboard(
      chatId,
      `🔐 <b>Permission</b>\n${escapeHtml(promptText)}`,
      { inline_keyboard: kb },
      topicId,
    );
  }
}

async function handleStatus(bridge: TelegramBridge, chatId: number, topicId: number): Promise<void> {
  const available = await antiCdp.isAntiAvailable();
  const watcherOn = isWatcherRunning();
  const chatWatcherOn = isChatWatcherRunning();

  const lines = [
    `📊 <b>Anti Status</b>`,
    `CDP: ${available ? "🟢 Connected" : "🔴 Disconnected"}`,
    `Chat Watcher: ${chatWatcherOn ? "🟢 Running" : "⚪ Stopped"}`,
    `Task Watcher: ${watcherOn ? "🟢 Running" : "⚪ Stopped"}`,
  ];

  if (available) {
    try {
      const status = await antiCdp.getAntiStatus();
      if (status.model) lines.push(`Model: <code>${escapeHtml(status.model)}</code>`);
      if (status.mode) lines.push(`Mode: <code>${escapeHtml(status.mode)}</code>`);
    } catch { /* ignore */ }
  }

  await bridge.sendToChat(chatId, lines.join("\n"), topicId);
}

// ── InputFile helper for grammY ────────────────────────────────────────
import { InputFile } from "grammy";
