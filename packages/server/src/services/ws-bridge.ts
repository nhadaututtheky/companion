/**
 * WsBridge — Core message router between CLI, Browser, and Telegram.
 * Handles session lifecycle, permissions, auto-approve, and subscriber system.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import { createDefaultPipeline, getRTKConfig, type RTKPipeline } from "../rtk/index.js";
import { createPlanModeWatcher } from "./cli-launcher.js";
import { type SdkSessionHandle } from "./sdk-engine.js";
import { type CompactBridge } from "./compact-manager.js";
import {
  broadcastToAll as _broadcastToAll,
  broadcastToSubscribers as _broadcastToSubscribers,
  type SocketLike,
} from "./ws-broadcast.js";
import {
  handleControlRequest as _handleControlRequest,
  handleHookEvent as _handleHookEvent,
  type PermissionBridge,
  type PermissionResolver,
} from "./ws-permission-handler.js";
import {
  handleStreamEvent as _handleStreamEvent,
  handleToolProgress as _handleToolProgress,
  clearEarlyResult,
  replayEarlyResult,
} from "./ws-stream-handler.js";
import {
  notifyParentOfChildEnd as _notifyParentOfChildEnd,
  type MultiBrainBridge,
} from "./ws-multi-brain.js";
import {
  broadcastContextUpdate as _broadcastContextUpdate,
  requestContextUsage as _requestContextUsage,
  handleControlResponse as _handleControlResponse,
  emitContextInjection as _emitContextInjection,
  checkCostBudget as _checkCostBudget,
  checkSmartCompact as _checkSmartCompact,
  clearCompactTimers as _clearCompactTimers,
  type ContextBridge,
} from "./ws-context-tracker.js";
import { getWorkspace as getWorkspaceById } from "./workspace-store.js";
import { eventBus } from "./event-bus.js";
import { getLatestReading } from "./pulse-estimator.js";
import {
  getActiveSession,
  getAllActiveSessions,
  persistSession,
  storeMessage,
  cleanupZombieSessions,
  pushMessageHistory,
  getSessionRecord,
  type ActiveSession,
} from "./session-store.js";
import type {
  CLIMessage,
  CLISystemInitMessage,
  CLIAssistantMessage,
  CLIResultMessage,
  CLIStreamEventMessage,
  CLIControlRequestMessage,
  CLIToolProgressMessage,
  BrowserOutgoingMessage,
  BrowserIncomingMessage,
  SessionStatus,
  PermissionRequest,
  HookEvent,
  PreToolUseResponse,
} from "@companion/shared";
import {
  SESSION_IDLE_TIMEOUT_MS,
  getMaxContextTokens,
} from "@companion/shared";
import type { CLIProcess, NormalizedMessage, CLIPlatform } from "@companion/shared";
// getMaxSessions moved to ws-multi-brain.ts
type LaunchResult = CLIProcess;
import { IdleDetector } from "./idle-detector.js";
import {
  HealthIdleManager,
  type HealthIdleBridge,
  type SessionSettings as _SessionSettings,
} from "./ws-health-idle.js";
import { MessageHandler, type MessageHandlerBridge } from "./ws-message-handler.js";
import { UserMessageHandler, type UserMessageBridge } from "./ws-user-message.js";
import {
  SessionLifecycleManager,
  type SessionLifecycleBridge,
} from "./ws-session-lifecycle.js";

const log = createLogger("ws-bridge");

// ─── Types ──────────────────────────────────────────────────────────────────

type StatusChangeCallback = (sessionId: string, status: SessionStatus) => void;

// ─── WsBridge ───────────────────────────────────────────────────────────────

// ─── Session Settings ────────────────────────────────────────────────────────

/** Re-exported from ws-health-idle.ts — keep the same public shape. */
export type SessionSettings = _SessionSettings;

const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
  keepAlive: false,
  autoReinjectOnCompact: true,
};

/** Whether to use the new SDK engine (set USE_SDK_ENGINE=1 to enable) */
const USE_SDK_ENGINE = process.env.USE_SDK_ENGINE === "1";

