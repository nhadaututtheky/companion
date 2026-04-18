/**
 * Telegram session event handlers — CLI output processing.
 * Handles assistant messages, streaming, results, child agents, context updates.
 * Extracted from TelegramBridge to reduce god-file complexity.
 */

import { escapeHTML, formatToolFeed, shortModelName } from "./formatter.js";
import { getSessionSummary } from "../services/session-summarizer.js";
import { createLogger } from "../logger.js";
import { getReviewUrl } from "./review-link.js";
import type { TelegramBridge } from "./telegram-bridge.js";
import type { BrowserIncomingMessage, CLIResultMessage } from "@companion/shared";

const log = createLogger("telegram-events");

// ─── File path detection ────────────────────────────────────────────────────

/**
 * Extract backtick-wrapped file paths from assistant message text.
 * Matches patterns like `src/index.ts`, `.rune/plan.md`, `packages/foo/bar.ts`.
 * Returns unique paths only, limited to 5.
 */
function extractFilePaths(text: string): string[] {
  const regex = /`([^`\n]+\.[a-zA-Z0-9]{1,10}[^`\n]*)`/g;
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const candidate = match[1]!.trim();
    if ((candidate.includes("/") || candidate.startsWith(".")) && !seen.has(candidate)) {
      if (!candidate.startsWith("http") && candidate.length < 200) {
        seen.add(candidate);
        results.push(candidate);
        if (results.length >= 5) break;
      }
    }
  }

  return results;
}

// ─── Assistant message handler ──────────────────────────────────────────────

export async function handleAssistantMessage(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  msg: BrowserIncomingMessage & { type: "assistant" },
): Promise<void> {
  const content = msg.message?.content ?? [];
  if (!Array.isArray(content) || content.length === 0) return;

  // ── Render the assistant's text blocks (if any) as a completed message ──
  // Text is rendered ONCE from the full assistant message, never streamed.
  // Stream_event deltas only drive the typing indicator.
  const textBlocks: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) textBlocks.push(block.text);
  }
  const fullText = textBlocks.join("\n").trim();
  if (fullText) {
    await bridge.streamHandler.renderFinal(chatId, fullText, topicId);
  }

  // ── Tool progress: show tool_use blocks in the feed message (below text) ──
  const toolFeed = formatToolFeed(
    content as Array<{ type: string; name?: string; input?: unknown }>,
  );
  if (toolFeed) {
    await bridge.upsertToolFeed(chatId, topicId, toolFeed);
  }

  // ── Plan file detection: send review link when agent writes .md plans ──
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const b = block as { name?: string; input?: Record<string, unknown> };
    if (b.name !== "Write" && b.name !== "Edit") continue;
    const filePath = (b.input?.file_path ?? b.input?.path ?? "") as string;
    if (!filePath.endsWith(".md")) continue;
    // Only trigger for plan-like files
    const fname = filePath.replace(/\\/g, "/").split("/").pop() ?? "";
    if (!fname.startsWith("plan") && !filePath.includes(".rune/plan")) continue;

    const mapping = bridge.getMapping(chatId, topicId);
    if (!mapping) continue;

    const relPath = filePath.includes(".rune/")
      ? filePath.slice(filePath.indexOf(".rune/"))
      : fname;
    const url = await getReviewUrl(mapping.projectSlug, relPath);
    if (!url) continue;

    await bridge.bot.api
      .sendMessage(chatId, `📋 <b>Plan updated:</b> <code>${escapeHTML(fname)}</code>`, {
        parse_mode: "HTML",
        message_thread_id: topicId,
        reply_markup: {
          inline_keyboard: [[{ text: "📖 Review & Comment", url }]],
        } as unknown as import("grammy").InlineKeyboard,
      })
      .catch(() => {});
    break; // One notification per message
  }

  // ── File path detection: show "View File" buttons ──
  if (!fullText) return;
  const filePaths = extractFilePaths(fullText);
  if (filePaths.length > 0) {
    const mapping = bridge.getMapping(chatId, topicId);
    if (mapping) {
      const sessionId = mapping.sessionId;
      const session = bridge.wsBridge.getSession(sessionId);
      const cwd = session?.state.cwd;
      if (cwd) {
        const rows = filePaths.slice(0, 5).map((fp) => {
          const key = bridge.nextViewFileKey();
          bridge.viewFileCache.set(key, { sessionId, filePath: fp });
          if (bridge.viewFileCache.size > 1000) {
            const evict = [...bridge.viewFileCache.keys()].slice(0, 200);
            evict.forEach((k) => bridge.viewFileCache.delete(k));
          }
          return [{ text: `📂 ${fp}`, callback_data: `vf:${key}` }];
        });

        await bridge.bot.api
          .sendMessage(chatId, "📂 <b>Referenced files:</b>", {
            parse_mode: "HTML",
            message_thread_id: topicId,
            reply_markup: { inline_keyboard: rows } as unknown as import("grammy").InlineKeyboard,
          })
          .catch(() => {});
      }
    }
  }
}

