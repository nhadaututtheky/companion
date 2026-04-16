/**
 * TelegramBridge — Core orchestrator between Telegram and WsBridge/CLI.
 * Manages chat-to-session mappings, routes messages, handles streaming.
 *
 * Message handlers, permission handlers, and session event handlers are
 * extracted to separate modules for maintainability:
 * - telegram-message-handlers.ts — user input (text, photo, document)
 * - telegram-permission-handler.ts — permission batching + auto-approve
 * - telegram-session-events.ts — CLI output (assistant, stream, result, child agents)
 *
 * Additional extracted modules:
 * - telegram-idle-manager.ts — idle timeout + busy watchdog per session
 * - telegram-dead-sessions.ts — dead session tracking for resume
 * - telegram-forum-topics.ts — forum topic creation/lookup
 * - telegram-subscriptions.ts — session + stream subscription management
 * - telegram-persistence.ts — DB persistence of chat-to-session mappings
 */

import { type Bot, type Context } from "grammy";
import { getDb } from "../db/client.js";
import { telegramSessionMappings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createBot, registerCommands, type BotConfig } from "./bot-factory.js";
import { StreamHandler } from "./stream-handler.js";
import { escapeHTML, statusEmoji } from "./formatter.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerControlCommands } from "./commands/control.js";
import { registerInfoCommands } from "./commands/info.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerPanelCommands } from "./commands/panel.js";
import { registerUtilityCommands } from "./commands/utility.js";
import { registerTemplateCommands } from "./commands/template.js";
import { registerWikiCommands } from "./commands/wiki.js";
import { registerMoodCommands } from "./commands/mood.js";
import { registerAccountCommands } from "./commands/account.js";
import type { OperationalState } from "../services/pulse-estimator.js";
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
  cancelAutoApproveCountdown as cancelAutoApproveCountdownFn,
  cancelAllAutoApproveCountdowns as cancelAllAutoApproveCountdownsFn,
  type PermBatch,
} from "./telegram-permission-handler.js";
import { routeSessionMessage } from "./telegram-session-router.js";
import { sendSettingsPanel as sendSettingsPanelFn } from "./telegram-settings-panel.js";

// Extracted modules
import { TelegramIdleManager, type SessionConfig } from "./telegram-idle-manager.js";
import { TelegramDeadSessions, type DeadSessionInfo } from "./telegram-dead-sessions.js";
import { TelegramForumTopics } from "./telegram-forum-topics.js";
import { TelegramSubscriptions } from "./telegram-subscriptions.js";
import { TelegramPersistence } from "./telegram-persistence.js";

const log = createLogger("telegram-bridge");

// ─── Chat-Session Mapping ───────────────────────────────────────────────────

interface ChatMapping {
  sessionId: string;
  projectSlug: string;
  model: string;
  topicId?: number;
}

// Re-export DeadSessionInfo for consumers
export type { DeadSessionInfo };

