/**
 * Permission request handling for Telegram — batching, auto-approve countdown, UI.
 * Extracted from TelegramBridge to reduce god-file complexity.
 */

import { formatPermission, isPermissionDangerous } from "./formatter.js";
import { createLogger } from "../logger.js";
import type { PermissionRequest } from "@companion/shared";
import type { Bot } from "grammy";
import type { WsBridge } from "../services/ws-bridge.js";

const log = createLogger("telegram-perm");

// ─── Types ──────────────────────────────────────────────────────────────────

/** Permission batch to avoid spamming */
export interface PermBatch {
  perms: Array<{
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    description?: string;
  }>;
  timer: ReturnType<typeof setTimeout>;
  sessionId: string;
}

/** Short callback key → full IDs mapping (Telegram limits callback_data to 64 bytes) */
export interface PermCallbackEntry {
  sessionId: string;
  requestId: string;
}

/** Minimal interface for the bridge context needed by permission handlers */
export interface PermissionBridgeContext {
  bot: Bot;
  wsBridge: WsBridge;
  permBatches: Map<string, PermBatch>;
  autoApproveTimers: Map<number, ReturnType<typeof setInterval>>;
  sessionAutoApproveMessages: Map<string, Set<number>>;
  /** Maps short callback key → full session/request IDs (avoids Telegram 64-byte limit) */
  permCallbackMap: Map<string, PermCallbackEntry>;
  mapKey(chatId: number, topicId?: number): string;
}

// ─── Callback key generation ────────────────────────────────────────────────

let permKeyCounter = 0;

/** Generate a short callback key and store the full IDs mapping. */
function makePermKey(ctx: PermissionBridgeContext, sessionId: string, requestId: string): string {
  const key = `p${++permKeyCounter}`;
  ctx.permCallbackMap.set(key, { sessionId, requestId });
  return key;
}

/** Generate a short session-only key for bulk actions. */
function makeSessionKey(ctx: PermissionBridgeContext, sessionId: string): string {
  const key = `s${++permKeyCounter}`;
  ctx.permCallbackMap.set(key, { sessionId, requestId: "" });
  return key;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function handlePermissionRequest(
  ctx: PermissionBridgeContext,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  request: PermissionRequest,
): Promise<void> {
  const key = ctx.mapKey(chatId, topicId);

  // Batch permissions: collect in 2s window
  const existing = ctx.permBatches.get(key);
  if (existing && existing.sessionId === sessionId) {
    existing.perms.push({
      requestId: request.request_id,
      toolName: request.tool_name,
      input: request.input,
      description: request.description,
    });
    return;
  }

  // Start new batch
  const batch: PermBatch = {
    perms: [
      {
        requestId: request.request_id,
        toolName: request.tool_name,
        input: request.input,
        description: request.description,
      },
    ],
    sessionId,
    timer: setTimeout(() => {
      flushPermBatch(ctx, chatId, topicId, key);
    }, 2000),
  };

  ctx.permBatches.set(key, batch);
}

export async function flushPermBatch(
  ctx: PermissionBridgeContext,
  chatId: number,
  topicId: number | undefined,
  key: string,
): Promise<void> {
  const batch = ctx.permBatches.get(key);
  if (!batch) return;
  ctx.permBatches.delete(key);

  const { perms, sessionId } = batch;

  // Check auto-approve config
  const session = ctx.wsBridge.getSession(sessionId);
  const aa = session?.autoApproveConfig;
  const autoApproveSeconds = aa?.enabled ? (aa.timeoutSeconds ?? 0) : 0;

  // Format permission message — annotate each perm with danger flag
  const permsWithFlags = perms.map((p) => ({
    ...p,
    dangerous: isPermissionDangerous(p.toolName, p.input),
  }));
  const lines = permsWithFlags.map((p) => formatPermission(p.toolName, p.input, p.description));
  const baseText = lines.join("\n\n");

  // Add countdown suffix if auto-approve is on
  const countdownSuffix =
    autoApproveSeconds > 0 ? `\n\n⏱️ Auto-approve in <b>${autoApproveSeconds}s</b>` : "";

  // Build keyboard with short callback keys (Telegram limits callback_data to 64 bytes)
  type PermBtn = { text: string; callback_data: string };
  const permRows: PermBtn[][] = [];

  if (perms.length === 1) {
    const allowKey = makePermKey(ctx, sessionId, perms[0]!.requestId);
    const denyKey = makePermKey(ctx, sessionId, perms[0]!.requestId);
    permRows.push([
      { text: "✅ Allow", callback_data: `perm:a:${allowKey}` },
      { text: "❌ Deny", callback_data: `perm:d:${denyKey}` },
    ]);
  } else {
    for (const p of permsWithFlags) {
      const icon = p.dangerous ? "⚠️" : "✅";
      const allowKey = makePermKey(ctx, sessionId, p.requestId);
      const denyKey = makePermKey(ctx, sessionId, p.requestId);
      permRows.push([
        { text: `${icon} ${p.toolName}`, callback_data: `perm:a:${allowKey}` },
        { text: "❌", callback_data: `perm:d:${denyKey}` },
      ]);
    }
    // If any dangerous perms exist, add bulk-action row for safe-only approval
    const hasDangerous = permsWithFlags.some((p) => p.dangerous);
    if (hasDangerous) {
      const safeKey = makeSessionKey(ctx, sessionId);
      const reviewKey = makeSessionKey(ctx, sessionId);
      permRows.push([
        { text: "✅ Allow All Safe", callback_data: `perm:as:${safeKey}` },
        { text: "⚠️ Review Dangerous", callback_data: `perm:rd:${reviewKey}` },
      ]);
    }
  }

  const sentMsg = await ctx.bot.api
    .sendMessage(chatId, baseText + countdownSuffix, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: permRows } as unknown as import("grammy").InlineKeyboard,
      message_thread_id: topicId,
    })
    .catch((err) => {
      log.error("Failed to send permission batch", { error: String(err) });
      return undefined;
    });

  // Start auto-approve countdown if enabled
  if (sentMsg && autoApproveSeconds > 0) {
    startAutoApproveCountdown(
      ctx,
      chatId,
      topicId,
      sentMsg.message_id,
      sessionId,
      perms,
      baseText,
      permRows,
      autoApproveSeconds,
    );
  }
}

