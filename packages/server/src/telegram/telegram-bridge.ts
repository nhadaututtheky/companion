/**
 * TelegramBridge — Core bridge between Telegram and WsBridge/CLI.
 * Manages chat-to-session mappings, routes messages, handles streaming.
 */

import { type Bot, type Context } from "grammy";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramSessionMappings } from "../db/schema.js";
import { createBot, registerCommands, type BotConfig } from "./bot-factory.js";
import { StreamHandler } from "./stream-handler.js";
import {
  escapeHTML,
  formatPermission,
  formatToolFeed,
} from "./formatter.js";
import { getSessionSummary } from "../services/session-summarizer.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerControlCommands } from "./commands/control.js";
import { registerInfoCommands } from "./commands/info.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerPanelCommands } from "./commands/panel.js";
import { registerUtilityCommands } from "./commands/utility.js";
import { registerTemplateCommands } from "./commands/template.js";
import { registerAntiCommands } from "./commands/anti.js";
import { createLogger } from "../logger.js";
import { storeMessage } from "../services/session-store.js";
import { getProject, listProjects } from "../services/project-profiles.js";
import { randomUUID } from "crypto";
import type { WsBridge } from "../services/ws-bridge.js";
import type {
  BrowserIncomingMessage,
  CLIResultMessage,
  PermissionRequest,
} from "@companion/shared";

const log = createLogger("telegram-bridge");

// ─── Vietnamese detection ────────────────────────────────────────────────────

const VI_REGEX = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/gi;

function isVietnamese(text: string): boolean {
  const matches = text.match(VI_REGEX);
  return (matches?.length ?? 0) >= 3;
}

// ─── File path detection (Phase 14) ─────────────────────────────────────────

/**
 * Extract backtick-wrapped file paths from assistant message text.
 * Matches patterns like `src/index.ts`, `.rune/plan.md`, `packages/foo/bar.ts`.
 * Returns unique paths only, limited to 5.
 */
function extractFilePaths(text: string): string[] {
  // Match backtick-wrapped tokens that look like file paths (contain / or . with extension)
  const regex = /`([^`\n]+\.[a-zA-Z0-9]{1,10}[^`\n]*)`/g;
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const candidate = match[1]!.trim();
    // Must contain a path separator or start with . to be a file path
    if ((candidate.includes("/") || candidate.startsWith(".")) && !seen.has(candidate)) {
      // Skip URLs and other non-file patterns
      if (!candidate.startsWith("http") && candidate.length < 200) {
        seen.add(candidate);
        results.push(candidate);
        if (results.length >= 5) break;
      }
    }
  }

  return results;
}

// ─── Chat-Session Mapping ───────────────────────────────────────────────────

interface ChatMapping {
  sessionId: string;
  projectSlug: string;
  model: string;
  topicId?: number;
}

/** Per-session panel + idle config stored in memory */
interface SessionConfig {
  /** Telegram message_id of the settings panel message (for editing) */
  panelMessageId?: number;
  /** Idle timeout in ms (0 = never) */
  idleTimeoutMs: number;
  /** Idle timeout timer handle */
  idleTimer?: ReturnType<typeof setTimeout>;
}

/** Dead session info for resume detection */
export interface DeadSessionInfo {
  chatId: number;
  topicId: number;
  sessionId: string;
  cliSessionId: string;
  projectSlug: string;
  model: string;
  diedAt: number;
}

/** Permission batch to avoid spamming */
interface PermBatch {
  perms: Array<{ requestId: string; toolName: string; description?: string }>;
  timer: ReturnType<typeof setTimeout>;
  sessionId: string;
}

// ─── Status emoji helpers ────────────────────────────────────────────────────

export function statusEmoji(status: string): string {
  switch (status) {
    case "starting":
    case "waiting":
      return "🟡";
    case "idle":
      return "🟢";
    case "running":
    case "busy":
    case "compacting":
      return "🔵";
    case "ended":
      return "⚫";
    case "error":
      return "🔴";
    default:
      return "⚪";
  }
}

// ─── TelegramBridge ─────────────────────────────────────────────────────────

export class TelegramBridge {
  readonly bot: Bot;
  readonly wsBridge: WsBridge;
  readonly config: BotConfig;
  private streamHandler: StreamHandler;

  /** chatId:topicId → mapping */
  private mappings = new Map<string, ChatMapping>();
  /** sessionId → per-session config (panel msg id, idle timeout, etc.) */
  private sessionConfigs = new Map<string, SessionConfig>();
  /** chatId:topicId → permission batch */
  private permBatches = new Map<string, PermBatch>();
  /** sessionId → unsubscribe function */
  private subscriptions = new Map<string, () => void>();
  /** sessionIds that already received a compact warning (prevent spam) */
  private compactWarningSent = new Set<string>();
  /** sessionId → stream-only subscriber key (chatId:topicId) — for /stream without owning the session */
  private streamSubscriptions = new Map<string, string>();
  /** Dead sessions available for resume (keyed by "chatId:topicId") */
  private deadSessions = new Map<string, DeadSessionInfo>();
  /** chatId:topicId → user message ID locked at first response chunk (for reaction update) */
  private lastUserMsgId = new Map<string, number>();
  /** chatId:topicId → locked origin message ID (set on first stream chunk, prevents race condition) */
  private responseOriginMsg = new Map<string, number>();
  /** chatId:topicId → tool feed message ID (the "Thinking..." / "Running..." message) */
  private toolFeedMsgId = new Map<string, number>();
  /** chatId:topicId → accumulated tool feed lines */
  private toolFeedLines = new Map<string, string[]>();
  /** Active debate channel per chat (chatKey → channelId) */
  private activeDebateChannels = new Map<string, string>();
  /** Active auto-approve countdowns: messageId → timer */
  private autoApproveTimers = new Map<number, ReturnType<typeof setInterval>>();

