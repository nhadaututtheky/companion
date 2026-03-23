/**
 * Anti Chat Watcher — polls Anti IDE chat via CDP and forwards new messages to Telegram.
 * Runs automatically when Anti mode is ON.
 * Also detects permission requests and shows Run/Reject buttons.
 *
 * Ported from MyTrend with adapted imports for Companion.
 */

import * as antiCdp from "./anti-cdp.js";
import type { TelegramBridge } from "../telegram/telegram-bridge.js";
import { createLogger } from "../logger.js";
import { getSettingInt, getSettingBool } from "./settings-helpers.js";

const log = createLogger("anti-chat-watcher");

const DEFAULT_POLL_INTERVAL_MS = 1_500;
const MAX_FAILURES = 10;

interface WatcherState {
  interval: ReturnType<typeof setInterval>;
  chatId: number;
  topicId: number;
  /** Fingerprints of all messages we've already seen — stable across re-renders/scroll */
  seenFingerprints: Set<string>;
  /** Legacy index fallback (used only if fingerprints are empty) */
  lastSeenIndex: number;
  polling: boolean;
  failures: number;
  /** Track the last permission text we sent buttons for (avoid duplicates) */
  lastPermText: string;
  /** Pending auto-approve timer */
  autoApproveTimer: ReturnType<typeof setTimeout> | null;
}

let state: WatcherState | null = null;

export function isChatWatcherRunning(): boolean {
  return state !== null;
}

export function startChatWatcher(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number,
): void {
  if (state) stopChatWatcher();

  const pollMs = getSettingInt("anti.chatPollInterval", DEFAULT_POLL_INTERVAL_MS);
  state = {
    interval: setInterval(() => pollChat(bridge), pollMs),
    chatId,
    topicId,
    seenFingerprints: new Set(),
    lastSeenIndex: -1,
    polling: false,
    failures: 0,
    lastPermText: "",
    autoApproveTimer: null,
  };

  log.info("Chat watcher started", { chatId, topicId });
}

export function stopChatWatcher(): void {
  if (!state) return;
  clearInterval(state.interval);
  if (state.autoApproveTimer) clearTimeout(state.autoApproveTimer);
  log.info("Chat watcher stopped", { chatId: state.chatId });
  state = null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function pollChat(bridge: TelegramBridge): Promise<void> {
  if (!state || state.polling) return;
  state.polling = true;

  try {
    // Run chat poll + permission detection in PARALLEL (both use cached findAllPages)
    const [chatResult, permResult] = await Promise.all([
      antiCdp.getChatMessages(state.lastSeenIndex, state.seenFingerprints),
      antiCdp.detectPermissions(),
    ]);

    // ── Handle chat messages ──
    if (chatResult.success) {
      state.failures = 0;

      for (const msg of chatResult.messages) {
        if (msg.fingerprint) {
          state.seenFingerprints.add(msg.fingerprint);
        }

        // Skip user messages (sent FROM Telegram, no need to echo back)
        if (msg.role === "user") {
          state.lastSeenIndex = Math.max(state.lastSeenIndex, msg.index);
          continue;
        }

        const icon = msg.role === "assistant" ? "🤖" : "ℹ️";
        const preview = msg.text.length > 3000 ? msg.text.slice(0, 3000) + "..." : msg.text;
        // Fire-and-forget — don't block the loop waiting for TG API
        bridge.sendToChat(
          state.chatId,
          `${icon} <b>Anti</b>\n${escapeHtml(preview)}`,
          state.topicId,
        ).catch((err) => {
          log.error("TG send failed", { error: String(err) });
        });
        state.lastSeenIndex = Math.max(state.lastSeenIndex, msg.index);
      }

      // Cap fingerprint set to prevent memory leak
      if (state.seenFingerprints.size > 500) {
        const arr = [...state.seenFingerprints];
        state.seenFingerprints = new Set(arr.slice(-300));
      }
    } else {
      state.failures++;
      log.warn("poll failed", { failures: state.failures, detail: chatResult.detail });
      if (state.failures === 3) {
        bridge.sendToChat(
          state.chatId,
          `⚠️ Anti chat watcher: 3 consecutive poll failures.\n<code>${escapeHtml(chatResult.detail)}</code>\nWill stop after ${MAX_FAILURES} failures.`,
          state.topicId,
        ).catch(() => {});
      }
      if (state.failures >= MAX_FAILURES) {
        const { chatId, topicId } = state;
        stopChatWatcher();
        bridge.sendToChat(chatId, "❌ Anti chat watcher stopped — CDP unreachable after 10 attempts.", topicId).catch(() => {});
        return;
      }
    }

    // ── Handle permissions ──
    if (permResult?.success && permResult.permissions.length > 0) {
      const perm = permResult.permissions[0]!;
      const promptText = perm.text || "Permission request";
      if (promptText !== state.lastPermText) {
        state.lastPermText = promptText;

        // Clear any pending auto-approve timer
        if (state.autoApproveTimer) {
          clearTimeout(state.autoApproveTimer);
          state.autoApproveTimer = null;
        }

        const allowAction = perm.actions.find((a: string) => /allow|accept|run|approve/i.test(a));
        const buttons = perm.actions.map((action: string) => {
          const isReject = /reject|deny/i.test(action);
          return {
            text: isReject ? `🚫 ${action}` : `✅ ${action}`,
            callback_data: `anti_perm:${action}`,
          };
        });

        // Check auto-approve settings
        const autoApprove = getSettingBool("anti.autoApprove", false);
        const autoDelay = getSettingInt("anti.autoApproveDelay", 5000);
        const countdown = autoApprove && allowAction ? ` (auto-approve in ${Math.round(autoDelay / 1000)}s)` : "";

        bridge.sendToChatWithKeyboard(
          state.chatId,
          `🔔 <b>Permission Request</b>${countdown}\n<pre>${escapeHtml(promptText.slice(0, 500))}</pre>`,
          { inline_keyboard: [buttons] },
          state.topicId,
        ).catch((err) => {
          log.error("TG permission send failed", { error: String(err) });
        });

        // Schedule auto-approve
        if (autoApprove && allowAction) {
          const capturedChatId = state.chatId;
          const capturedTopicId = state.topicId;
          state.autoApproveTimer = setTimeout(async () => {
            try {
              const result = await antiCdp.respondPermission(allowAction);
              bridge.sendToChat(
                capturedChatId,
                `⏱️ Auto-approved: ${escapeHtml(result.detail)}`,
                capturedTopicId,
              ).catch(() => {});
              log.info("Auto-approved permission", { action: allowAction });
            } catch (err) {
              log.error("Auto-approve failed", { error: String(err) });
            }
            if (state) state.autoApproveTimer = null;
          }, autoDelay);
        }
      }
    } else if (permResult !== null) {
      state.lastPermText = "";
      // No permissions pending — cancel any auto-approve timer (user already responded)
      if (state.autoApproveTimer) {
        clearTimeout(state.autoApproveTimer);
        state.autoApproveTimer = null;
      }
    }
  } catch (err) {
    log.error("Chat watcher poll error", { error: String(err) });
  } finally {
    if (state) state.polling = false;
  }
}