// Re-export statusEmoji for backward compatibility (canonical source: formatter.ts)
export { statusEmoji } from "./formatter.js";

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
  /** Short callback key → full session/request IDs (Telegram 64-byte limit) — @internal */
  permCallbackMap = new Map<string, { sessionId: string; requestId: string }>();
  /** Active auto-approve countdowns — @internal for permission-handler */
  autoApproveTimers = new Map<number, ReturnType<typeof setInterval>>();
  /** Reverse index: sessionId → Set of messageIds — @internal for permission-handler */
  sessionAutoApproveMessages = new Map<string, Set<number>>();

  // ── Extracted module instances ────────────────────────────────────────
  private idleManager: TelegramIdleManager;
  private deadSessionsManager: TelegramDeadSessions;
  private forumTopics: TelegramForumTopics;
  private subscriptionManager: TelegramSubscriptions;
  private persistence: TelegramPersistence;

  constructor(wsBridge: WsBridge, config: BotConfig) {
    this.wsBridge = wsBridge;
    this.config = config;
    this.bot = createBot(config);
    this.streamHandler = new StreamHandler(this.bot.api);

    // ── Initialize extracted modules ──────────────────────────────────
    this.idleManager = new TelegramIdleManager(this.sessionConfigs, {
      bot: this.bot,
      wsBridge: this.wsBridge,
      getMapping: (chatId, topicId) => this.getMapping(chatId, topicId),
      killSession: (sessionId) => this.killSession(sessionId),
      removeMapping: (chatId, topicId) => this.removeMapping(chatId, topicId),
      clearDeadSession: (chatId, topicId) => this.clearDeadSession(chatId, topicId),
    });

    this.deadSessionsManager = new TelegramDeadSessions(this.deadSessions);

    this.forumTopics = new TelegramForumTopics(this.bot, this.streamSubscriptions);

    this.subscriptionManager = new TelegramSubscriptions(
      this.subscriptions,
      this.streamSubscriptions,
      this.wsBridge,
      this.config.botId,
    );
    // Wire up callbacks to avoid circular dependency at construction time
    this.subscriptionManager.onMessage = (chatId, topicId, sessionId, msg) =>
      this.handleSessionMessage(chatId, topicId, sessionId, msg);
    this.subscriptionManager.onSetStreamMapping = (
      chatId,
      topicId,
      sessionId,
      projectSlug,
      model,
    ) => {
      if (!this.getMapping(chatId, topicId)) {
        this.mappings.set(this.mapKey(chatId, topicId), {
          sessionId,
          projectSlug,
          model,
          topicId,
        });
      }
    };
    this.subscriptionManager.onRemoveStreamMapping = (chatId, topicId) =>
      this.removeMapping(chatId, topicId);
    this.subscriptionManager.onGetMapping = (chatId, topicId) => this.getMapping(chatId, topicId);

    this.persistence = new TelegramPersistence(this.mappings);

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
    registerAccountCommands(this);
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
    this.permCallbackMap.clear();

    await this.bot.stop();
    log.info("Bot stopped", { botId: this.config.botId });
  }

  // ── Session config (panel + idle) — delegated to TelegramIdleManager ──

  getSessionConfig(sessionId: string): SessionConfig {
    return this.idleManager.getSessionConfig(sessionId);
  }

  setSessionPanelMessageId(sessionId: string, messageId: number): void {
    this.idleManager.setSessionPanelMessageId(sessionId, messageId);
  }

  setIdleTimeout(sessionId: string, ms: number): void {
    this.idleManager.setIdleTimeout(sessionId, ms);
  }

  /** Reset the idle timer for a session. Called on session start, user message, CLI activity + result events. */
  resetIdleTimer(sessionId: string, chatId: number, topicId?: number): void {
    this.idleManager.resetIdleTimer(sessionId, chatId, topicId);
  }

  /** @internal — used by extracted session-router module */
  resetBusyWatchdog(sessionId: string, chatId: number, topicId?: number): void {
    this.idleManager.resetBusyWatchdog(sessionId, chatId, topicId);
  }

  // ── Dead session management — delegated to TelegramDeadSessions ───────

  /** Get dead session by exact chatId:topicId key */
  getDeadSession(chatId: number, topicId: number): DeadSessionInfo | undefined {
    return this.deadSessionsManager.getDeadSession(chatId, topicId);
  }

  /** Get dead session by project slug (searches all dead sessions for this chatId) */
  getDeadSessionByProject(chatId: number, projectSlug: string): DeadSessionInfo | undefined {
    return this.deadSessionsManager.getDeadSessionByProject(chatId, projectSlug);
  }

  /** Remove a dead session entry */
  clearDeadSession(chatId: number, topicId: number): void {
    this.deadSessionsManager.clearDeadSession(chatId, topicId);
  }

  /** Clear dead session by project slug */
  clearDeadSessionByProject(chatId: number, projectSlug: string): void {
    this.deadSessionsManager.clearDeadSessionByProject(chatId, projectSlug);
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
    this.persistence.persistMapping(chatId, topicId, mapping);
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

    // Auto-route to forum topic: if not already in a topic,
    // try to get or create a forum topic for this project.
    // Works in both group chats and private chats (Bot API 9.4+ Threaded Mode).
    let effectiveTopicId = topicId;
    if (!topicId) {
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
      await ctx.reply(
        "❌ Failed to start session. Check that the project directory exists and Claude CLI is available.",
      );
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
    return sendSettingsPanelFn(this, chatId, topicId, sessionId, projectName, model, editMessageId);
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

    // Clean up permission callback keys for this session
    for (const [key, entry] of this.permCallbackMap.entries()) {
      if (entry.sessionId === sessionId) {
        this.permCallbackMap.delete(key);
      }
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

  /** @internal — get stored context breakdown HTML for a session (for 📊 button) */
  getContextBreakdown(sessionId: string): string | undefined {
    return this.contextBreakdowns.get(sessionId);
  }

  /** @internal — store context breakdown HTML for a session */
  setContextBreakdown(sessionId: string, html: string): void {
    this.contextBreakdowns.set(sessionId, html);
  }

  /** @internal — get pulse alert cooldown timestamp for a session */
  getPulseAlertCooldown(sessionId: string): number | undefined {
    return this.pulseAlertCooldowns.get(sessionId);
  }

  /** @internal — set pulse alert cooldown timestamp for a session */
  setPulseAlertCooldown(sessionId: string, ts: number): void {
    this.pulseAlertCooldowns.set(sessionId, ts);
  }

  /** @internal — get previous pulse state for a session */
  getPulsePrevState(sessionId: string): OperationalState | undefined {
    return this.pulsePrevState.get(sessionId);
  }

  /** @internal — set previous pulse state for a session */
  setPulsePrevState(sessionId: string, state: OperationalState): void {
    this.pulsePrevState.set(sessionId, state);
  }

  /** @internal — clear pulse tracking state for a session (on status_change: ended) */
  clearPulseState(sessionId: string): void {
    this.pulseAlertCooldowns.delete(sessionId);
    this.pulsePrevState.delete(sessionId);
  }

  /** @internal — update CLI session ID in persistence (called on session_init) */
  updateMappingCliSessionId(sessionId: string, cliSessionId: string): void {
    this.persistence.updateMappingCliSessionId(sessionId, cliSessionId);
  }

  /** @internal — clean up session config timers on cli_disconnected */
  cleanupSessionConfig(sessionId: string): void {
    const cfg = this.sessionConfigs.get(sessionId);
    if (cfg) {
      if (cfg.idleTimer) clearTimeout(cfg.idleTimer);
      if (cfg.idleWarningTimer) clearTimeout(cfg.idleWarningTimer);
      if (cfg.busyWatchdog) clearTimeout(cfg.busyWatchdog);
      this.sessionConfigs.delete(sessionId);
    }
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

  // ── Subscribe to CLI output — delegated to TelegramSubscriptions ──────

  subscribeToSession(sessionId: string, chatId: number, topicId?: number): void {
    this.subscriptionManager.subscribeToSession(sessionId, chatId, topicId);
  }

  /**
   * Attach a chat to an existing session for stream-only observation.
   * Does NOT create a new CLI process. Does NOT set a full mapping.
   */
  attachStreamToSession(sessionId: string, chatId: number, topicId?: number): boolean {
    return this.subscriptionManager.attachStreamToSession(sessionId, chatId, topicId);
  }

  /**
   * Detach a stream-only subscription for a chat.
   * Does NOT kill the session. Session continues running normally.
   */
  detachStream(chatId: number, topicId?: number): string | undefined {
    return this.subscriptionManager.detachStream(chatId, topicId);
  }

  /** Get the sessionId this chat is stream-attached to (if any) */
  getStreamMapping(chatId: number, topicId?: number): string | undefined {
    return this.subscriptionManager.getStreamMapping(chatId, topicId);
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

  // ── Forum topic management — delegated to TelegramForumTopics ─────────

  /**
   * Get or create a forum topic for a project in a group chat.
   * Returns the topic ID, or undefined if forum topics are not supported.
   */
  async getOrCreateForumTopic(
    chatId: number,
    projectSlug: string,
    projectName: string,
  ): Promise<number | undefined> {
    return this.forumTopics.getOrCreateForumTopic(chatId, projectSlug, projectName);
  }

  /** Get the stored forum topic for a project (no creation). */
  getForumTopicId(chatId: number, projectSlug: string): number | undefined {
    return this.forumTopics.getForumTopicId(chatId, projectSlug);
  }

  /** Reverse lookup: find which project a forum topic belongs to. */
  getProjectSlugForTopic(chatId: number, topicId: number): string | undefined {
    return this.forumTopics.getProjectSlugForTopic(chatId, topicId);
  }

  /** List all forum topics for a chat. */
  listForumTopics(
    chatId: number,
  ): Array<{ projectSlug: string; topicId: number; topicName: string }> {
    return this.forumTopics.listForumTopics(chatId);
  }

  /** Delete a forum topic mapping (does NOT delete the Telegram topic itself). */
  deleteForumTopicMapping(chatId: number, projectSlug: string): void {
    this.forumTopics.deleteForumTopicMapping(chatId, projectSlug);
  }

  /** Reverse lookup: find the stream subscriber info for a given sessionId */
  getStreamSubscriberForSession(
    sessionId: string,
  ): { chatId: number; topicId: number } | undefined {
    return this.forumTopics.getStreamSubscriberForSession(sessionId);
  }

  // ── Session message router (delegates to telegram-session-router) ────────

  private async handleSessionMessage(
    chatId: number,
    topicId: number | undefined,
    sessionId: string,
    msg: BrowserIncomingMessage,
  ): Promise<void> {
    return routeSessionMessage(this, chatId, topicId, sessionId, msg);
  }

  // Tool feed (upsertToolFeed, cleanupToolFeed) in accessor section above

  // Message handlers, permission handlers, session event handlers
  // extracted to telegram-message-handlers.ts, telegram-permission-handler.ts,
  // telegram-session-events.ts

  // ── Persistence — delegated to TelegramPersistence ────────────────────

  private loadMappings(): void {
    this.persistence.loadMappings({
      mapKey: (chatId, topicId) => this.mapKey(chatId, topicId),
      getSession: (sessionId) => this.wsBridge.getSession(sessionId),
      subscribeToSession: (sessionId, chatId, topicId) =>
        this.subscribeToSession(sessionId, chatId, topicId),
      getSessionConfig: (sessionId) => this.getSessionConfig(sessionId),
      resetIdleTimer: (sessionId, chatId, topicId) =>
        this.resetIdleTimer(sessionId, chatId, topicId),
      deadSessions: this.deadSessions,
    });
  }
}