export class WsBridge {
  private cliProcesses = new Map<string, LaunchResult>();
  private sdkHandles = new Map<string, SdkSessionHandle>();
  /** Permission resolvers: requestId → resolve function (for SDK canUseTool bridge) */
  private permissionResolvers = new Map<string, PermissionResolver>();
  private planWatchers = new Map<string, ReturnType<typeof createPlanModeWatcher>>();
  /** RTK compression pipeline for tool outputs */
  private rtkPipeline: RTKPipeline = this.initRTKPipeline();
  private onStatusChange?: StatusChangeCallback;
  /** Per-session timeout/keep-alive settings */
  private sessionSettings = new Map<string, SessionSettings>();
  /** Health check + idle timer manager */
  private healthIdle: HealthIdleManager;
  /** Idle detector for agent output tracking */
  private idleDetector: IdleDetector;
  /** CLI message handler — routes normalized/raw CLI messages to session state updates */
  private messageHandler: MessageHandler;
  /** User message handler — routes browser/Telegram messages, enrichment, engine send */
  private userMessageHandler: UserMessageHandler;
  /** Session lifecycle manager — SDK startup, CLI startup, initial prompt, CLI exit */
  private sessionLifecycle: SessionLifecycleManager;

  constructor(opts?: { onStatusChange?: StatusChangeCallback }) {
    this.onStatusChange = opts?.onStatusChange;

    // Build the bridge interface for HealthIdleManager
    const healthIdleBridge: HealthIdleBridge = {
      broadcastToAll: this.broadcastToAll.bind(this),
      killSession: this.killSession.bind(this),
      handleCLIExit: this.handleCLIExit.bind(this),
      getCliProcess: (sessionId) => this.cliProcesses.get(sessionId),
      getRtkPipeline: () => this.rtkPipeline,
    };
    this.healthIdle = new HealthIdleManager(healthIdleBridge);

    this.idleDetector = new IdleDetector({
      onIdle: (sessionId, idleDurationMs) => {
        const session = getActiveSession(sessionId);
        if (!session) return;
        // Broadcast idle event to all connected browsers
        this.broadcastToAll(session, {
          type: "session_idle" as never,
          sessionId,
          idleDurationMs,
        } as never);
        log.debug("Session idle broadcasted", { sessionId, idleDurationMs });

        // Advance workflow if this session belongs to one
        import("./workflow-engine.js")
          .then(({ onWorkflowSessionIdle }) => onWorkflowSessionIdle(sessionId))
          .catch(() => {}); // non-blocking
      },
    });
    this.healthIdle.startHealthCheck(() => this.cliProcesses);
    this.healthIdle.startCleanupSweep();

    // Build the bridge interface for MessageHandler
    const messageHandlerBridge: MessageHandlerBridge = {
      broadcastToAll: this.broadcastToAll.bind(this),
      broadcastToSubscribers: this.broadcastToSubscribers.bind(this),
      updateStatus: this.updateStatus.bind(this),
      persistSession: (session) => persistSession(session),
      emitContextInjection: this.emitContextInjection.bind(this),
      broadcastContextUpdate: this.broadcastContextUpdate.bind(this),
      requestContextUsage: this.requestContextUsage.bind(this),
      checkCostBudget: this.checkCostBudget.bind(this),
      checkSmartCompact: this.checkSmartCompact.bind(this),
      startIdleTimer: this.startIdleTimer.bind(this),
      sendToCLI: this.sendToCLI.bind(this),
      reloadRTKConfig: this.reloadRTKConfig.bind(this),
      getRtkPipeline: () => this.rtkPipeline,
      getIdleDetector: () => this.idleDetector,
      getPlanWatcher: (sessionId) => this.planWatchers.get(sessionId),
      getSessionSettings: (sessionId) => this.getSessionSettings(sessionId),
      handleStreamEvent: (session, msg) => this.handleStreamEvent(session, msg),
      handleControlRequest: (session, msg) => this.handleControlRequest(session, msg),
      handleToolProgress: (session, msg) => this.handleToolProgress(session, msg),
      handleControlResponse: (session, parsed) => this.handleControlResponse(session, parsed),
    };
    this.messageHandler = new MessageHandler(messageHandlerBridge);

    // Build the bridge interface for UserMessageHandler
    // Use arrow-function getters so they capture `this` (WsBridge) lazily at call time
    const self = this;
    const userMessageBridge: UserMessageBridge = {
      broadcastToAll: this.broadcastToAll.bind(this),
      broadcastToSubscribers: this.broadcastToSubscribers.bind(this),
      broadcastLockStatus: this.broadcastLockStatus.bind(this),
      updateStatus: this.updateStatus.bind(this),
      emitContextInjection: this.emitContextInjection.bind(this),
      clearIdleTimer: this.clearIdleTimer.bind(this),
      getSessionRecord: (sessionId) => getSessionRecord(sessionId),
      getSdkHandle: (sessionId) => self.sdkHandles.get(sessionId),
      startSessionWithSdk: this.startSessionWithSdk.bind(this),
      getSessionSettings: (sessionId) => self.getSessionSettings(sessionId),
      sendToCLI: this.sendToCLI.bind(this),
      sendUserMessage: this.sendUserMessage.bind(this),
      get permBridge() {
        return self.permBridge;
      },
      get multiBrainBridge() {
        return self.multiBrainBridge;
      },
    };
    this.userMessageHandler = new UserMessageHandler(userMessageBridge);

    // Build the bridge interface for SessionLifecycleManager
    const lifecycleBridge: SessionLifecycleBridge = {
      broadcastToAll: this.broadcastToAll.bind(this),
      broadcastToSubscribers: this.broadcastToSubscribers.bind(this),
      updateStatus: this.updateStatus.bind(this),
      emitContextInjection: this.emitContextInjection.bind(this),
      handleSystemInit: (session, msg) => this.handleSystemInit(session, msg),
      handleAssistant: (session, msg) => this.handleAssistant(session, msg),
      handleResult: (session, msg) => this.handleResult(session, msg),
      handleStreamEvent: (session, msg) => this.handleStreamEvent(session, msg),
      handleToolProgress: (session, msg) => this.handleToolProgress(session, msg),
      handleSystemStatus: (session, msg) => this.handleSystemStatus(session, msg),
      handleControlRequest: (session, msg) => this.handleControlRequest(session, msg),
      handleNormalizedMessage: (session, msg) => this.handleNormalizedMessage(session, msg),
      scheduleCleanup: (sessionId) => this.scheduleCleanup(sessionId),
      clearCompactTimers: (sessionId) => this.clearCompactTimers(sessionId),
      sendToCLI: this.sendToCLI.bind(this),
      getCliProcess: (sessionId) => this.cliProcesses.get(sessionId),
      setCliProcess: (sessionId, process) => this.cliProcesses.set(sessionId, process),
      deleteCliProcess: (sessionId) => this.cliProcesses.delete(sessionId),
      getSdkHandle: (sessionId) => this.sdkHandles.get(sessionId),
      setSdkHandle: (sessionId, handle) => this.sdkHandles.set(sessionId, handle),
      deleteSdkHandle: (sessionId) => this.sdkHandles.delete(sessionId),
      getPlanWatcher: (sessionId) => this.planWatchers.get(sessionId),
      setPlanWatcher: (sessionId, watcher) => this.planWatchers.set(sessionId, watcher),
      deletePlanWatcher: (sessionId) => this.planWatchers.delete(sessionId),
      getPermissionResolver: (id) => this.permissionResolvers.get(id),
      setPermissionResolver: (id, fn) => this.permissionResolvers.set(id, fn),
      deletePermissionResolver: (id) => this.permissionResolvers.delete(id),
      getRtkPipeline: () => this.rtkPipeline,
      getHooksBaseUrl: () => this.getHooksBaseUrl(),
      getSessionSettings: (sessionId) => this.getSessionSettings(sessionId),
      killSession: (sessionId) => this.killSession(sessionId),
      clearIdleTimer: (sessionId) => this.clearIdleTimer(sessionId),
      stopIdleTracking: (sessionId) => this.idleDetector.stopTracking(sessionId),
      deleteSessionSettings: (sessionId) => this.sessionSettings.delete(sessionId),
      notifyParentOfChildEnd: (childSessionId, status, preEndShortId) =>
        this.notifyParentOfChildEnd(childSessionId, status, preEndShortId),
      setSessionSettings: (sessionId, settings) => this.sessionSettings.set(sessionId, settings),
      cancelCleanupTimer: (sessionId) => this.cancelCleanupTimer(sessionId),
      clearSessionCache: (sessionId) => this.rtkPipeline.clearSessionCache(sessionId),
    };
    this.sessionLifecycle = new SessionLifecycleManager(lifecycleBridge);
  }

