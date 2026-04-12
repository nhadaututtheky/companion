/**
 * Telegram user-input message handlers — text, photo, document.
 * Extracted from TelegramBridge to reduce god-file complexity.
 */

import type { Context } from "grammy";
import { escapeHTML } from "./formatter.js";
import { createLogger } from "../logger.js";
import { storeMessage } from "../services/session-store.js";
import { listProjects } from "../services/project-profiles.js";
import { randomUUID } from "crypto";
import type { TelegramBridge } from "./telegram-bridge.js";

const log = createLogger("telegram-msg");

// ─── Vietnamese detection ───────────────────────────────────────────────────

const VI_REGEX = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/gi;

function isVietnamese(text: string): boolean {
  const matches = text.match(VI_REGEX);
  return (matches?.length ?? 0) >= 3;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function handleTextMessage(bridge: TelegramBridge, ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  const topicId = ctx.message?.message_thread_id;
  const text = ctx.message?.text ?? "";

  if (!text.trim()) return;

  const mapping = bridge.getMapping(chatId, topicId);

  if (!mapping) {
    // Auto-connect: if only 1 project, start session automatically
    const projects = listProjects();
    if (projects.length === 1) {
      await bridge.startSessionForChat(ctx, projects[0]!.slug);
      // Wait for the CLI to be ready before sending the queued message
      const newMapping = bridge.getMapping(chatId, topicId);
      if (newMapping) {
        const ready = await bridge.waitForSessionReady(newMapping.sessionId, 30_000);
        if (ready) {
          bridge.wsBridge.sendUserMessage(newMapping.sessionId, text, "telegram");
        }
      }
      return;
    }

    await ctx.reply("No active session. Use /start to select a project.");
    return;
  }

  // Check if session is still alive
  const activeSession = bridge.wsBridge.getSession(mapping.sessionId);
  if (!activeSession) {
    // Session died — clear stale mapping and notify user
    bridge.removeMapping(chatId, topicId);
    await ctx.reply("⚠️ Session expired. Use /start to begin a new session.");
    return;
  }

  // Auto-translate Vietnamese → English to save tokens
  let messageToSend = text;
  if (isVietnamese(text) && text.length > 10) {
    try {
      const { translateViToEn } = await import("../services/ai-client.js");
      const translated = await translateViToEn(text);
      if (translated) {
        messageToSend = translated;
        // Echo the translated text so the user sees what was sent
        await bridge.bot.api
          .sendMessage(chatId, `🔄 <i>${escapeHTML(translated)}</i>`, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          })
          .catch(() => {});
      }
    } catch {
      // Translation failed — send original text
    }
  }

  // Acknowledge receipt with 👀 reaction + track for result reaction
  const userMsgId = ctx.message?.message_id;
  const k = bridge.mapKey(chatId, topicId);
  if (userMsgId) {
    bridge.bot.api
      .setMessageReaction(chatId, userMsgId, [{ type: "emoji", emoji: "👀" }])
      .catch(() => {});
    bridge.lastUserMsgId.set(k, userMsgId);
  }

  // Store message
  storeMessage({
    id: randomUUID(),
    sessionId: mapping.sessionId,
    role: "user",
    content: messageToSend,
    source: "telegram",
    sourceId: String(userMsgId),
  });

  // Send to CLI
  bridge.wsBridge.sendUserMessage(mapping.sessionId, messageToSend, "telegram");

  // User is active — reset idle timer (clears warning + kill, restarts countdown)
  bridge.resetIdleTimer(mapping.sessionId, chatId, topicId);

  // Stream will lazy-start on first appendText (no startStream needed)
}