export function startAutoApproveCountdown(
  ctx: PermissionBridgeContext,
  chatId: number,
  _topicId: number | undefined,
  messageId: number,
  sessionId: string,
  perms: Array<{
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    description?: string;
  }>,
  baseText: string,
  permRows: Array<Array<{ text: string; callback_data: string }>>,
  totalSeconds: number,
): void {
  let remaining = totalSeconds;

  // Track this countdown under the session for cleanup on killSession
  if (!ctx.sessionAutoApproveMessages.has(sessionId)) {
    ctx.sessionAutoApproveMessages.set(sessionId, new Set());
  }
  ctx.sessionAutoApproveMessages.get(sessionId)!.add(messageId);

  const interval = setInterval(async () => {
    remaining -= 3;

    if (remaining <= 0) {
      // Time's up — auto-approve all
      clearInterval(interval);
      ctx.autoApproveTimers.delete(messageId);
      ctx.sessionAutoApproveMessages.get(sessionId)?.delete(messageId);

      for (const p of perms) {
        ctx.wsBridge.handleBrowserMessage(
          sessionId,
          JSON.stringify({
            type: "permission_response",
            request_id: p.requestId,
            behavior: "allow",
          }),
        );
      }

      // Edit message to show approved (no keyboard)
      await ctx.bot.api
        .editMessageText(chatId, messageId, baseText + "\n\n✅ <b>Auto-approved</b>", {
          parse_mode: "HTML",
        })
        .catch(() => {});
      return;
    }

    // Update countdown text, keep existing keyboard
    await ctx.bot.api
      .editMessageText(
        chatId,
        messageId,
        baseText + `\n\n⏱️ Auto-approve in <b>${remaining}s</b>`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: permRows,
          } as unknown as import("grammy").InlineKeyboard,
        },
      )
      .catch(() => {});
  }, 3000);

  ctx.autoApproveTimers.set(messageId, interval);
}

/** Cancel auto-approve countdown for a specific message (on manual allow/deny) */
export function cancelAutoApproveCountdown(ctx: PermissionBridgeContext, messageId: number): void {
  const timer = ctx.autoApproveTimers.get(messageId);
  if (timer) {
    clearInterval(timer);
    ctx.autoApproveTimers.delete(messageId);
  }
}

/** Cancel all active auto-approve countdowns (on /allow or /deny commands) */
export function cancelAllAutoApproveCountdowns(ctx: PermissionBridgeContext): void {
  for (const timer of ctx.autoApproveTimers.values()) {
    clearInterval(timer);
  }
  ctx.autoApproveTimers.clear();
}
