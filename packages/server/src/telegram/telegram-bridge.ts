/**
 * TelegramBridge — Core orchestrator between Telegram and WsBridge/CLI.
 * Manages chat-to-session mappings, routes messages, handles streaming.
 *
 * Message handlers, permission handlers, and session event handlers are
 * extracted to separate modules for maintainability:
 * - telegram-message-handlers.ts — user input (text, photo, document)
 * - telegram-permission-handler.ts — permission batching + auto-approve
 * - telegram-session-events.ts — CLI output (assistant, stream, result, child agents)
 */

import { type Bot, type Context } from "grammy";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { telegramSessionMappings, telegramForumTopics } from "../db/schema.js";
import { createBot, registerCommands, type BotConfig } from "./bot-factory.js";
import { StreamHandler } from "./stream-handler.js";
import { escapeHTML, shortModelName, modelStrength } from "./formatter.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerControlCommands } from "./commands/control.js";
import { registerInfoCommands } from "./commands/info.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerPanelCommands } from "./commands/panel.js";
import { registerUtilityCommands } from "./commands/utility.js";
import { registerTemplateCommands } from "./commands/template.js";
import { registerWikiCommands } from "./commands/wiki.js";
import { registerMoodCommands } from "./commands/mood.js";
import { getLatestReading, type OperationalState } from "../services/pulse-estimator.js";
import { createLogger } from "../logger.js";
import { getProject } from "../services/project-profiles.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BrowserIncomingMessage } from "@companion/shared";

// Extracted handlers
import {
  handleTextMessage,
  handlePhotoMessage,
  handleDocumentMessage,
} from "./telegram-message-handlers.js";
import {
  handlePermissionRequest,
  cancelAutoApproveCountdown as cancelAutoApproveCountdownFn,
  cancelAllAutoApproveCountdowns as cancelAllAutoApproveCountdownsFn,
  type PermBatch,
} from "./telegram-permission-handler.js";
import {
  handleAssistantMessage,
  handleStreamEvent,
  handleResultMessage,
  handleContextUpdate,
  sendSessionSummary,
  handleChildSpawned,
  handleChildEnded,
} from "./telegram-session-events.js";

const log = createLogger("telegram-bridge");

// ─── Chat-Session Mapping ───────────────────────────────────────────────────

interface ChatMapping {
  sessionId: string;
  projectSlug: string;
  model: string;
  topicId?: number;
}

/** Max time a session can stay "busy" without any tool_progress/result event (10 min) */
const BUSY_WATCHDOG_MS = 10 * 60 * 1000;

/** Per-session panel + idle config stored in memory */
interface SessionConfig {
  /** Telegram message_id of the settings panel message (for editing) */
  panelMessageId?: number;
  /** Idle timeout in ms (0 = never) */
  idleTimeoutMs: number;
  /** Idle timeout timer handle */
  idleTimer?: ReturnType<typeof setTimeout>;
  /** Warning timer — fires before idle kill */
  idleWarningTimer?: ReturnType<typeof setTimeout>;
  /** Busy watchdog timer — kills session if stuck busy with no activity */
  busyWatchdog?: ReturnType<typeof setTimeout>;
  /** Last time idle timer was reset — used to debounce resets from stream events */
  lastIdleReset?: number;
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

// PermBatch type imported from telegram-permission-handler.ts

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
  /** @internal — used by extracted session-events module */
  readonly streamHandler: StreamHandler;

  /** chatId:topicId → mapping */
  private mappings = new Map<string, ChatMapping>();
  /** sessionId → per-session config (panel msg id, idle timeout, etc.) */
  private sessionConfigs = new Map<string, SessionConfig>();
  /** chatId:topicId → permission batch — @internal for permission-handler */
  permBatches = new Map<string, PermBatch>();
  /** sessionId → unsubscribe function */
  private subscriptions = new Map<string, () => void>();
  /** sessionIds that already received a compact warning (prevent spam) — @internal */
  compactWarningSent = new Set<string>();
  /** sessionId → detailed context breakdown HTML (for expand callback) */
  private contextBreakdowns = new Map<string, string>();
  /** sessionId → stream-only subscriber key (chatId:topicId) — for /stream without owning the session */
  private streamSubscriptions = new Map<string, string>();
  /** Dead sessions available for resume (keyed by "chatId:topicId") */
  private deadSessions = new Map<string, DeadSessionInfo>();
  /** chatId:topicId → user message ID locked at first response chunk — @internal */
  lastUserMsgId = new Map<string, number>();
  /** chatId:topicId → locked origin message ID — @internal */
  responseOriginMsg = new Map<string, number>();
  /** chatId:topicId → tool feed message ID (the "Thinking..." / "Running..." message) */
  private toolFeedMsgId = new Map<string, number>();
  /** chatId:topicId → accumulated tool feed lines */
  private toolFeedLines = new Map<string, string[]>();
  /** Active debate channel per chat (chatKey → channelId) */
  private activeDebateChannels = new Map<string, string>();