  /** Initialize RTK pipeline with settings from DB */
  private initRTKPipeline(): RTKPipeline {
    const pipeline = createDefaultPipeline();
    try {
      const config = getRTKConfig();
      pipeline.setBudgetLevel(config.level);
      pipeline.setDisabledStrategies(config.disabledStrategies);
    } catch {
      // Settings DB not ready yet — use defaults
    }
    return pipeline;
  }

  /** Last RTK config reload timestamp */
  private rtkConfigLastReload = 0;
  /** RTK config reload interval: 30 seconds */
  private static readonly RTK_CONFIG_RELOAD_MS = 30_000;

  /** Reload RTK config from DB (throttled to avoid excessive DB reads) */
  reloadRTKConfig(): void {
    const now = Date.now();
    if (now - this.rtkConfigLastReload < WsBridge.RTK_CONFIG_RELOAD_MS) return;
    this.rtkConfigLastReload = now;

    const config = getRTKConfig();
    this.rtkPipeline.setBudgetLevel(config.level);
    this.rtkPipeline.setDisabledStrategies(config.disabledStrategies);
  }

  /** Stop the health check interval (call on server shutdown) */
  stopHealthCheck(): void {
    this.idleDetector.stopAll();
    this.healthIdle.stopAll();
  }

  /** Schedule removal of an ended session from in-memory maps after the cleanup delay. */
  private scheduleCleanup(sessionId: string): void {
    this.healthIdle.scheduleCleanup(sessionId);
  }