// ─── Stream event handler ───────────────────────────────────────────────────

export async function handleStreamEvent(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  msg: BrowserIncomingMessage & { type: "stream_event" },
): Promise<void> {
  const event = msg.event as { delta?: { text?: string } };
  if (!event?.delta?.text) return;

  // Lock origin user message ID on first text delta (for reactions later)
  const k = bridge.mapKey(chatId, topicId);
  const replyTo = bridge.lastUserMsgId.get(k);
  if (replyTo && !bridge.responseOriginMsg.has(k)) {
    bridge.responseOriginMsg.set(k, replyTo);
  }

  // Deltas only refresh typing — final text is rendered from the assistant msg.
  bridge.streamHandler.ensureTyping(chatId, topicId);
}

// ─── Result message handler ─────────────────────────────────────────────────

export async function handleResultMessage(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  result: CLIResultMessage,
): Promise<void> {
  // Stop typing indicator; text was already rendered from the assistant msg.
  bridge.streamHandler.stopTyping(chatId, topicId);

  // Clean up tool feed
  bridge.cleanupToolFeed(chatId, topicId);

  // React on original user message: 👍 success / 👎 error
  const k = bridge.mapKey(chatId, topicId);
  const originMsgId = bridge.responseOriginMsg.get(k) ?? bridge.lastUserMsgId.get(k);
  if (originMsgId) {
    const emoji = result.is_error ? "👎" : "👍";
    bridge.bot.api
      .setMessageReaction(chatId, originMsgId, [{ type: "emoji", emoji }])
      .catch(() => {});
  }
  // Clean up turn-scoped state
  bridge.responseOriginMsg.delete(k);
  bridge.lastUserMsgId.delete(k);

  // Reset idle timer — session is now idle, start countdown
  bridge.resetIdleTimer(sessionId, chatId, topicId);

  // Send result summary if it was an error
  if (result.is_error) {
    const errorText = result.result ?? result.errors?.join("\n") ?? "Unknown error";
    await bridge.bot.api.sendMessage(chatId, `⚠️ <b>Error:</b> ${escapeHTML(errorText)}`, {
      parse_mode: "HTML",
      message_thread_id: topicId,
    });
  }

  // Inline token bar — compact 1-line after each turn
  sendTokenBar(bridge, chatId, topicId, sessionId, result).catch(() => {});
}

// ─── Token bar ──────────────────────────────────────────────────────────────