  // Pulse auto-alert state
  private pulseAlertCooldowns = new Map<string, number>();
  private pulsePrevState = new Map<string, OperationalState>();
  /** viewfile callback cache: short key → { sessionId, filePath } */
  viewFileCache = new Map<string, { sessionId: string; filePath: string }>();
  private viewFileCounter = 0;
  /** Active auto-approve countdowns — @internal for permission-handler */
  autoApproveTimers = new Map<number, ReturnType<typeof setInterval>>();
  /** Reverse index: sessionId → Set of messageIds — @internal for permission-handler */
  sessionAutoApproveMessages = new Map<string, Set<number>>();

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
    registerMoodCommands(this);
    registerWikiCommands(this);
    // Handle text messages (not commands) — delegated to telegram-message-handlers
    this.bot.on("message:text", async (ctx) => {
      if (ctx.message.text.startsWith("/")) return;
      await handleTextMessage(this, ctx);
    });

    // Handle photo messages — delegated to telegram-message-handlers
    this.bot.on("message:photo", async (ctx) => {
      await handlePhotoMessage(this, ctx);
    });

    // Handle document messages — delegated to telegram-message-handlers
    this.bot.on("message:document", async (ctx) => {
      await handleDocumentMessage(this, ctx);
    });

    // Handle voice messages (placeholder)
    this.bot.on("message:voice", async (ctx) => {
      await ctx.reply("🎤 Voice messages are not yet supported. Please type your message instead.");
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

    // Clear idle + warning + busy timers
    for (const cfg of this.sessionConfigs.values()) {
      if (cfg.idleTimer) clearTimeout(cfg.idleTimer);
      if (cfg.idleWarningTimer) clearTimeout(cfg.idleWarningTimer);
      if (cfg.busyWatchdog) clearTimeout(cfg.busyWatchdog);
    }
    this.sessionConfigs.clear();

    // Clear auto-approve countdown timers
    for (const timer of this.autoApproveTimers.values()) {
      clearInterval(timer);
    }
    this.autoApproveTimers.clear();
    this.sessionAutoApproveMessages.clear();

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

  /** Reset the idle timer for a session. Called on session start, user message, CLI activity + result events. */
  resetIdleTimer(sessionId: string, chatId: number, topicId?: number): void {
    const cfg = this.getSessionConfig(sessionId);
    cfg.lastIdleReset = Date.now();

    if (cfg.idleTimer) {
      clearTimeout(cfg.idleTimer);
      cfg.idleTimer = undefined;
    }
    if (cfg.idleWarningTimer) {
      clearTimeout(cfg.idleWarningTimer);
      cfg.idleWarningTimer = undefined;
    }

    // Clear busy watchdog — session is no longer busy
    if (cfg.busyWatchdog) {
      clearTimeout(cfg.busyWatchdog);
      cfg.busyWatchdog = undefined;
    }

    if (cfg.idleTimeoutMs <= 0) return;

    const WARN_BEFORE_MS = 5 * 60 * 1000; // 5 minutes

    // Warning before kill (only if timeout > 5 min)
    if (cfg.idleTimeoutMs > WARN_BEFORE_MS) {
      cfg.idleWarningTimer = setTimeout(async () => {
        cfg.idleWarningTimer = undefined;

        // Guard: check session still exists AND still belongs to this chat
        const session = this.wsBridge.getSession(sessionId);
        if (!session) return;
        const currentMapping = this.getMapping(chatId, topicId);
        if (currentMapping?.sessionId !== sessionId) return; // chat moved to different session

        const keyboard = {
          inline_keyboard: [
            [
              { text: "💬 Keep Alive", callback_data: `panel:idle:extend:${sessionId}` },
              { text: "💤 Let it go", callback_data: `panel:idle:letgo:${sessionId}` },
            ],
          ],
        };

        await this.bot.api
          .sendMessage(
            chatId,
            "⏰ Session idle — auto-stop in <b>5 minutes</b>. Send a message or tap below.",
            {
              parse_mode: "HTML",
              reply_markup: keyboard as unknown as import("grammy").InlineKeyboard,
              message_thread_id: topicId,
            },
          )
          .catch(() => {});
      }, cfg.idleTimeoutMs - WARN_BEFORE_MS);
    }

    // Kill timer
    cfg.idleTimer = setTimeout(async () => {
      cfg.idleTimer = undefined;

      // Guard: check session still exists AND still belongs to this chat
      const session = this.wsBridge.getSession(sessionId);
      if (!session) return;
      const currentMapping = this.getMapping(chatId, topicId);
      if (currentMapping?.sessionId !== sessionId) return; // chat moved to different session

      log.info("Idle timeout expired, stopping session permanently", {
        sessionId,
        idleMs: cfg.idleTimeoutMs,
      });
      this.killSession(sessionId);
      this.removeMapping(chatId, topicId);

      // Idle timeout = permanent kill — clear cliSessionId so session can't be resumed
      this.clearDeadSession(chatId, topicId ?? 0);
      try {
        const db = getDb();
        db.update(telegramSessionMappings)
          .set({ cliSessionId: null })
          .where(eq(telegramSessionMappings.sessionId, sessionId))
          .run();
      } catch {
        // non-fatal
      }

      const minutes = Math.round(cfg.idleTimeoutMs / 60_000);
      const label = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
      await this.bot.api
        .sendMessage(
          chatId,
          `⏰ Session idle for ${label}, stopped. Use /start for a new session.`,
          {
            message_thread_id: topicId,
          },
        )
        .catch(() => {});
    }, cfg.idleTimeoutMs);
  }

  /**
   * Reset the busy watchdog. Called on any sign of life from CLI (tool_progress, assistant, stream).
   * If no activity for BUSY_WATCHDOG_MS while session is busy, notify user and kill session.
   */
  private resetBusyWatchdog(sessionId: string, chatId: number, topicId?: number): void {
    const cfg = this.getSessionConfig(sessionId);

    if (cfg.busyWatchdog) {
      clearTimeout(cfg.busyWatchdog);
      cfg.busyWatchdog = undefined;
    }

    cfg.busyWatchdog = setTimeout(async () => {
      cfg.busyWatchdog = undefined;
      const session = this.wsBridge.getSession(sessionId);
      if (!session) return;
      // Only kill if still busy (not already idle/ended)
      if (session.state.status !== "busy") return;

      log.warn("Session stuck busy with no activity, force-stopping", {
        sessionId,
        watchdogMs: BUSY_WATCHDOG_MS,
      });

      // Flush any pending stream before killing
      await this.streamHandler.completeStream(chatId, topicId);
      this.cleanupToolFeed(chatId, topicId);

      this.killSession(sessionId);
      this.removeMapping(chatId, topicId);

      await this.bot.api
        .sendMessage(
          chatId,
          `⚠️ <b>Session unresponsive</b> for 10 min — force stopped. Use /start to begin a new session.`,
          { parse_mode: "HTML", message_thread_id: topicId },
        )
        .catch(() => {});
    }, BUSY_WATCHDOG_MS);
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

  /** @internal — used by extracted handler modules */
  mapKey(chatId: number, topicId?: number): string {
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
      thinkingBudget?: number;
    },
  ): Promise<void> {
    const chatId = ctx.chat!.id;
    const topicId =
      ctx.message?.message_thread_id ??
      (ctx.callbackQuery?.message as { message_thread_id?: number })?.message_thread_id;

    const project = getProject(projectSlug);
    if (!project) {
      await ctx.reply(`Project <code>${escapeHTML(projectSlug)}</code> not found.`, {
        parse_mode: "HTML",
      });
      return;
    }

    // Auto-route to forum topic: if in a group and not already in a topic,
    // try to get or create a forum topic for this project
    let effectiveTopicId = topicId;
    if (chatId < 0 && !topicId) {
      const forumTopicId = await this.getOrCreateForumTopic(chatId, projectSlug, project.name);
      if (forumTopicId) {
        effectiveTopicId = forumTopicId;
      }
    }

    // Kill existing session if any — but preserve its idle config
    const existing = this.getMapping(chatId, effectiveTopicId);
    let inheritedIdleMs: number | undefined;
    if (existing) {
      const oldCfg = this.sessionConfigs.get(existing.sessionId);
      if (oldCfg) {
        inheritedIdleMs = oldCfg.idleTimeoutMs;
      }
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
        thinkingBudget: opts?.thinkingBudget,
      });

      const mapping: ChatMapping = {
        sessionId,
        projectSlug: project.slug,
        model: effectiveModel,
      };

      this.setMapping(chatId, effectiveTopicId, mapping);
      this.subscribeToSession(sessionId, chatId, effectiveTopicId);

      // Inherit idle timeout: from previous active session, or from DB (resume case)
      if (inheritedIdleMs !== undefined) {
        this.setIdleTimeout(sessionId, inheritedIdleMs);
      } else if (opts?.resume && opts?.cliSessionId) {
        // Resume from dead session — look up persisted idle timeout from old mapping
        try {
          const db = getDb();
          const oldRow = db
            .select({ idleTimeoutMs: telegramSessionMappings.idleTimeoutMs })
            .from(telegramSessionMappings)
            .where(eq(telegramSessionMappings.cliSessionId, opts.cliSessionId))
            .get();
          if (oldRow && oldRow.idleTimeoutMs !== 3_600_000) {
            this.setIdleTimeout(sessionId, oldRow.idleTimeoutMs);
          }
        } catch {
          // non-fatal — use default
        }
      }

      // Send settings panel (includes status + inline keyboard)
      const panelMsg = await this.sendSettingsPanel(
        chatId,
        effectiveTopicId,
        sessionId,
        project.name,
        effectiveModel,
      );
      if (panelMsg) {
        this.setSessionPanelMessageId(sessionId, panelMsg.message_id);
      }

      // Start idle timer immediately (prevents zombie sessions if user never sends a message)
      this.resetIdleTimer(sessionId, chatId, effectiveTopicId);

      // Send initial prompt from template once session is ready
      if (opts?.initialPrompt) {
        const prompt = opts.initialPrompt;
        this.waitForSessionReady(sessionId, 15_000).then((ready) => {
          if (ready) {
            this.wsBridge.sendUserMessage(sessionId, prompt, "telegram");
          } else {
            log.warn("Session not ready in time for initial prompt", { sessionId });
            this.bot.api
              .sendMessage(
                chatId,
                "⚠️ Session took too long to start. Send your prompt manually.",
                effectiveTopicId ? { message_thread_id: effectiveTopicId } : {},
              )
              .catch(() => {});
          }
        });
      }

      log.info("Session started from Telegram", {
        chatId,
        topicId: effectiveTopicId,
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
    let contextStr = "";
    if (state) {
      const totalTokens =
        state.total_input_tokens + state.total_output_tokens + state.cache_read_tokens;
      if (totalTokens > 0) {
        const maxTokens = state.model.includes("haiku") ? 200_000 : 1_000_000;
        const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100));
        contextStr = ` · Tokens: ~${pct}%`;
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

    const keyboard = {
      inline_keyboard: [
        // Row 1: Model + Status
        [
          btn(`Model: ${modelShort}`, `panel:model:${sessionId}`, "primary"),
          btn("Status", `panel:status:${sessionId}`),
        ],
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
    // Clear ALL timers: idle kill, idle warning, busy watchdog
    const cfg = this.sessionConfigs.get(sessionId);
    if (cfg?.idleTimer) {
      clearTimeout(cfg.idleTimer);
      cfg.idleTimer = undefined;
    }
    if (cfg?.idleWarningTimer) {
      clearTimeout(cfg.idleWarningTimer);
      cfg.idleWarningTimer = undefined;
    }
    if (cfg?.busyWatchdog) {
      clearTimeout(cfg.busyWatchdog);
      cfg.busyWatchdog = undefined;
    }

    this.wsBridge.killSession(sessionId);

    const unsub = this.subscriptions.get(sessionId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(sessionId);
    }

    this.sessionConfigs.delete(sessionId);
    this.compactWarningSent.delete(sessionId);

    // Clear auto-approve countdown timers belonging to this session
    const approvalMsgIds = this.sessionAutoApproveMessages.get(sessionId);
    if (approvalMsgIds) {
      for (const msgId of approvalMsgIds) {
        const timer = this.autoApproveTimers.get(msgId);
        if (timer) {
          clearInterval(timer);
          this.autoApproveTimers.delete(msgId);
        }
      }
      this.sessionAutoApproveMessages.delete(sessionId);
    }

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

  // ── Convenience messaging ───────────────────────────────────────────

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
    keyboard: {
      inline_keyboard: Array<Array<{ text: string; callback_data: string; style?: string }>>;
    },
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

  // ── Accessors for extracted handler modules ──────────────────────────

  /** @internal — generate unique key for viewFile callback cache */
  nextViewFileKey(): string {
    return `vf${++this.viewFileCounter}`;
  }

  /** @internal — iterate mappings (for child-ended topic lookup) */
  getMappingsEntries(): IterableIterator<[string, ChatMapping]> {
    return this.mappings.entries();
  }

  /**
   * Wait for a session to reach "idle" status (CLI initialized).
   * Polls every 500ms up to maxWaitMs. Returns true if ready.
   */
  waitForSessionReady(sessionId: string, maxWaitMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const session = this.wsBridge.getSession(sessionId);
        if (!session) {
          resolve(false);
          return;
        }
        if (session.state.status === "idle" || session.state.status === "busy") {
          resolve(true);
          return;
        }
        if (Date.now() - start > maxWaitMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  /** @internal — Create or update the tool feed message */
  async upsertToolFeed(
    chatId: number,
    topicId: number | undefined,
    newLine: string,
  ): Promise<void> {
    const k = this.mapKey(chatId, topicId);

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

    const lines = this.toolFeedLines.get(k) ?? [];
    const trimmed = [...lines, newLine].slice(-15);
    this.toolFeedLines.set(k, trimmed);

    this.bot.api
      .editMessageText(chatId, msgId, trimmed.join("\n"), {
        parse_mode: "HTML",
      })
      .catch(() => {});
  }

  /** @internal — Clean up tool feed state after result */
  cleanupToolFeed(chatId: number, topicId: number | undefined): void {
    const k = this.mapKey(chatId, topicId);
    this.toolFeedMsgId.delete(k);
    this.toolFeedLines.delete(k);
  }

  // ── Permission handler delegation ──────────────────────────────────────

  /** Cancel auto-approve countdown for a specific message (on manual allow/deny) */
  cancelAutoApproveCountdown(messageId: number): void {
    cancelAutoApproveCountdownFn(this, messageId);
  }

  /** Cancel all active auto-approve countdowns (on /allow or /deny commands) */
  cancelAllAutoApproveCountdowns(): void {
    cancelAllAutoApproveCountdownsFn(this);
  }

  // ── Subscribe to CLI output ───────────────────────────────────────────

  subscribeToSession(sessionId: string, chatId: number, topicId?: number): void {
    const subscriberId = `telegram:${this.config.botId}:${chatId}:${topicId ?? 0}`;

    const unsub = this.wsBridge.subscribe(sessionId, subscriberId, (msg) => {
      this.handleSessionMessage(chatId, topicId, sessionId, msg as BrowserIncomingMessage);
    });

    this.subscriptions.set(sessionId, unsub);
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

    // Create a lightweight mapping so Telegram can send messages to this session
    const projectSlug = session.state.name ?? session.state.session_id ?? sessionId.slice(0, 8);
    const model = session.state.model ?? "claude-sonnet-4-6";
    if (!this.getMapping(chatId, topicId)) {
      this.mappings.set(this.mapKey(chatId, topicId), {
        sessionId,
        projectSlug,
        model,
        topicId,
      });
    }

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

    // Remove the lightweight mapping created by attachStreamToSession
    // (only if the mapping was created for stream, not for a full /start session)
    const mapping = this.getMapping(chatId, topicId);
    if (mapping?.sessionId === sessionId) {
      this.removeMapping(chatId, topicId);
    }

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

  // ── Forum topic management (1 project = 1 forum topic per group) ────

  /**
   * Get or create a forum topic for a project in a group chat.
   * Returns the topic ID, or undefined if forum topics are not supported.
   */
  async getOrCreateForumTopic(
    chatId: number,
    projectSlug: string,
    projectName: string,
  ): Promise<number | undefined> {
    // Only works in group chats (negative chatId)
    if (chatId >= 0) return undefined;

    const db = getDb();

    // Check if we already have a topic for this project in this group
    const existing = db
      .select()
      .from(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .get();

    if (existing) {
      return existing.topicId;
    }

    // Try to create a new forum topic
    try {
      const topicName = `📂 ${projectName}`;
      const forumTopic = await this.bot.api.createForumTopic(chatId, topicName);
      const topicId = forumTopic.message_thread_id;

      db.insert(telegramForumTopics)
        .values({
          chatId,
          projectSlug,
          topicId,
          topicName,
        })
        .run();

      log.info("Created forum topic", { chatId, projectSlug, topicId, topicName });
      return topicId;
    } catch {
      // Forum topics not enabled in this group — that's fine
      return undefined;
    }
  }

  /** Get the stored forum topic for a project (no creation). */
  getForumTopicId(chatId: number, projectSlug: string): number | undefined {
    const db = getDb();
    const row = db
      .select({ topicId: telegramForumTopics.topicId })
      .from(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .get();
    return row?.topicId;
  }

  /** List all forum topics for a group chat. */
  listForumTopics(
    chatId: number,
  ): Array<{ projectSlug: string; topicId: number; topicName: string }> {
    const db = getDb();
    return db
      .select({
        projectSlug: telegramForumTopics.projectSlug,
        topicId: telegramForumTopics.topicId,
        topicName: telegramForumTopics.topicName,
      })
      .from(telegramForumTopics)
      .where(eq(telegramForumTopics.chatId, chatId))
      .all();
  }

  /** Delete a forum topic mapping (does NOT delete the Telegram topic itself). */
  deleteForumTopicMapping(chatId: number, projectSlug: string): void {
    const db = getDb();
    db.delete(telegramForumTopics)
      .where(
        and(
          eq(telegramForumTopics.chatId, chatId),
          eq(telegramForumTopics.projectSlug, projectSlug),
        ),
      )
      .run();
  }

  /** Reverse lookup: find the stream subscriber info for a given sessionId */
  getStreamSubscriberForSession(
    sessionId: string,
  ): { chatId: number; topicId: number } | undefined {
    for (const [chatKey, sid] of this.streamSubscriptions.entries()) {
      if (sid === sessionId) {
        const [chatIdStr, topicIdStr] = chatKey.split(":");
        return { chatId: Number(chatIdStr), topicId: Number(topicIdStr) };
      }
    }
    return undefined;
  }

  // ── Session message router (delegates to extracted handlers) ──────────

  private async handleSessionMessage(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    msg: BrowserIncomingMessage,
  ): Promise<void> {
    try {
      // Reset busy watchdog + idle timer on any sign of CLI activity
      if (msg.type === "assistant" || msg.type === "tool_progress" || msg.type === "stream_event") {
        this.resetBusyWatchdog(sessionId, chatId, topicId);

        // Debounce idle timer reset — stream events fire rapidly, only reset every 30s
        const cfg = this.getSessionConfig(sessionId);
        const now = Date.now();
        if (!cfg.lastIdleReset || now - cfg.lastIdleReset > 30_000) {
          cfg.lastIdleReset = now;
          this.resetIdleTimer(sessionId, chatId, topicId ?? undefined);
        }
      }

      switch (msg.type) {
        case "assistant":
          await handleAssistantMessage(this, chatId, topicId, msg);
          break;

        case "stream_event":
          await handleStreamEvent(this, chatId, topicId, msg);
          break;

        case "result":
          await handleResultMessage(this, chatId, topicId, sessionId, msg.data);
          break;

        case "permission_request":
          await handlePermissionRequest(this, chatId, topicId, sessionId, msg.request);
          break;

        case "session_init": {
          // Store the cliSessionId in telegram_session_mappings when CLI initializes
          const cliSessionId = (msg.session as { session_id?: string })?.session_id;
          if (cliSessionId) {
            this.updateMappingCliSessionId(sessionId, cliSessionId);
          }
          break;
        }

        case "context_breakdown": {
          // Only store breakdown silently — don't send a message.
          // Users access it via the 📊 button shown in session_init or /context command.
          if ("breakdown" in msg) {
            const { formatBreakdownDetailed } = await import("../services/context-estimator.js");
            const bd = msg.breakdown as import("../services/context-estimator.js").ContextBreakdown;
            this.contextBreakdowns.set(sessionId, formatBreakdownDetailed(bd));
          }
          break;
        }

        case "context_update":
          await handleContextUpdate(this, chatId, topicId, sessionId, msg.contextUsedPercent);
          break;

        case "cost_warning": {
          const icon = msg.level === "critical" ? "🔴" : "⚠️";
          await this.bot.api
            .sendMessage(
              chatId,
              `${icon} <b>Cost Budget ${msg.level === "critical" ? "Reached" : "Warning"}</b>\n${escapeHTML(msg.message)}\n\nUse <code>/stop</code> to end session or continue working.`,
              { parse_mode: "HTML", message_thread_id: topicId },
            )
            .catch(() => {});
          break;
        }

        case "cli_disconnected": {
          // CLI process died — flush any pending stream text so it's not lost
          await this.streamHandler.completeStream(chatId, topicId);
          this.cleanupToolFeed(chatId, topicId);

          // Build user-friendly disconnect message
          const exitCode = (msg as unknown as { exitCode?: number }).exitCode;
          const reason = (msg as unknown as { reason?: string }).reason;

          let icon = "⚠️";
          let title = "Session ended";
          let detail = "";

          if (exitCode === 143 || exitCode === 137) {
            // SIGTERM / SIGKILL — normal stop
            icon = "🔴";
            title = "Session stopped";
            detail = "The session was terminated normally.";
          } else if (exitCode === 0 || exitCode === null || exitCode === undefined) {
            icon = "✅";
            title = "Session completed";
            detail = "Task finished successfully.";
          } else if (reason?.includes("crashed on startup")) {
            icon = "❌";
            title = "Session failed to start";
            detail = "Check that Claude Code CLI is installed and authenticated.";
          } else {
            icon = "⚠️";
            title = "Session disconnected";
            detail = reason
              ? escapeHTML(reason.slice(0, 300))
              : `Unexpected exit (code ${exitCode ?? "unknown"})`;
          }

          const hint = "\n\nUse /start to begin a new session.";
          await this.bot.api
            .sendMessage(chatId, `${icon} <b>${title}</b>\n${detail}${hint}`, {
              parse_mode: "HTML",
              message_thread_id: topicId,
            })
            .catch(() => {});

          // Clean up stale mapping so /resume doesn't see "already active"
          this.removeMapping(chatId, topicId);
          // Clean up session config timers
          const dcCfg = this.sessionConfigs.get(sessionId);
          if (dcCfg) {
            if (dcCfg.idleTimer) clearTimeout(dcCfg.idleTimer);
            if (dcCfg.idleWarningTimer) clearTimeout(dcCfg.idleWarningTimer);
            if (dcCfg.busyWatchdog) clearTimeout(dcCfg.busyWatchdog);
            this.sessionConfigs.delete(sessionId);
          }
          break;
        }

        case "status_change":
          if (msg.status === "ended") {
            // Flush any pending stream text before cleanup
            await this.streamHandler.completeStream(chatId, topicId);
            this.cleanupToolFeed(chatId, topicId);
            this.removeMapping(chatId, topicId);
            this.pulseAlertCooldowns.delete(sessionId);
            this.pulsePrevState.delete(sessionId);
            // Send summary after a delay (wait for summarizer to finish)
            void sendSessionSummary(this, chatId, topicId, sessionId);
          }
          break;

        case "tool_progress":
          // Refresh typing indicator while tools run
          this.bot.api
            .sendChatAction(chatId, "typing", {
              message_thread_id: topicId,
            })
            .catch(() => {});
          break;

        case "user_message": {
          // Show messages sent from Web/API in the Telegram chat
          const userSource = (msg as unknown as { source?: string }).source;
          if (userSource && userSource !== "telegram") {
            const userText = (msg as unknown as { content?: string }).content ?? "";
            if (userText.trim()) {
              const label = userSource === "web" ? "🌐 Web" : "📡 API";
              await this.bot.api
                .sendMessage(chatId, `<i>${label}:</i>\n${escapeHTML(userText.slice(0, 2000))}`, {
                  parse_mode: "HTML",
                  message_thread_id: topicId,
                })
                .catch(() => {});
            }
          }
          break;
        }

        case "child_spawned":
          await handleChildSpawned(this, chatId, topicId, sessionId, msg);
          break;

        case "child_ended":
          await handleChildEnded(this, chatId, topicId, msg);
          break;

        case "pulse:update": {
          const ALERT_STATES = new Set<OperationalState>(["struggling", "spiraling", "blocked"]);
          const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts per session

          const prevState = this.pulsePrevState.get(sessionId);
          const newState = msg.state as OperationalState;
          this.pulsePrevState.set(sessionId, newState);

          // Alert on: (1) transition INTO an alert state, or (2) escalation within alert states
          // Skip if: not an alert state, or same state as before (no change)
          if (!ALERT_STATES.has(newState) || newState === prevState) {
            break;
          }

          // Cooldown check
          const lastAlert = this.pulseAlertCooldowns.get(sessionId) ?? 0;
          if (Date.now() - lastAlert < COOLDOWN_MS) break;

          this.pulseAlertCooldowns.set(sessionId, Date.now());

          const session = this.wsBridge.getSession(sessionId);
          const shortId = session?.state.short_id ?? sessionId.slice(0, 8);
          const projectName = session?.state.name ?? "Unknown";

          const stateEmoji: Record<string, string> = {
            struggling: "🟡",
            spiraling: "🔴",
            blocked: "⏸",
          };
          const emoji = stateEmoji[newState] ?? "⚠️";
          const stateLabel = newState.charAt(0).toUpperCase() + newState.slice(1);

          const SIGNAL_LABELS: Record<string, string> = {
            failureRate: "Failure Rate",
            editChurn: "Edit Churn",
            costAccel: "Cost Accel",
            contextPressure: "Context Pressure",
            thinkingDepth: "Thinking Depth",
            toolDiversity: "Tool Diversity",
            completionTone: "Tone",
          };

          const reading = getLatestReading(sessionId);
          const topSignalKey = reading?.topSignal ?? "unknown";
          const topSignalLabel = SIGNAL_LABELS[topSignalKey] ?? topSignalKey;
          const sigs: Record<string, number> = reading ? { ...reading.signals } : {};
          const topSignalValue = reading ? Math.round((sigs[topSignalKey] ?? 0) * 100) : 0;

          const alertText = [
            `${emoji} <b>Pulse Alert: ${escapeHTML(projectName)}</b> (@${escapeHTML(shortId)})`,
            `State: <b>${stateLabel}</b> — Score ${msg.score}/100`,
            `Top signal: ${topSignalLabel} (${topSignalValue}%)`,
            `Turn ${msg.turn}`,
            "",
            `💡 Reply to send guidance, or:`,
            `  <code>/mood ${shortId}</code> — Full breakdown`,
            `  <code>/stop ${shortId}</code> — Stop session`,
          ].join("\n");

          await this.bot.api
            .sendMessage(chatId, alertText, {
              parse_mode: "HTML",
              message_thread_id: topicId,
            })
            .catch(() => {});
          break;
        }

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

  // Tool feed (upsertToolFeed, cleanupToolFeed) moved to accessor section above

  // Message handlers, permission handlers, session event handlers
  // extracted to telegram-message-handlers.ts, telegram-permission-handler.ts,
  // telegram-session-events.ts

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
          // Restore persisted idle timeout into session config
          const cfg = this.getSessionConfig(row.sessionId);
          cfg.idleTimeoutMs = row.idleTimeoutMs;
          this.resetIdleTimer(row.sessionId, row.chatId, topicId || undefined);
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
          db.delete(telegramSessionMappings).where(eq(telegramSessionMappings.id, row.id)).run();
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