  /** Cancel a pending cleanup timer (e.g. when a session is resumed before cleanup fires). */
  private cancelCleanupTimer(sessionId: string): void {
    this.healthIdle.cancelCleanupTimer(sessionId);
  }

  /**
   * Scan DB for zombie sessions (active in DB but not in memory) and mark them ended.
   * Returns count of cleaned sessions.
   */
  cleanupZombieSessions(): number {
    return cleanupZombieSessions((id) => this.cliProcesses.has(id) || this.sdkHandles.has(id));
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  async startSession(opts: {
    projectSlug?: string;
    cwd: string;
    model: string;
    permissionMode?: string;
    prompt?: string;
    resume?: boolean;
    cliSessionId?: string;
    source?: string;
    parentId?: string;
    channelId?: string;
    envVars?: Record<string, string>;
    name?: string;
    costBudgetUsd?: number;
    compactMode?: string;
    // NOTE: full opts type lives in ws-session-lifecycle.ts — keep in sync
    compactThreshold?: number;
    /** Expert Mode persona ID (e.g. "tim-cook", "staff-sre"). */
    personaId?: string;
    /** Optional identity/personality prompt re-injected after context compaction. */
    identityPrompt?: string;
    /** When false, disables auto re-injection on compact for this session (default: true). */
    autoReinjectOnCompact?: boolean;
    /** Bare mode — minimal output, lower cost. Maps to --bare CLI flag. */
    bare?: boolean;
    /** Thinking budget in tokens. 0 = off, N = budget, undefined = adaptive. */
    thinkingBudget?: number;
    /** CLI platform to use (claude, codex, gemini, opencode). */
    cliPlatform?: CLIPlatform;
    /** Platform-specific options (e.g. fullAuto for Codex, sandbox for Gemini). */
    platformOptions?: Record<string, unknown>;
    /** Agent role in multi-brain workspace. */
    role?: "coordinator" | "specialist" | "researcher" | "reviewer";
    /** Workspace ID — links session to a multi-CLI workspace. */
    workspaceId?: string;
    /** Original session ID when resuming — used to restore message history from DB. */
    resumeFromSessionId?: string;
  }): Promise<string> {
    return this.sessionLifecycle.startSession(opts);
  }

  // ── SDK Engine session startup ──────────────────────────────────────────

  private startSessionWithSdk(
    sessionId: string,
    session: ActiveSession,
    opts: {
      projectSlug?: string;
      cwd: string;
      model: string;
      permissionMode?: string;
      prompt?: string;
      resume?: boolean;
      cliSessionId?: string;
      source?: string;
      envVars?: Record<string, string>;
    },
  ): string {
    return this.sessionLifecycle.startSessionWithSdk(sessionId, session, opts);
  }

  // ── Legacy CLI launcher session startup ─────────────────────────────────

  private startSessionWithCli(
    sessionId: string,
    session: ActiveSession,
    opts: {
      projectSlug?: string;
      cwd: string;
      model: string;
      permissionMode?: string;
      prompt?: string;
      resume?: boolean;
      cliSessionId?: string;
      source?: string;
      envVars?: Record<string, string>;
      bare?: boolean;
      thinkingBudget?: number;
      cliPlatform?: CLIPlatform;
      platformOptions?: Record<string, unknown>;
    },
  ): string {
    return this.sessionLifecycle.startSessionWithCli(sessionId, session, opts);
  }

  /** Send the initial prompt to a newly launched CLI session */
  private sendInitialPrompt(
    session: ActiveSession,
    sessionId: string,
    opts: {
      projectSlug?: string;
      cwd: string;
      model: string;
      permissionMode?: string;
      prompt?: string;
      resume?: boolean;
      source?: string;
    },
    cliPlatform: CLIPlatform,
  ): void {
    this.sessionLifecycle.sendInitialPrompt(session, sessionId, opts, cliPlatform);
  }

  killSession(sessionId: string): void {
    this.sessionLifecycle.killSession(sessionId);
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return getActiveSession(sessionId);
  }

  getActiveSessions(): ActiveSession[] {
    return getAllActiveSessions();
  }

  getMessageHistory(sessionId: string): BrowserIncomingMessage[] {
    const session = getActiveSession(sessionId);
    return session ? (session.messageHistory as BrowserIncomingMessage[]) : [];
  }

  /** Update per-session timeout/keep-alive settings. Resets the idle timer with the new value. */
  setSessionSettings(sessionId: string, settings: Partial<SessionSettings>): void {
    const current = this.sessionSettings.get(sessionId) ?? { ...DEFAULT_SESSION_SETTINGS };
    const next: SessionSettings = { ...current, ...settings };
    this.sessionSettings.set(sessionId, next);

    log.info("Session settings updated", { sessionId, settings: next });

    // Re-apply idle timer logic based on new settings
    const session = getActiveSession(sessionId);
    if (!session) return;

    if (next.keepAlive) {
      // Clear idle timer — session is pinned alive
      this.clearIdleTimer(sessionId);
      log.info("Keep-alive enabled, idle timer cleared", { sessionId });
    } else if (next.idleTimeoutMs === 0) {
      // Explicit "never" timeout — clear timer
      this.clearIdleTimer(sessionId);
    } else {
      // Reset timer with new duration if session is currently idle
      const st = session.state.status;
      if (st === "idle") {
        this.clearIdleTimer(sessionId);
        this.startIdleTimer(session);
      }
    }
  }

  /** Get current settings for a session */
  getSessionSettings(sessionId: string): SessionSettings {
    return this.sessionSettings.get(sessionId) ?? { ...DEFAULT_SESSION_SETTINGS };
  }

  // ── Subscriber system (for Telegram, etc.) ──────────────────────────────

  subscribe(sessionId: string, subscriberId: string, callback: (msg: unknown) => void): () => void {
    const session = getActiveSession(sessionId);
    if (!session) {
      log.warn("Cannot subscribe — session not found", { sessionId, subscriberId });
      return () => {};
    }

    session.subscribers.set(subscriberId, callback);
    log.info("Subscriber added", { sessionId, subscriberId });

    // Replay any buffered early result that arrived before this subscriber registered
    const replayed = replayEarlyResult(sessionId, (msg) => {
      log.info("Replaying early result to late subscriber", { sessionId, subscriberId });
      callback(msg);
    });
    if (!replayed) {
      // Clear expired entry if present
      clearEarlyResult(sessionId);
    }

    return () => {
      session.subscribers.delete(subscriberId);
      log.info("Subscriber removed", { sessionId, subscriberId });
    };
  }

  // ── Browser WebSocket handling ──────────────────────────────────────────

  addBrowser(sessionId: string, ws: SocketLike): void {
    const session = getActiveSession(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
      return;
    }

    session.browserSockets.add(ws);

    // Send current state + message history
    ws.send(
      JSON.stringify({
        type: "session_init",
        session: session.state,
      } satisfies BrowserIncomingMessage),
    );

    if (session.messageHistory.length > 0) {
      ws.send(
        JSON.stringify({
          type: "message_history",
          messages: session.messageHistory as BrowserIncomingMessage[],
        } satisfies BrowserIncomingMessage),
      );
    }

    // Replay latest pulse reading so indicator survives refresh
    {
      const pulse = getLatestReading(sessionId);
      if (pulse) {
        ws.send(
          JSON.stringify({
            type: "pulse:update",
            sessionId: session.id,
            score: pulse.score,
            state: pulse.state,
            trend: pulse.trend,
            signals: { ...pulse.signals },
            topSignal: pulse.topSignal,
            turn: pulse.turn,
            timestamp: pulse.timestamp,
          }),
        );
      }
    }

    // Replay any buffered early result to this browser (race window fix)
    replayEarlyResult(sessionId, (msg) => {
      log.debug("Replaying early result to late browser", { sessionId });
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    });

    // Notify CLI status — only send cli_disconnected if session isn't already ended/error
    // (avoids re-triggering "ended" in client on WebSocket reconnect)
    const sdkRunning = this.sdkHandles.get(sessionId)?.isRunning();
    if (session.cliSend || sdkRunning) {
      ws.send(JSON.stringify({ type: "cli_connected" }));
    } else if (session.state.status !== "ended" && session.state.status !== "error") {
      ws.send(
        JSON.stringify({
          type: "cli_disconnected",
          reason: "CLI process not connected",
        }),
      );
    }
  }

  removeBrowser(sessionId: string, ws: SocketLike): void {
    const session = getActiveSession(sessionId);
    if (session) {
      session.browserSockets.delete(ws);
    }
  }

  /** Route a message from browser WebSocket */
  handleBrowserMessage(sessionId: string, raw: string): void {
    const session = getActiveSession(sessionId);
    if (!session) return;

    try {
      const msg = JSON.parse(raw) as BrowserOutgoingMessage;
      this.routeBrowserMessage(session, msg);
    } catch (err) {
      log.error("Invalid browser message", { error: String(err) });
    }
  }

  /** Send a user message to a session (from any source) */
  sendUserMessage(sessionId: string, content: string, source?: string): void {
    const session = getActiveSession(sessionId);
    if (!session) {
      log.warn("Cannot send message — session not found", { sessionId });
      return;
    }

    this.handleUserMessage(session, content, source);
  }

  /**
   * Send a multimodal message (text + images) directly to CLI.
   * Bypasses enrichment pipeline — images don't need CodeGraph/WebIntel.
   */
  sendMultimodalMessage(
    sessionId: string,
    contentBlocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >,
    source?: string,
  ): void {
    const session = getActiveSession(sessionId);
    if (!session) {
      log.warn("Cannot send multimodal message — session not found", { sessionId });
      return;
    }

    // Record text parts in history
    const textParts = contentBlocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text);
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content: textParts.join("\n") || "[image]",
      timestamp: Date.now(),
      source: source ?? "web",
    };
    pushMessageHistory(session, historyMsg);
    this.broadcastToAll(session, historyMsg);

