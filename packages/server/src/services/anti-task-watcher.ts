/**
 * Task watcher — polls Anti IDE task list and pushes deltas to Telegram.
 * Ported from MyTrend with adapted imports for Companion.
 */

import * as antiCdp from "./anti-cdp.js";
import type { AntiTaskItem } from "./anti-cdp.js";
import type { TelegramBridge } from "../telegram/telegram-bridge.js";
import { createLogger } from "../logger.js";
import { getSettingInt } from "./settings-helpers.js";

const log = createLogger("anti-task-watcher");

const DEFAULT_POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_CONSECUTIVE_FAILURES = 5;

interface WatcherState {
  interval: ReturnType<typeof setInterval>;
  previousTasks: AntiTaskItem[];
  chatId: number;
  topicId: number;
  polling: boolean;
  consecutiveFailures: number;
}

let state: WatcherState | null = null;

export function isWatcherRunning(): boolean {
  return state !== null;
}

export function getWatcherInfo(): { chatId: number; topicId: number } | null {
  if (!state) return null;
  return { chatId: state.chatId, topicId: state.topicId };
}

export function startTaskWatcher(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number,
): void {
  if (state) stopTaskWatcher();

  const pollMs = getSettingInt("anti.taskPollInterval", DEFAULT_POLL_INTERVAL_MS);
  state = {
    interval: setInterval(() => pollTasks(bridge), pollMs),
    previousTasks: [],
    chatId,
    topicId,
    polling: false,
    consecutiveFailures: 0,
  };

  log.info("Task watcher started", { chatId, topicId, intervalMs: pollMs });
}

export function stopTaskWatcher(): void {
  if (!state) return;
  clearInterval(state.interval);
  log.info("Task watcher stopped", { chatId: state.chatId });
  state = null;
}

async function pollTasks(bridge: TelegramBridge): Promise<void> {
  if (!state || state.polling) return;
  state.polling = true;

  try {
    const result = await antiCdp.getTaskList();
    if (!result.success) {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const { chatId, topicId } = state;
        stopTaskWatcher();
        await bridge.sendToChat(chatId, "⚠️ Task watcher stopped — Anti CDP unreachable after 5 attempts.", topicId);
      }
      return;
    }

    state.consecutiveFailures = 0;
    const previous = state.previousTasks;
    const current = result.tasks;

    // First poll — just store baseline, don't send delta
    if (previous.length === 0 && current.length > 0) {
      state.previousTasks = current;
      return;
    }

    const delta = computeDelta(previous, current);
    if (delta.completed.length === 0 && delta.added.length === 0) {
      state.previousTasks = current;
      return;
    }

    const totalDone = current.filter((t) => t.checked).length;
    const message = formatTaskDelta(delta.completed, delta.added, totalDone, current.length);
    await bridge.sendToChat(state.chatId, message, state.topicId);
    state.previousTasks = current;
  } catch (err) {
    log.error("Task watcher poll error", { error: String(err) });
  } finally {
    if (state) state.polling = false;
  }
}

// ── Delta computation ──────────────────────────────────────────────────

interface TaskDelta {
  completed: AntiTaskItem[];
  added: AntiTaskItem[];
}

export function computeDelta(previous: AntiTaskItem[], current: AntiTaskItem[]): TaskDelta {
  const prevMap = new Map(previous.map((t) => [t.text, t.checked]));
  const completed: AntiTaskItem[] = [];
  const added: AntiTaskItem[] = [];

  for (const task of current) {
    const prevChecked = prevMap.get(task.text);
    if (prevChecked === undefined) {
      added.push(task);
    } else if (!prevChecked && task.checked) {
      completed.push(task);
    }
  }

  return { completed, added };
}

// ── Formatting (inlined from MyTrend telegram-formatter) ──────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildProgressBar(done: number, total: number): string {
  if (total === 0) return "[░░░░░░░░░░] 0/0";
  const ratio = done / total;
  const filled = Math.round(ratio * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  const pct = Math.round(ratio * 100);
  return `[${bar}] ${done}/${total} (${pct}%)`;
}

function formatTaskDelta(
  completed: AntiTaskItem[],
  added: AntiTaskItem[],
  totalDone: number,
  totalCount: number,
): string {
  const bar = buildProgressBar(totalDone, totalCount);
  const parts: string[] = [
    `📋 <b>Task Update</b>`,
    `<code>${bar}</code>`,
  ];

  if (completed.length > 0) {
    parts.push("", "<b>Completed:</b>");
    for (const t of completed) {
      parts.push(`✅ <s>${escapeHtml(t.text)}</s>`);
    }
  }
  if (added.length > 0) {
    parts.push("", "<b>New:</b>");
    for (const t of added) {
      parts.push(`📌 ${escapeHtml(t.text)}`);
    }
  }

  return parts.join("\n");
}