export async function handlePhotoMessage(bridge: TelegramBridge, ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  const topicId = ctx.message?.message_thread_id;

  const mapping = bridge.getMapping(chatId, topicId);
  if (!mapping) {
    await ctx.reply("No active session. Use /new to start one.");
    return;
  }

  const activeSession = bridge.wsBridge.getSession(mapping.sessionId);
  if (!activeSession) {
    bridge.removeMapping(chatId, topicId);
    await ctx.reply("⚠️ Session expired. Use /start to begin a new session.");
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  // Take highest resolution (last element)
  const photo = photos[photos.length - 1]!;
  const caption = ctx.message?.caption ?? "";

  await ctx.reply("📸 Image received, forwarding to Claude...");

  try {
    const file = await ctx.api.getFile(photo.file_id);
    if (!file.file_path) throw new Error("No file_path returned");

    const token = bridge.config.token;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = file.file_path.split(".").pop() ?? "jpg";
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const base64 = buffer.toString("base64");

    // Build multimodal content blocks (same format as Claude API)
    const blocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    > = [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }];

    if (caption.trim()) {
      blocks.push({ type: "text", text: caption.trim() });
    } else {
      blocks.push({ type: "text", text: "What do you see in this image?" });
    }

    bridge.wsBridge.sendMultimodalMessage(mapping.sessionId, blocks, "telegram");

    // User is active — reset idle timer
    bridge.resetIdleTimer(mapping.sessionId, chatId, topicId);
  } catch (err) {
    log.error("Failed to download/forward photo", { error: String(err) });
    await ctx.reply("❌ Failed to download image. Please try again.");
  }
}

export async function handleDocumentMessage(bridge: TelegramBridge, ctx: Context): Promise<void> {
  const chatId = ctx.chat!.id;
  const topicId = ctx.message?.message_thread_id;

  const mapping = bridge.getMapping(chatId, topicId);
  if (!mapping) {
    await ctx.reply("No active session. Use /new to start one.");
    return;
  }

  const activeSession = bridge.wsBridge.getSession(mapping.sessionId);
  if (!activeSession) {
    bridge.removeMapping(chatId, topicId);
    await ctx.reply("⚠️ Session expired. Use /start to begin a new session.");
    return;
  }

  const doc = ctx.message?.document;
  if (!doc) return;

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  if (doc.file_size && doc.file_size > MAX_SIZE) {
    await ctx.reply("❌ File too large. Maximum allowed size is 10 MB.");
    return;
  }

  const mime = doc.mime_type ?? "";
  const isAllowed =
    mime.startsWith("text/") ||
    mime.startsWith("image/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/pdf";

  if (!isAllowed) {
    await ctx.reply(
      `❌ Unsupported file type (${mime || "unknown"}). Supported: text files, images, JSON, XML, PDF.`,
    );
    return;
  }

  const filename = doc.file_name ?? "file";
  await ctx.reply(`📄 File received: ${filename}`);

  try {
    const file = await ctx.api.getFile(doc.file_id);
    if (!file.file_path) throw new Error("No file_path returned");

    const token = bridge.config.token;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    // Save to temp dir
    const { tmpdir } = await import("os");
    const { join, basename, resolve: resolvePath, sep } = await import("path");
    const { writeFile, mkdir } = await import("fs/promises");

    const tempDir = join(tmpdir(), "companion-uploads");
    await mkdir(tempDir, { recursive: true });
    // Sanitize filename to prevent path traversal — keep only the basename
    const safeFilename = basename(filename).replace(/[/\\]/g, "_") || "file";
    const savePath = join(tempDir, `${Date.now()}-${safeFilename}`);
    // Verify the resolved path stays inside tempDir
    const resolvedSave = resolvePath(savePath);
    const resolvedTemp = resolvePath(tempDir);
    if (!resolvedSave.startsWith(resolvedTemp + sep) && resolvedSave !== resolvedTemp) {
      throw new Error("Invalid file path");
    }
    await writeFile(savePath, buffer);

    const sizeKb = Math.round(buffer.length / 1024);
    const message = `User uploaded file: ${filename} (${sizeKb} KB, ${mime}). File saved at: ${savePath}`;
    bridge.wsBridge.sendUserMessage(mapping.sessionId, message, "telegram");

    // User is active — reset idle timer
    bridge.resetIdleTimer(mapping.sessionId, chatId, topicId);
  } catch (err) {
    log.error("Failed to download/forward document", { error: String(err) });
    await ctx.reply("❌ Failed to download file. Please try again.");
  }
}