  constructor(wsBridge: WsBridge, config: BotConfig) {
    this.wsBridge = wsBridge;
    this.config = config;
    this.bot = createBot(config);
    this.streamHandler = new StreamHandler(this.bot.api);

    // Register command handlers
    registerSessionCommands(this);
    registerControlCommands(this);
    registerInfoCommands(this);
    registerConfigCommands(this);
    registerPanelCommands(this);
    registerUtilityCommands(this);
    registerTemplateCommands(this);
    registerAntiCommands(this);

    // Handle text messages (not commands)
    this.bot.on("message:text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) return; // Skip unregistered commands
      await this.handleTextMessage(ctx);
    });

    // Load persisted mappings
    this.loadMappings();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await registerCommands(this.bot);
    this.bot.start({
      onStart: () => {
        log.info("Bot started polling", { botId: this.config.botId, label: this.config.label });
      },
    });
  }

  async stop(): Promise<void> {
    // Unsubscribe from all sessions
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();

    // Clear permission batches
    for (const batch of this.permBatches.values()) {
      clearTimeout(batch.timer);
    }
    this.permBatches.clear();

    // Clear idle timers
    for (const cfg of this.sessionConfigs.values()) {
      if (cfg.idleTimer) clearTimeout(cfg.idleTimer);
    }
    this.sessionConfigs.clear();

    // Clear auto-approve countdown timers
    for (const timer of this.autoApproveTimers.values()) {
      clearInterval(timer);
    }
    this.autoApproveTimers.clear();

    await this.bot.stop();
    log.info("Bot stopped", { botId: this.config.botId });
  }

  // ── Session config (panel + idle) ────────────────────────────────────

  getSessionConfig(sessionId: string): SessionConfig {
    let cfg = this.sessionConfigs.get(sessionId);
    if (!cfg) {
      cfg = { idleTimeoutMs: 3_600_000 }; // default 1h
      this.sessionConfigs.set(sessionId, cfg);
    }
    return cfg;
  }

  setSessionPanelMessageId(sessionId: string, messageId: number): void {
    this.getSessionConfig(sessionId).panelMessageId = messageId;
  }

  setIdleTimeout(sessionId: string, ms: number): void {
    const cfg = this.getSessionConfig(sessionId);
    cfg.idleTimeoutMs = ms;
    // Persist to DB
    this.persistIdleTimeout(sessionId, ms);
  }

  private persistIdleTimeout(sessionId: string, ms: number): void {
    try {
      const db = getDb();
      db.update(telegramSessionMappings)
        .set({
          idleTimeoutEnabled: ms > 0,
          idleTimeoutMs: ms,
        })
        .where(eq(telegramSessionMappings.sessionId, sessionId))
        .run();
    } catch (err) {
      log.error("Failed to persist idle timeout", { sessionId, error: String(err) });
    }
  }

  /** Reset the idle timer for a session. Called on user message + result events. */
  resetIdleTimer(sessionId: string, chatId: number, topicId?: number): void {
    const cfg = this.getSessionConfig(sessionId);

    if (cfg.idleTimer) {
      clearTimeout(cfg.idleTimer);
      cfg.idleTimer = undefined;
    }

    if (cfg.idleTimeoutMs <= 0) return;

    cfg.idleTimer = setTimeout(async () => {
      cfg.idleTimer = undefined;
      const session = this.wsBridge.getSession(sessionId);
      if (!session) return;

      log.info("Idle timeout expired, stopping session", { sessionId, idleMs: cfg.idleTimeoutMs });
      this.killSession(sessionId);
      this.removeMapping(chatId, topicId);

      const minutes = Math.round(cfg.idleTimeoutMs / 60_000);
      const label = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
      await this.bot.api
        .sendMessage(chatId, `⏰ Session idle for ${label}, shutting down.`, {
          message_thread_id: topicId,
        })
        .catch(() => {});
    }, cfg.idleTimeoutMs);
  }

  // ── Dead session management (for resume) ─────────────────────────────

  /** Get dead session by exact chatId:topicId key */
  getDeadSession(chatId: number, topicId: number): DeadSessionInfo | undefined {
    const k = this.mapKey(chatId, topicId);
    const dead = this.deadSessions.get(k);
    if (!dead) return undefined;
    // Expire after 24h
    if (Date.now() - dead.diedAt > 24 * 60 * 60 * 1000) {
      this.deadSessions.delete(k);
      return undefined;
    }
    return dead;
  }

  /** Get dead session by project slug (searches all dead sessions for this chatId) */
  getDeadSessionByProject(chatId: number, projectSlug: string): DeadSessionInfo | undefined {
    for (const [k, dead] of this.deadSessions) {
      if (dead.chatId === chatId && dead.projectSlug === projectSlug) {
        if (Date.now() - dead.diedAt > 24 * 60 * 60 * 1000) {
          this.deadSessions.delete(k);
          continue;
        }
        return dead;
      }
    }
    return undefined;
  }

  /** Remove a dead session entry */
  clearDeadSession(chatId: number, topicId: number): void {
    this.deadSessions.delete(this.mapKey(chatId, topicId));
  }

  /** Clear dead session by project slug */
  clearDeadSessionByProject(chatId: number, projectSlug: string): void {
    for (const [k, dead] of this.deadSessions) {
      if (dead.chatId === chatId && dead.projectSlug === projectSlug) {
        this.deadSessions.delete(k);
      }
    }
  }

  // ── Mapping management ────────────────────────────────────────────────

  private mapKey(chatId: number, topicId?: number): string {
    return `${chatId}:${topicId ?? 0}`;
  }

  getMapping(chatId: number, topicId?: number): ChatMapping | undefined {
    return this.mappings.get(this.mapKey(chatId, topicId));
  }

  setMapping(chatId: number, topicId: number | undefined, mapping: ChatMapping): void {
    this.mappings.set(this.mapKey(chatId, topicId), mapping);
    this.persistMapping(chatId, topicId, mapping);
  }

  removeMapping(chatId: number, topicId?: number): void {
    this.mappings.delete(this.mapKey(chatId, topicId));
  }

  // ── Session management ────────────────────────────────────────────────

  async startSessionForChat(
    ctx: Context,
    projectSlug: string,
    opts?: {
      resume?: boolean;
      cliSessionId?: string;
      initialPrompt?: string;
      model?: string;
      permissionMode?: string;
    },
  ): Promise<void> {
    const chatId = ctx.chat!.id;
    const topicId = ctx.message?.message_thread_id ?? (ctx.callbackQuery?.message as { message_thread_id?: number })?.message_thread_id;

    const project = getProject(projectSlug);
    if (!project) {
      await ctx.reply(`Project <code>${escapeHTML(projectSlug)}</code> not found.`, {
        parse_mode: "HTML",
      });
      return;
    }

    // Kill existing session if any
    const existing = this.getMapping(chatId, topicId);
    if (existing) {
      this.killSession(existing.sessionId);
    }

    const effectiveModel = opts?.model ?? project.defaultModel;
    const effectivePermission = opts?.permissionMode ?? project.permissionMode;

    try {
      const sessionId = await this.wsBridge.startSession({
        projectSlug: project.slug,
        cwd: project.dir,
        model: effectiveModel,
        permissionMode: effectivePermission,
        source: "telegram",
        resume: opts?.resume,
        cliSessionId: opts?.cliSessionId,
      });

      const mapping: ChatMapping = {
        sessionId,
        projectSlug: project.slug,
        model: effectiveModel,
      };

      this.setMapping(chatId, topicId, mapping);
      this.subscribeToSession(sessionId, chatId, topicId);

      // Send settings panel (includes status + inline keyboard)
      const panelMsg = await this.sendSettingsPanel(chatId, topicId, sessionId, project.name, effectiveModel);
      if (panelMsg) {
        this.setSessionPanelMessageId(sessionId, panelMsg.message_id);
      }

      // Send quick action buttons (disappear after use or template prompt)
      if (!opts?.initialPrompt) {
        this.sendQuickActions(chatId, topicId, sessionId).catch(() => {});
      }

      // Send initial prompt from template once session is ready
      if (opts?.initialPrompt) {
        const prompt = opts.initialPrompt;
        this.waitForSessionReady(sessionId, 15_000).then((ready) => {
          if (ready) {
            this.wsBridge.sendUserMessage(sessionId, prompt, "telegram");
          } else {
            log.warn("Session not ready in time for initial prompt", { sessionId });
            this.bot.api.sendMessage(chatId, "⚠️ Session took too long to start. Send your prompt manually.").catch(() => {});
          }
        });
      }

      log.info("Session started from Telegram", {
        chatId,
        topicId,
        sessionId,
        project: project.slug,
        resume: opts?.resume ?? false,
        hasTemplate: !!opts?.initialPrompt,
      });
    } catch (err) {
      log.error("Failed to start session", { error: String(err) });
      await ctx.reply(`Failed to start session: ${String(err)}`);
    }
  }

  /** Build and send (or edit) the settings panel message */
  async sendSettingsPanel(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    projectName: string,
    model: string,
    editMessageId?: number,
  ): Promise<{ message_id: number } | undefined> {
    const session = this.wsBridge.getSession(sessionId);
    const cfg = this.getSessionConfig(sessionId);

    const status = session?.state.status ?? "starting";
    const cost = session?.state.total_cost_usd ?? 0;
    const turns = session?.state.num_turns ?? 0;
    const updatedAt = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

    const aa = session?.autoApproveConfig;
    const aaLabel = !aa?.enabled ? "Off" : `${aa.timeoutSeconds}s`;
    const idleMs = cfg.idleTimeoutMs;
    const idleLabel = idleMs <= 0 ? "Never" : idleMs === 1_800_000 ? "30m" : idleMs === 3_600_000 ? "1h" : idleMs === 14_400_000 ? "4h" : idleMs === 43_200_000 ? "12h" : `${Math.round(idleMs / 60_000)}m`;
    const permMode = session?.state.permissionMode ?? "default";

    // Context meter
    const state = session?.state;
    let contextStr = "";
    if (state) {
      const totalTokens = state.total_input_tokens + state.total_output_tokens + state.cache_read_tokens;
      if (totalTokens > 0) {
        const maxTokens = state.model.includes("haiku") ? 200_000 : 1_000_000;
        const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
        contextStr = ` · Context: ${pct}%`;
      }
    }

    // Short ID for @mention / #mention
    const shortId = session?.state.short_id;
    const shortIdStr = shortId ? ` · <code>#${escapeHTML(shortId)}</code>` : "";

    const text = [
      `<b>${escapeHTML(projectName)}</b> · <code>${escapeHTML(model)}</code> · ${statusEmoji(status)} ${status}${shortIdStr}`,
      `$${cost.toFixed(4)} · ${turns} turns · Updated ${updatedAt}${contextStr}`,
      `Auto-Approve: <b>${aaLabel}</b> · Timeout: <b>${idleLabel}</b>`,
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
    const aaSafe = aa?.enabled && aa.timeoutSeconds === 0 && aa.allowBash;

    const iNever = idleMs <= 0;
    const i30m = idleMs === 1_800_000;
    const i1h = idleMs === 3_600_000;
    const i4h = idleMs === 14_400_000;
    const i12h = idleMs === 43_200_000;

    const keyboard = {
      inline_keyboard: [
        // Row 1: Model + Status
        [
          btn(`Model: ${model}`, `panel:model:${sessionId}`, "primary"),
          btn("Status", `panel:status:${sessionId}`),
        ],
        // Row 2: Auto-approve presets
        [
          btn(`Off${aaOff ? " ✓" : ""}`, `panel:aa:off:${sessionId}`, aaOff ? "success" : undefined),
          btn(`15s${aa15 ? " ✓" : ""}`, `panel:aa:15:${sessionId}`, aa15 ? "success" : undefined),
          btn(`30s${aa30 ? " ✓" : ""}`, `panel:aa:30:${sessionId}`, aa30 ? "success" : undefined),
          btn(`60s${aa60 ? " ✓" : ""}`, `panel:aa:60:${sessionId}`, aa60 ? "success" : undefined),
          btn(`🛡 Safe${aaSafe ? " ✓" : ""}`, `panel:aa:safe:${sessionId}`, aaSafe ? "danger" : undefined),
        ],
        // Row 3: Idle timeout presets
        [
          btn(`Never${iNever ? " ✓" : ""}`, `panel:idle:0:${sessionId}`, iNever ? "success" : undefined),
          btn(`30m${i30m ? " ✓" : ""}`, `panel:idle:1800:${sessionId}`, i30m ? "success" : undefined),
          btn(`1h${i1h ? " ✓" : ""}`, `panel:idle:3600:${sessionId}`, i1h ? "success" : undefined),
          btn(`4h${i4h ? " ✓" : ""}`, `panel:idle:14400:${sessionId}`, i4h ? "success" : undefined),
          btn(`12h${i12h ? " ✓" : ""}`, `panel:idle:43200:${sessionId}`, i12h ? "success" : undefined),
        ],
        // Row 4: Actions
        [
          btn("↩ Back", `panel:back:${sessionId}`),
          btn("Cancel", `panel:cancel:${sessionId}`),
          btn("Stop", `panel:stop:${sessionId}`, "danger"),
        ],
      ],
    };

    // Cast raw keyboard for grammY (style field not in grammY types yet)
    const replyMarkup = keyboard as unknown as import("grammy").InlineKeyboard;

    try {
      if (editMessageId) {
        await this.bot.api.editMessageText(chatId, editMessageId, text, {
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        });
        return { message_id: editMessageId };
      } else {
        const sent = await this.bot.api.sendMessage(chatId, text, {
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

  killSession(sessionId: string): void {
    // Clear idle timer
    const cfg = this.sessionConfigs.get(sessionId);
    if (cfg?.idleTimer) {
      clearTimeout(cfg.idleTimer);
      cfg.idleTimer = undefined;
    }

    this.wsBridge.killSession(sessionId);

    const unsub = this.subscriptions.get(sessionId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(sessionId);
    }

    this.sessionConfigs.delete(sessionId);
    this.compactWarningSent.delete(sessionId);

    // Clean up stream subscriptions (reverse lookup: chatKey → sessionId)
    for (const [chatKey, sid] of this.streamSubscriptions.entries()) {
      if (sid === sessionId) {
        const unsubKey = `stream:${chatKey}:${sessionId}`;
        const streamUnsub = this.subscriptions.get(unsubKey);
        if (streamUnsub) {
          streamUnsub();
          this.subscriptions.delete(unsubKey);
        }
        this.streamSubscriptions.delete(chatKey);
        break;
      }
    }
  }

  // ── Anti mode state ──────────────────────────────────────────────────

  private antiModeKeys = new Set<string>();

  /** Check if anti mode is active for this chat+topic */
  isAntiMode(chatId: number, topicId: number): boolean {
    return this.antiModeKeys.has(`${chatId}:${topicId}`);
  }

  /** Toggle anti mode for this chat+topic */
  toggleAntiMode(chatId: number, topicId: number): boolean {
    const key = `${chatId}:${topicId}`;
    if (this.antiModeKeys.has(key)) {
      this.antiModeKeys.delete(key);
      return false;
    }
    this.antiModeKeys.add(key);
    return true;
  }

  // ── Convenience messaging (used by watchers + anti commands) ────────

  /** Send HTML message to a chat (with optional topic). Returns message ID. */
  async sendToChat(chatId: number, text: string, topicId?: number): Promise<number> {
    const sent = await this.bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
    return sent.message_id;
  }

  /** Send message with inline keyboard. Returns message ID. */
  async sendToChatWithKeyboard(
    chatId: number,
    text: string,
    keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string; style?: string }>> },
    topicId?: number,
  ): Promise<number> {
    const sent = await this.bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
      ...(topicId ? { message_thread_id: topicId } : {}),
    });
    return sent.message_id;
  }

  /** Edit an existing message. */
  async editMessage(chatId: number, messageId: number, text: string): Promise<void> {
    await this.bot.api.editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
    });
  }

  /** Pin a message in chat. */
  async pinMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.api.pinChatMessage(chatId, messageId);
    } catch (err) {
      log.warn("Failed to pin message", { chatId, messageId, error: String(err) });
    }
  }

  /** Get the grammY Bot API for direct access. */
  getAPI() {
    return this.bot.api;
  }

  // ── Subscribe to CLI output ───────────────────────────────────────────

  subscribeToSession(sessionId: string, chatId: number, topicId?: number): void {
    const subscriberId = `telegram:${this.config.botId}:${chatId}:${topicId ?? 0}`;

    const unsub = this.wsBridge.subscribe(sessionId, subscriberId, (msg) => {
      this.handleSessionMessage(chatId, topicId, sessionId, msg as BrowserIncomingMessage);
    });

    this.subscriptions.set(sessionId, unsub);
  }

  /** Send quick action buttons after session start */
  private async sendQuickActions(chatId: number, topicId: number | undefined, sessionId: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [[
        { text: "📋 Templates", callback_data: `quick:tpl:${sessionId}` },
        { text: "📌 Pin Panel", callback_data: `quick:pin:${sessionId}` },
        { text: "⚡ AA 30s", callback_data: `quick:aa30:${sessionId}` },
      ]],
    };

    try {
      await this.bot.api.sendMessage(chatId, "Quick actions:", {
        reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
        message_thread_id: topicId,
      });
    } catch (err) {
      log.error("Failed to send quick actions", { error: String(err) });
    }
  }

  /**
   * Wait for a session to reach "idle" status (CLI initialized).
   * Polls every 500ms up to maxWaitMs. Returns true if ready.
   */
  private waitForSessionReady(sessionId: string, maxWaitMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const session = this.wsBridge.getSession(sessionId);
        if (!session) { resolve(false); return; }
        if (session.state.status === "idle" || session.state.status === "busy") {
          resolve(true);
          return;
        }
        if (Date.now() - start > maxWaitMs) { resolve(false); return; }
        setTimeout(check, 500);
      };
      check();
    });
  }

  /**
   * Attach a chat to an existing session for stream-only observation.
   * Does NOT create a new CLI process. Does NOT set a full mapping.
   * The existing session keeps running normally; this just forwards events.
   */
  attachStreamToSession(sessionId: string, chatId: number, topicId?: number): boolean {
    const session = this.wsBridge.getSession(sessionId);
    if (!session) return false;

    const subscriberId = `stream:${this.config.botId}:${chatId}:${topicId ?? 0}`;

    // Remove any existing stream subscription for this chat
    const existingKey = `${chatId}:${topicId ?? 0}`;
    const existingSessionId = this.streamSubscriptions.get(existingKey);
    if (existingSessionId) {
      this.wsBridge.subscribe(existingSessionId, subscriberId, () => {})(); // unsubscribe immediately
    }

    const unsub = this.wsBridge.subscribe(sessionId, subscriberId, (msg) => {
      this.handleSessionMessage(chatId, topicId, sessionId, msg as BrowserIncomingMessage);
    });

    // Track this stream subscription so we can detach it
    const chatKey = `${chatId}:${topicId ?? 0}`;
    this.streamSubscriptions.set(chatKey, sessionId);

    // Store the unsubscribe function keyed by chatKey+sessionId
    const unsubKey = `stream:${chatKey}:${sessionId}`;
    this.subscriptions.set(unsubKey, unsub);

    log.info("Stream subscriber attached", { sessionId, chatId, topicId });
    return true;
  }

  /**
   * Detach a stream-only subscription for a chat.
   * Does NOT kill the session. Session continues running normally.
   */
  detachStream(chatId: number, topicId?: number): string | undefined {
    const chatKey = `${chatId}:${topicId ?? 0}`;
    const sessionId = this.streamSubscriptions.get(chatKey);
    if (!sessionId) return undefined;

    const unsubKey = `stream:${chatKey}:${sessionId}`;
    const unsub = this.subscriptions.get(unsubKey);
    if (unsub) {
      unsub();
      this.subscriptions.delete(unsubKey);
    }

    this.streamSubscriptions.delete(chatKey);
    log.info("Stream subscriber detached", { sessionId, chatId, topicId });
    return sessionId;
  }

  /** Get the sessionId this chat is stream-attached to (if any) */
  getStreamMapping(chatId: number, topicId?: number): string | undefined {
    return this.streamSubscriptions.get(`${chatId}:${topicId ?? 0}`);
  }

  // ── Debate tracking ──────────────────────────────────────────────────

  setActiveDebate(chatId: number, topicId: number | undefined, channelId: string): void {
    this.activeDebateChannels.set(this.mapKey(chatId, topicId), channelId);
  }

  getActiveDebateChannel(chatId: number, topicId: number | undefined): string | undefined {
    return this.activeDebateChannels.get(this.mapKey(chatId, topicId));
  }

  clearActiveDebate(chatId: number, topicId: number | undefined): void {
    this.activeDebateChannels.delete(this.mapKey(chatId, topicId));
  }

  /** Reverse lookup: find the stream subscriber info for a given sessionId */
  getStreamSubscriberForSession(sessionId: string): { chatId: number; topicId: number } | undefined {
    for (const [chatKey, sid] of this.streamSubscriptions.entries()) {
      if (sid === sessionId) {
        const [chatIdStr, topicIdStr] = chatKey.split(":");
        return { chatId: Number(chatIdStr), topicId: Number(topicIdStr) };
      }
    }
    return undefined;
  }

  private async handleSessionMessage(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    msg: BrowserIncomingMessage,
  ): Promise<void> {
    try {
      switch (msg.type) {
        case "assistant":
          await this.handleAssistantMessage(chatId, topicId, msg);
          break;

        case "stream_event":
          await this.handleStreamEvent(chatId, topicId, msg);
          break;

        case "result":
          await this.handleResultMessage(chatId, topicId, sessionId, msg.data);
          break;

        case "permission_request":
          await this.handlePermissionRequest(chatId, topicId, sessionId, msg.request);
          break;

        case "session_init": {
          // Store the cliSessionId in telegram_session_mappings when CLI initializes
          const cliSessionId = (msg.session as { session_id?: string })?.session_id;
          if (cliSessionId) {
            this.updateMappingCliSessionId(sessionId, cliSessionId);
          }
          break;
        }

        case "context_update":
          await this.handleContextUpdate(chatId, topicId, sessionId, msg.contextUsedPercent);
          break;

        case "status_change":
          if (msg.status === "ended") {
            this.removeMapping(chatId, topicId);
            // Send summary after a delay (wait for summarizer to finish)
            void this.sendSessionSummary(chatId, topicId, sessionId);
          }
          break;

        case "tool_progress":
          // Refresh typing indicator while tools run
          this.bot.api.sendChatAction(chatId, "typing", {
            message_thread_id: topicId,
          }).catch(() => {});
          break;

        case "error":
          await this.bot.api.sendMessage(chatId, `⚠️ ${escapeHTML(msg.message)}`, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          });
          break;
      }
    } catch (err) {
      log.error("Error handling session message", { chatId, error: String(err) });
    }
  }

  // ── Tool feed (progress indicators) ──────────────────────────────────

  /** Create or update the tool feed message ("Thinking...", "Running...") */
  private async upsertToolFeed(chatId: number, topicId: number | undefined, newLine: string): Promise<void> {
    const k = this.mapKey(chatId, topicId);

    // Create initial feed message if none exists
    let msgId = this.toolFeedMsgId.get(k);
    if (!msgId) {
      try {
        const sent = await this.bot.api.sendMessage(chatId, "🤔 <i>Thinking…</i>", {
          parse_mode: "HTML",
          message_thread_id: topicId,
        });
        msgId = sent.message_id;
        this.toolFeedMsgId.set(k, msgId);
        this.toolFeedLines.set(k, ["🤔 <i>Thinking…</i>"]);
      } catch {
        return;
      }
    }

    // Accumulate lines (keep last 15 to stay under Telegram 4096 char limit)
    const lines = this.toolFeedLines.get(k) ?? [];
    const trimmed = [...lines, newLine].slice(-15);
    this.toolFeedLines.set(k, trimmed);

    // Edit the feed message
    this.bot.api.editMessageText(chatId, msgId, trimmed.join("\n"), {
      parse_mode: "HTML",
    }).catch(() => {});
  }

  /** Clean up tool feed state after result */
  private cleanupToolFeed(chatId: number, topicId: number | undefined): void {
    const k = this.mapKey(chatId, topicId);
    this.toolFeedMsgId.delete(k);
    this.toolFeedLines.delete(k);
  }

  // ── Message handlers ──────────────────────────────────────────────────

  private async handleTextMessage(ctx: Context): Promise<void> {
    const chatId = ctx.chat!.id;
    const topicId = ctx.message?.message_thread_id;
    const text = ctx.message?.text ?? "";

    if (!text.trim()) return;

    // Anti mode: route messages to IDE via CDP (anti-role bots always, or when anti mode is toggled)
    if (this.config.role === "anti" || this.isAntiMode(chatId, topicId ?? 0)) {
      const antiCdp = await import("../services/anti-cdp.js");
      const { startChatWatcher, isChatWatcherRunning } = await import("../services/anti-chat-watcher.js");

      // Auto-start chat watcher so IDE responses come back to Telegram
      if (!isChatWatcherRunning()) {
        startChatWatcher(this, chatId, topicId ?? 0);
      }

      const result = await antiCdp.sendChatMessage(text);
      if (result.success) {
        // React with 👀 then ✅ on success
        try { await ctx.react("👍"); } catch { /* ignore */ }
      } else {
        await this.sendToChat(chatId, `⚠️ ${result.detail}`, topicId);
      }
      return;
    }

    const mapping = this.getMapping(chatId, topicId);

    if (!mapping) {
      // Auto-connect: if only 1 project, start session automatically
      const projects = listProjects();
      if (projects.length === 1) {
        await this.startSessionForChat(ctx, projects[0]!.slug);
        // Retry sending the message after session starts
        setTimeout(() => {
          const newMapping = this.getMapping(chatId, topicId);
          if (newMapping) {
            this.wsBridge.sendUserMessage(newMapping.sessionId, text, "telegram");
          }
        }, 2000);
        return;
      }

      await ctx.reply("No active session. Use /start to select a project.");
      return;
    }

    // Check if session is still alive
    const activeSession = this.wsBridge.getSession(mapping.sessionId);
    if (!activeSession) {
      // Session died — clear stale mapping and notify user
      this.removeMapping(chatId, topicId);
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
          await this.bot.api.sendMessage(chatId, `🔄 <i>${escapeHTML(translated)}</i>`, {
            parse_mode: "HTML",
            message_thread_id: topicId,
          }).catch(() => {});
        }
      } catch {
        // Translation failed — send original text
      }
    }

    // Acknowledge receipt with 👀 reaction + track for result reaction
    const userMsgId = ctx.message?.message_id;
    const k = this.mapKey(chatId, topicId);
    if (userMsgId) {
      this.bot.api.setMessageReaction(chatId, userMsgId, [{ type: "emoji", emoji: "👀" }]).catch(() => {});
      this.lastUserMsgId.set(k, userMsgId);
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
    this.wsBridge.sendUserMessage(mapping.sessionId, messageToSend, "telegram");

    // User is active — clear idle timer
    const sessionCfg = this.getSessionConfig(mapping.sessionId);
    if (sessionCfg.idleTimer) {
      clearTimeout(sessionCfg.idleTimer);
      sessionCfg.idleTimer = undefined;
    }

    // Stream will lazy-start on first appendText (no startStream needed)
  }

  private async handleAssistantMessage(
    chatId: number,
    topicId: number | undefined,
    msg: BrowserIncomingMessage & { type: "assistant" },
  ): Promise<void> {
    const content = msg.message?.content ?? [];
    if (!Array.isArray(content) || content.length === 0) return;

    // ── Tool progress: show tool_use blocks in the feed message ──
    const toolFeed = formatToolFeed(content as Array<{ type: string; name?: string; input?: unknown }>);
    if (toolFeed) {
      await this.upsertToolFeed(chatId, topicId, toolFeed);
    }

    // NOTE: Do NOT call streamHandler.appendText here.
    // stream_event deltas feed the stream incrementally.
    // assistant message contains the SAME full text — handled by stream handler.

    // ── File path detection: show "View File" buttons ──
    const textParts: string[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text) {
        textParts.push(block.text);
      }
    }
    if (textParts.length === 0) return;

    const text = textParts.join("\n");
    const filePaths = extractFilePaths(text);
    if (filePaths.length > 0) {
      const mapping = this.getMapping(chatId, topicId);
      if (mapping) {
        const sessionId = mapping.sessionId;
        const session = this.wsBridge.getSession(sessionId);
        const cwd = session?.state.cwd;
        if (cwd) {
          const rows = filePaths.slice(0, 5).map((fp) => [
            { text: `📂 ${fp}`, callback_data: `viewfile:${sessionId}:${fp}` },
          ]);

          await this.bot.api
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

  private async handleStreamEvent(
    chatId: number,
    topicId: number | undefined,
    msg: BrowserIncomingMessage & { type: "stream_event" },
  ): Promise<void> {
    // Only accept delta (incremental) text to avoid duplication
    const event = msg.event as { type?: string; text?: string; delta?: { text?: string } };
    const text = event?.delta?.text;

    if (text) {
      const k = this.mapKey(chatId, topicId);

      // Lock origin message ID on first chunk (prevents race with multi-message)
      const replyTo = this.lastUserMsgId.get(k);
      if (replyTo && !this.responseOriginMsg.has(k)) {
        this.responseOriginMsg.set(k, replyTo);
      }

      await this.streamHandler.appendText(chatId, text, topicId);
    }
  }

  private async handleResultMessage(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    result: CLIResultMessage,
  ): Promise<void> {
    // Complete the stream (sends final message)
    await this.streamHandler.completeStream(chatId, topicId);

    // Clean up tool feed
    this.cleanupToolFeed(chatId, topicId);

    // React on original user message: 👍 success / 👎 error
    const k = this.mapKey(chatId, topicId);
    const originMsgId = this.responseOriginMsg.get(k) ?? this.lastUserMsgId.get(k);
    if (originMsgId) {
      const emoji = result.is_error ? "👎" : "👍";
      this.bot.api.setMessageReaction(chatId, originMsgId, [{ type: "emoji", emoji }]).catch(() => {});
    }
    // Clean up turn-scoped state
    this.responseOriginMsg.delete(k);
    this.lastUserMsgId.delete(k);

    // Reset idle timer — session is now idle, start countdown
    this.resetIdleTimer(sessionId, chatId, topicId);

    // Send result summary if it was an error
    if (result.is_error) {
      const errorText = result.result ?? result.errors?.join("\n") ?? "Unknown error";
      await this.bot.api.sendMessage(
        chatId,
        `⚠️ <b>Error:</b> ${escapeHTML(errorText)}`,
        { parse_mode: "HTML", message_thread_id: topicId },
      );
    }
  }

  private async handleContextUpdate(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    contextUsedPercent: number,
  ): Promise<void> {
    if (contextUsedPercent < 80) return;
    if (this.compactWarningSent.has(sessionId)) return;

    this.compactWarningSent.add(sessionId);
    await this.bot.api.sendMessage(
      chatId,
      `⚠️ <b>Context ${Math.round(contextUsedPercent)}% full</b> — consider running <code>/compact</code> to compress history.`,
      { parse_mode: "HTML", message_thread_id: topicId },
    ).catch(() => {});
  }

  private async sendSessionSummary(chatId: number, topicId: number | undefined, sessionId: string): Promise<void> {
    // Wait for summarizer to finish (it runs async after session end)
    const maxWait = 15_000;
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const summary = getSessionSummary(sessionId);
      if (summary) {
        const files = summary.filesModified.length > 0
          ? `\n\n📁 <b>Files:</b> ${summary.filesModified.map((f) => `<code>${escapeHTML(f)}</code>`).join(", ")}`
          : "";
        const decisions = summary.keyDecisions.length > 0
          ? `\n\n🎯 <b>Decisions:</b>\n${summary.keyDecisions.map((d) => `• ${escapeHTML(d)}`).join("\n")}`
          : "";

        await this.bot.api.sendMessage(
          chatId,
          `📝 <b>Session Summary</b>\n\n${escapeHTML(summary.summary)}${decisions}${files}`,
          { parse_mode: "HTML", message_thread_id: topicId },
        ).catch(() => {});
        return;
      }
    }
    // If no summary generated after timeout, skip silently
  }

  private async handlePermissionRequest(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    request: PermissionRequest,
  ): Promise<void> {
    const key = this.mapKey(chatId, topicId);

    // Batch permissions: collect in 2s window
    const existing = this.permBatches.get(key);
    if (existing && existing.sessionId === sessionId) {
      existing.perms.push({
        requestId: request.request_id,
        toolName: request.tool_name,
        description: request.description,
      });
      return;
    }

    // Start new batch
    const batch: PermBatch = {
      perms: [{
        requestId: request.request_id,
        toolName: request.tool_name,
        description: request.description,
      }],
      sessionId,
      timer: setTimeout(() => {
        this.flushPermBatch(chatId, topicId, key);
      }, 2000),
    };

    this.permBatches.set(key, batch);
  }

  private async flushPermBatch(
    chatId: number,
    topicId: number | undefined,
    key: string,
  ): Promise<void> {
    const batch = this.permBatches.get(key);
    if (!batch) return;
    this.permBatches.delete(key);

    const { perms, sessionId } = batch;

    // Check auto-approve config
    const session = this.wsBridge.getSession(sessionId);
    const aa = session?.autoApproveConfig;
    const autoApproveSeconds = aa?.enabled ? (aa.timeoutSeconds ?? 0) : 0;

    // Format permission message
    const lines = perms.map((p) => formatPermission(p.toolName, p.description));
    const baseText = lines.join("\n\n");

    // Add countdown suffix if auto-approve is on
    const countdownSuffix = autoApproveSeconds > 0
      ? `\n\n⏱️ Auto-approve in <b>${autoApproveSeconds}s</b>`
      : "";

    // Build keyboard with styled allow/deny buttons (Telegram Bot API style field)
    type PermBtn = { text: string; callback_data: string; style?: string };
    const permRows: PermBtn[][] = [];

    if (perms.length === 1) {
      permRows.push([
        { text: "✅ Allow", callback_data: `perm:allow:${sessionId}:${perms[0]!.requestId}`, style: "success" },
        { text: "❌ Deny", callback_data: `perm:deny:${sessionId}:${perms[0]!.requestId}`, style: "danger" },
      ]);
    } else {
      for (const p of perms) {
        permRows.push([
          { text: `✅ ${p.toolName}`, callback_data: `perm:allow:${sessionId}:${p.requestId}`, style: "success" },
          { text: "❌", callback_data: `perm:deny:${sessionId}:${p.requestId}`, style: "danger" },
        ]);
      }
    }

    const sentMsg = await this.bot.api.sendMessage(chatId, baseText + countdownSuffix, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: permRows } as unknown as import("grammy").InlineKeyboard,
      message_thread_id: topicId,
    }).catch((err) => {
      log.error("Failed to send permission batch", { error: String(err) });
      return undefined;
    });

    // Start auto-approve countdown if enabled
    if (sentMsg && autoApproveSeconds > 0) {
      this.startAutoApproveCountdown(
        chatId, topicId, sentMsg.message_id,
        sessionId, perms, baseText, permRows, autoApproveSeconds,
      );
    }
  }

  private startAutoApproveCountdown(
    chatId: number,
    topicId: number | undefined,
    messageId: number,
    sessionId: string,
    perms: Array<{ requestId: string; toolName: string; description?: string }>,
    baseText: string,
    permRows: Array<Array<{ text: string; callback_data: string; style?: string }>>,
    totalSeconds: number,
  ): void {
    let remaining = totalSeconds;

    const interval = setInterval(async () => {
      remaining -= 3;

      if (remaining <= 0) {
        // Time's up — auto-approve all
        clearInterval(interval);
        this.autoApproveTimers.delete(messageId);

        for (const p of perms) {
          this.wsBridge.handleBrowserMessage(sessionId, JSON.stringify({
            type: "permission_response",
            request_id: p.requestId,
            behavior: "allow",
          }));
        }

        // Edit message to show approved (no keyboard)
        await this.bot.api.editMessageText(
          chatId, messageId,
          baseText + "\n\n✅ <b>Auto-approved</b>",
          { parse_mode: "HTML" },
        ).catch(() => {});
        return;
      }

      // Update countdown text, keep existing keyboard
      await this.bot.api.editMessageText(
        chatId, messageId,
        baseText + `\n\n⏱️ Auto-approve in <b>${remaining}s</b>`,
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: permRows } as unknown as import("grammy").InlineKeyboard,
        },
      ).catch(() => {});
    }, 3000);

    this.autoApproveTimers.set(messageId, interval);
  }

  /** Cancel auto-approve countdown for a specific message (on manual allow/deny) */
  cancelAutoApproveCountdown(messageId: number): void {
    const timer = this.autoApproveTimers.get(messageId);
    if (timer) {
      clearInterval(timer);
      this.autoApproveTimers.delete(messageId);
    }
  }

  /** Cancel all active auto-approve countdowns (on /allow or /deny commands) */
  cancelAllAutoApproveCountdowns(): void {
    for (const timer of this.autoApproveTimers.values()) {
      clearInterval(timer);
    }
    this.autoApproveTimers.clear();
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private loadMappings(): void {
    try {
      const db = getDb();
      const rows = db.select().from(telegramSessionMappings).all();

      let loaded = 0;
      let dead = 0;
      let stale = 0;

      for (const row of rows) {
        const topicId = row.topicId ?? 0;
        const activeSession = this.wsBridge.getSession(row.sessionId);

        if (activeSession) {
          // Session is alive — restore mapping + subscribe
          const key = this.mapKey(row.chatId, topicId || undefined);
          this.mappings.set(key, {
            sessionId: row.sessionId,
            projectSlug: row.projectSlug,
            model: row.model,
            topicId: topicId || undefined,
          });
          this.subscribeToSession(row.sessionId, row.chatId, topicId || undefined);
          loaded++;
        } else if (row.cliSessionId) {
          // CLI died but has cliSessionId — can be resumed
          const key = this.mapKey(row.chatId, topicId || undefined);
          this.deadSessions.set(key, {
            chatId: row.chatId,
            topicId,
            sessionId: row.sessionId,
            cliSessionId: row.cliSessionId,
            projectSlug: row.projectSlug,
            model: row.model,
            diedAt: Date.now(),
          });
          dead++;
        } else {
          // No cliSessionId — truly stale, clean up
          db.delete(telegramSessionMappings)
            .where(eq(telegramSessionMappings.id, row.id))
            .run();
          stale++;
        }
      }

      log.info("Loaded Telegram mappings", { loaded, dead, stale, total: rows.length });
    } catch (err) {
      log.error("Failed to load mappings", { error: String(err) });
    }
  }

  private updateMappingCliSessionId(sessionId: string, cliSessionId: string): void {
    try {
      const db = getDb();
      db.update(telegramSessionMappings)
        .set({ cliSessionId })
        .where(eq(telegramSessionMappings.sessionId, sessionId))
        .run();
    } catch (err) {
      log.error("Failed to update mapping cliSessionId", { sessionId, error: String(err) });
    }
  }

  private persistMapping(chatId: number, topicId: number | undefined, mapping: ChatMapping): void {
    try {
      const db = getDb();

      // Upsert: delete existing for this chat+topic, then insert
      db.delete(telegramSessionMappings)
        .where(
          and(
            eq(telegramSessionMappings.chatId, chatId),
            topicId !== undefined
              ? eq(telegramSessionMappings.topicId, topicId)
              : isNull(telegramSessionMappings.topicId),
          ),
        )
        .run();

      db.insert(telegramSessionMappings)
        .values({
          chatId,
          sessionId: mapping.sessionId,
          projectSlug: mapping.projectSlug,
          model: mapping.model,
          topicId: topicId ?? null,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        })
        .run();
    } catch (err) {
      log.error("Failed to persist mapping", { error: String(err) });
    }
  }
}