    // Store text representation in DB
    storeMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: "user",
      content: textParts.join("\n") || "[image]",
      source: (source ?? "web") as "telegram" | "web" | "api" | "agent" | "system",
    });

    // SDK engine: doesn't support content blocks — save image to temp file + send path
    const existingSdkHandle = this.sdkHandles.get(session.id);
    if (existingSdkHandle || USE_SDK_ENGINE) {
      void this.sendMultimodalViaTempFile(session, contentBlocks, textParts);
      return;
    }

    // CLI engine: send multimodal content blocks directly (Claude API format)
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content: contentBlocks },
    });
    this.sendToCLI(session, ndjson);
    this.updateStatus(session, "busy");
  }

  /**
   * Fallback for SDK engine: save image to temp file, send file path as text.
   */
  private async sendMultimodalViaTempFile(
    session: ActiveSession,
    contentBlocks: Array<
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    >,
    textParts: string[],
  ): Promise<void> {
    return this.userMessageHandler.sendMultimodalViaTempFile(session, contentBlocks, textParts);
  }

  // ── CLI message handling ────────────────────────────────────────────────

  /**
   * Handle a NormalizedMessage from any CLI adapter.
   * Routes to existing handlers via raw message passthrough (Claude)
   * or by reconstructing compatible message shapes (other platforms).
   */
  private handleNormalizedMessage(session: ActiveSession, msg: NormalizedMessage): void {
    this.messageHandler.handleNormalizedMessage(session, msg);
  }

  /** @deprecated — Use handleNormalizedMessage for new code. Kept for Claude raw passthrough. */
  private handleCLIMessage(session: ActiveSession, line: string): void {
    this.messageHandler.handleCLIMessage(session, line);
  }

  private handleSystemInit(session: ActiveSession, msg: CLISystemInitMessage): void {
    this.messageHandler.handleSystemInit(session, msg);
  }

  private handleSystemStatus(
    session: ActiveSession,
    msg: { subtype: "status"; status: "compacting" | null },
  ): void {
    this.messageHandler.handleSystemStatus(session, msg);
  }

  /**
   * After context compaction completes, re-inject a minimal system context
   * message so Claude retains project/identity awareness in the new context window.
   * Only fires if autoReinjectOnCompact is enabled (default: true).
   */
  private maybeReinjectIdentity(session: ActiveSession): void {
    this.messageHandler.maybeReinjectIdentity(session);
  }

  private handleAssistant(session: ActiveSession, msg: CLIAssistantMessage): void {
    this.messageHandler.handleAssistant(session, msg);
  }

  /** Emit a context:injection event to all connected browsers for this session */
  private emitContextInjection(
    session: ActiveSession,
    injectionType:
      | "project_map"
      | "message_context"
      | "plan_review"
      | "break_check"
      | "web_docs"
      | "activity_feed",
    summary: string,
    charCount: number,
  ): void {
    _emitContextInjection(session, injectionType, summary, charCount);
  }

  private broadcastContextUpdate(session: ActiveSession): void {
    _broadcastContextUpdate(session);
  }

  private requestContextUsage(session: ActiveSession): void {
    _requestContextUsage(this.contextBridge, session);
  }

  private handleControlResponse(session: ActiveSession, msg: Record<string, unknown>): void {
    _handleControlResponse(session, msg);
  }

  private handleResult(session: ActiveSession, msg: CLIResultMessage): void {
    this.messageHandler.handleResult(session, msg);
  }

  private checkCostBudget(session: ActiveSession): void {
    _checkCostBudget(session);
  }

  /**
   * Smart compact: check if context exceeds threshold and trigger handoff at idle.
   * - manual: do nothing (user must /compact themselves)
   * - smart: set compactPending flag, trigger handoff when idle
   * - aggressive: compact immediately when threshold crossed
   */
  /** Bridge interface for compact-manager.ts */
  private get compactBridge(): CompactBridge {
    return {
      broadcastToAll: this.broadcastToAll.bind(this),
      sendToCLI: this.sendToCLI.bind(this),
    };
  }

  /** Bridge interface for ws-multi-brain.ts */
  private get multiBrainBridge(): MultiBrainBridge {
    return {
      startSession: this.startSession.bind(this),
      sendUserMessage: this.sendUserMessage.bind(this),
      broadcastEvent: this.broadcastEvent.bind(this),
    };
  }

  /** Bridge interface for ws-context-tracker.ts */
  private get contextBridge(): ContextBridge {
    return {
      sendToCLI: this.sendToCLI.bind(this),
      broadcastToAll: this.broadcastToAll.bind(this),
      sdkHandles: this.sdkHandles,
    };
  }

  /** Bridge interface for ws-permission-handler.ts */
  private get permBridge(): PermissionBridge {
    return {
      sendToCLI: this.sendToCLI.bind(this),
      permissionResolvers: this.permissionResolvers,
      sdkHandles: this.sdkHandles,
    };
  }

  private checkSmartCompact(session: ActiveSession): void {
    _checkSmartCompact(this.compactBridge, session);
  }

  // EarlyResults buffer moved to ws-stream-handler.ts

  /** Clear compact handoff timers for a session (delegates to compact-manager) */
  private clearCompactTimers(sessionId: string): void {
    _clearCompactTimers(sessionId);
  }

  private handleStreamEvent(session: ActiveSession, msg: CLIStreamEventMessage): void {
    _handleStreamEvent(session, msg);
  }

  private handleControlRequest(session: ActiveSession, msg: CLIControlRequestMessage): void {
    _handleControlRequest(this.permBridge, session, msg);
  }

  private handleToolProgress(session: ActiveSession, msg: CLIToolProgressMessage): void {
    _handleToolProgress(session, msg);
  }

  private handleCLIExit(session: ActiveSession, exitCode: number): void {
    this.sessionLifecycle.handleCLIExit(session, exitCode);
  }

  // ── Browser message routing ─────────────────────────────────────────────

  private routeBrowserMessage(session: ActiveSession, msg: BrowserOutgoingMessage): void {
    // Images case needs the multimodal pipeline which stays on WsBridge
    if (msg.type === "user_message" && msg.images && msg.images.length > 0) {
      const contentBlocks: Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
      > = [];
      if (msg.content) contentBlocks.push({ type: "text", text: msg.content });
      for (const img of msg.images) {
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.data },
        });
      }
      this.sendMultimodalMessage(session.id, contentBlocks, "web");
      return;
    }
    this.userMessageHandler.routeBrowserMessage(session, msg);
  }

  private handleUserMessage(session: ActiveSession, content: string, source?: string): void {
    this.userMessageHandler.handleUserMessage(session, content, source);
  }

  private handleUserMessageInternal(
    session: ActiveSession,
    content: string,
    source?: string,
  ): void {
    this.userMessageHandler.handleUserMessageInternal(session, content, source);
  }

  private async maybeEnrichWithDocs(session: ActiveSession, content: string): Promise<string> {
    return this.userMessageHandler.maybeEnrichWithDocs(session, content);
  }

  private sendToEngine(session: ActiveSession, content: string): void {
    this.userMessageHandler.sendToEngine(session, content);
  }

  private handlePermissionResponse(
    session: ActiveSession,
    msg: {
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: unknown[];
    },
  ): void {
    this.userMessageHandler.handlePermissionResponse(session, msg);
  }

  private handleInterrupt(session: ActiveSession): void {
    this.userMessageHandler.handleInterrupt(session);
  }

  private handleSetModel(session: ActiveSession, model: string): void {
    this.userMessageHandler.handleSetModel(session, model);
  }

  // ── Idle timer (auto-kill non-Telegram sessions after inactivity) ───────

  private startIdleTimer(session: ActiveSession): void {
    const settings = this.sessionSettings.get(session.id) ?? DEFAULT_SESSION_SETTINGS;
    this.healthIdle.startIdleTimer(session, settings);
  }

  private clearIdleTimer(sessionId: string): void {
    this.healthIdle.clearIdleTimer(sessionId);
  }

  // ── Auto-approve timer ──────────────────────────────────────────────────

  // Auto-approve timer moved to ws-permission-handler.ts

  // ── Lock status broadcast ──────────────────────────────────────────────

  private broadcastLockStatus(session: ActiveSession): void {
    this.healthIdle.broadcastLockStatus(session);
  }

  // ── Transport helpers ───────────────────────────────────────────────────

  private sendToCLI(session: ActiveSession, ndjson: string): void {
    if (!session.cliSend) {
      log.info("CLI not connected, queuing message", { session: session.id });
      session.pendingMessages.push(ndjson);
      return;
    }

    try {
      session.cliSend(ndjson + "\n");
    } catch (err) {
      log.error("Failed to send to CLI", { err: String(err) });
      session.pendingMessages.push(ndjson);
    }
  }

  private notifyParentOfChildEnd(
    childSessionId: string,
    status: string,
    preEndShortId?: string,
  ): void {
    _notifyParentOfChildEnd(this.multiBrainBridge, childSessionId, status, preEndShortId);
  }

  /** Public: broadcast a custom event to all subscribers of a session */
  broadcastEvent(sessionId: string, event: Record<string, unknown>): void {
    const session = getActiveSession(sessionId);
    if (!session) return;
    this.broadcastToAll(session, event as unknown as BrowserIncomingMessage);
  }

  private broadcastToAll(session: ActiveSession, msg: BrowserIncomingMessage): void {
    _broadcastToAll(session, msg);
  }

  private broadcastToSubscribers(session: ActiveSession, msg: unknown): void {
    _broadcastToSubscribers(session, msg);
  }

  private updateStatus(session: ActiveSession, status: SessionStatus): void {
    if (session.state.status === status) return;

    const from = session.state.status;
    const valid = session.machine.transition(status);
    if (!valid) {
      // State machine rejected — still force-apply for backward compat but log warning
      log.warn("Forced invalid status transition", {
        sessionId: session.id,
        from,
        to: status,
      });
    }

    session.state = { ...session.state, status };

    this.broadcastToAll(session, {
      type: "status_change",
      status,
    });

    this.onStatusChange?.(session.id, status);

    // Emit event for decoupled listeners
    eventBus.emit("session:phase-changed", {
      sessionId: session.id,
      from,
      to: status,
    });
  }

  /** Get the base URL for the hook receiver endpoint */
  private getHooksBaseUrl(): string {
    const port = parseInt(process.env.PORT ?? "3456", 10);
    const host = process.env.HOST ?? "127.0.0.1";
    return `http://${host}:${port}/api/hooks`;
  }

  // ── HTTP Hook handling ──────────────────────────────────────────────────

  /**
   * Handle an incoming HTTP hook event from Claude Code CLI.
   * Returns routing result + optional PreToolUse decision.
   */
  handleHookEvent(
    sessionId: string,
    event: HookEvent,
  ): { found: boolean; decision?: PreToolUseResponse } {
    const session = getActiveSession(sessionId);
    if (!session) {
      log.debug("Hook event for unknown session", { sessionId, type: event.type });
      return { found: false };
    }

    return _handleHookEvent(session, event);
  }
}