async function sendTokenBar(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  result: CLIResultMessage,
): Promise<void> {
  const session = bridge.wsBridge.getSession(sessionId);
  if (!session) return;

  const model = session.state.model;
  const isHaiku = model.includes("haiku");
  const isOpus = model.includes("opus");

  const inputK = result.usage.input_tokens / 1000;
  const outputK = result.usage.output_tokens / 1000;

  const inputMaxK = isHaiku ? 200 : 1000;
  const outputMaxK = isOpus ? 128 : 64;

  const inputPct = Math.min(100, Math.round((inputK / inputMaxK) * 100));

  const bar = (pct: number) => {
    const filled = Math.round((pct / 100) * 15);
    return "█".repeat(filled) + "░".repeat(15 - filled);
  };

  const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}M` : `${v.toFixed(1)}K`);

  const cost = result.total_cost_usd > 0 ? `$${result.total_cost_usd.toFixed(3)}` : "";
  const turns = result.num_turns > 0 ? `T${result.num_turns}` : "";
  const meta = [turns, cost].filter(Boolean).join(" · ");

  const text = `<code>[${bar(inputPct)}]</code> ${fmtK(inputK)}/${fmtK(inputMaxK)} · out ${fmtK(outputK)}${meta ? ` · ${meta}` : ""}`;

  await bridge.bot.api
    .sendMessage(chatId, text, {
      parse_mode: "HTML",
      message_thread_id: topicId,
    })
    .catch(() => {});
}

// ─── Context update handler ─────────────────────────────────────────────────

export async function handleContextUpdate(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
  contextUsedPercent: number,
): Promise<void> {
  // Warn at the per-session compact threshold (user-configurable via app settings, default 75%).
  // Fallback 80% when session state is not yet hydrated.
  const session = bridge.wsBridge.getSession(sessionId);
  const threshold = session?.state.compact_threshold ?? 80;
  if (contextUsedPercent < threshold) return;
  if (bridge.compactWarningSent.has(sessionId)) return;

  bridge.compactWarningSent.add(sessionId);
  const mode = session?.state.compact_mode ?? "manual";
  const hint =
    mode === "manual"
      ? "consider running <code>/compact</code> to compress history."
      : `auto-compact (${mode}) will trigger soon.`;
  await bridge.bot.api
    .sendMessage(
      chatId,
      `⚠️ <b>Context ${Math.round(contextUsedPercent)}% full</b> — ${hint}`,
      { parse_mode: "HTML", message_thread_id: topicId },
    )
    .catch(() => {});
}

// ─── Session summary ────────────────────────────────────────────────────────

export async function sendSessionSummary(
  bridge: TelegramBridge,
  chatId: number,
  topicId: number | undefined,
  sessionId: string,
): Promise<void> {
  const maxWait = 15_000;
  const pollInterval = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const summary = getSessionSummary(sessionId);
    if (summary) {
      const files =
        summary.filesModified.length > 0
          ? `\n\n📁 <b>Files:</b> ${summary.filesModified.map((f) => `<code>${escapeHTML(f)}</code>`).join(", ")}`
          : "";
      const decisions =
        summary.keyDecisions.length > 0
          ? `\n\n🎯 <b>Decisions:</b>\n${summary.keyDecisions.map((d) => `• ${escapeHTML(d)}`).join("\n")}`
          : "";

      await bridge.bot.api
        .sendMessage(
          chatId,
          `📝 <b>Session Summary</b>\n\n${escapeHTML(summary.summary)}${decisions}${files}`,
          { parse_mode: "HTML", message_thread_id: topicId },
        )
        .catch(() => {});
      return;
    }
  }
}

// ─── Multi-Brain: Agent Topic Management ────────────────────────────────────

export async function handleChildSpawned(
  bridge: TelegramBridge,
  chatId: number,
  parentTopicId: number | undefined,
  parentSessionId: string,
  msg: BrowserIncomingMessage & { type: "child_spawned" },
): Promise<void> {
  const { childSessionId, childShortId, childName, childRole, childModel } = msg;

  const ROLE_EMOJI: Record<string, string> = {
    specialist: "🔧",
    researcher: "🔍",
    reviewer: "🧪",
  };
  const emoji = ROLE_EMOJI[childRole] ?? "🤖";

  try {
    const topicName = `${emoji} ${childName}`;
    const forumTopic = await bridge.bot.api.createForumTopic(chatId, topicName);
    const agentTopicId = forumTopic.message_thread_id;

    const mapping = {
      sessionId: childSessionId,
      projectSlug: bridge.getMapping(chatId, parentTopicId)?.projectSlug ?? "",
      model: childModel,
      topicId: agentTopicId,
    };
    bridge.setMapping(chatId, agentTopicId, mapping);
    bridge.subscribeToSession(childSessionId, chatId, agentTopicId);

    await bridge.bot.api.sendMessage(
      chatId,
      `${emoji} <b>${escapeHTML(childName)}</b> (@${escapeHTML(childShortId ?? "?")}) spawned\n` +
        `Model: <b>${shortModelName(childModel)}</b> | Role: ${childRole}\n` +
        `Parent: <code>${escapeHTML(parentSessionId.slice(0, 8))}</code>`,
      { parse_mode: "HTML", message_thread_id: agentTopicId },
    );

    await bridge.bot.api.sendMessage(
      chatId,
      `${emoji} Spawned agent <b>${escapeHTML(childName)}</b> → topic "${escapeHTML(topicName)}"`,
      { parse_mode: "HTML", message_thread_id: parentTopicId },
    );

    log.info("Created agent topic", { chatId, childSessionId, childName, agentTopicId });
  } catch (err) {
    log.warn("Could not create agent topic, falling back to inline", {
      chatId,
      error: String(err),
    });
    await bridge.bot.api
      .sendMessage(
        chatId,
        `${emoji} Spawned agent <b>${escapeHTML(childName)}</b> (@${escapeHTML(childShortId ?? "?")})\nModel: <b>${shortModelName(childModel)}</b>`,
        { parse_mode: "HTML", message_thread_id: parentTopicId },
      )
      .catch(() => {});
  }
}

export async function handleChildEnded(
  bridge: TelegramBridge,
  chatId: number,
  parentTopicId: number | undefined,
  msg: BrowserIncomingMessage & { type: "child_ended" },
): Promise<void> {
  const { childSessionId, childName, status } = msg;
  const statusIcon = status === "ended" ? "✅" : "❌";
  const label = childName ?? childSessionId.slice(0, 8);

  await bridge.bot.api
    .sendMessage(
      chatId,
      `${statusIcon} Agent <b>${escapeHTML(label)}</b> ${status === "ended" ? "completed" : "errored"}`,
      { parse_mode: "HTML", message_thread_id: parentTopicId },
    )
    .catch(() => {});

  // Try to close the agent's topic (optional — nice cleanup)
  try {
    for (const [key, mapping] of bridge.getMappingsEntries()) {
      if (mapping.sessionId === childSessionId && key.startsWith(`${chatId}:`)) {
        const childTopicId = mapping.topicId;
        if (childTopicId) {
          await bridge.bot.api.closeForumTopic(chatId, childTopicId);
        }
        break;
      }
    }
  } catch {
    // Closing topic is best-effort
  }
}
