/**
 * WsBridge — Core message router between CLI, Browser, and Telegram.
 * Handles session lifecycle, permissions, auto-approve, and subscriber system.
 */

import { createLogger } from "../logger.js";
import { createDefaultPipeline, getRTKConfig, type RTKPipeline } from "../rtk/index.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- used in typeof
import { createPlanModeWatcher } from "./cli-launcher.js";
import type { SdkSessionHandle } from "./sdk-engine.js";
import type { CompactBridge } from "./compact-manager.js";
import {
  broadcastToAll,
  broadcastToSubscribers,
  type SocketLike,
} from "./ws-broadcast.js";
import {
  handleControlRequest,
  handleHookEvent as _handleHookEvent,
  type PermissionBridge,
  type PermissionResolver,
} from "./ws-permission-handler.js";
import {
  handleStreamEvent,
  handleToolProgress,
  clearEarlyResult,
  replayEarlyResult,
} from "./ws-stream-handler.js";
import {
  notifyParentOfChildEnd,
  type MultiBrainBridge,
} from "./ws-multi-brain.js";
import {
  broadcastContextUpdate,
  requestContextUsage,
  handleControlResponse,
  emitContextInjection,
  checkCostBudget,
  checkSmartCompact,
  clearCompactTimers,
  type ContextBridge,
} from "./ws-context-tracker.js";
import { eventBus } from "./event-bus.js";
import { getLatestReading } from "./pulse-estimator.js";
import {
  getActiveSession,
  getAllActiveSessions,
  persistSession,
  cleanupZombieSessions,
  getSessionRecord,
  type ActiveSession,
} from "./session-store.js";
import type {
  BrowserOutgoingMessage,
  BrowserIncomingMessage,
  SessionStatus,
  HookEvent,
  PreToolUseResponse,
} from "@companion/shared";
import { SESSION_IDLE_TIMEOUT_MS } from "@companion/shared";
import type { CLIProcess } from "@companion/shared";
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
  type StartSessionOpts,
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

export class WsBridge {
  private cliProcesses = new Map<string, CLIProcess>();
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
      broadcastToAll,
      killSession: this.killSession.bind(this),
      handleCLIExit: (session, exitCode) => this.sessionLifecycle.handleCLIExit(session, exitCode),
      getCliProcess: (sessionId) => this.cliProcesses.get(sessionId),
      getRtkPipeline: () => this.rtkPipeline,
    };
    this.healthIdle = new HealthIdleManager(healthIdleBridge);

    this.idleDetector = new IdleDetector({
      onIdle: (sessionId, idleDurationMs) => {
        const session = getActiveSession(sessionId);
        if (!session) return;
        // Broadcast idle event to all connected browsers
        broadcastToAll(session, {
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

    // Build the bridge interface for MessageHandler
    const messageHandlerBridge: MessageHandlerBridge = {
      broadcastToAll,
      broadcastToSubscribers,
      updateStatus: this.updateStatus.bind(this),
      persistSession: (session) => persistSession(session),
      emitContextInjection,
      broadcastContextUpdate,
      requestContextUsage: (session) => requestContextUsage(this.contextBridge, session),
      checkCostBudget,
      checkSmartCompact: (session) => checkSmartCompact(this.compactBridge, session),
      startIdleTimer: (session) => {
        const settings = this.sessionSettings.get(session.id) ?? DEFAULT_SESSION_SETTINGS;
        this.healthIdle.startIdleTimer(session, settings);
      },
      sendToCLI: this.sendToCLI.bind(this),
      reloadRTKConfig: this.reloadRTKConfig.bind(this),
      getRtkPipeline: () => this.rtkPipeline,
      getIdleDetector: () => this.idleDetector,
      getPlanWatcher: (sessionId) => this.planWatchers.get(sessionId),
      getSessionSettings: (sessionId) => this.getSessionSettings(sessionId),
      handleStreamEvent,
      handleControlRequest: (session, msg) => handleControlRequest(this.permBridge, session, msg),
      handleToolProgress,
      handleControlResponse,
    };
    this.messageHandler = new MessageHandler(messageHandlerBridge);

    // Build the bridge interface for UserMessageHandler
    // Lazy bridge getters (declared before object literal to avoid TDZ confusion)
    const lazyPermBridge = () => this.permBridge;
    const lazyMultiBrainBridge = () => this.multiBrainBridge;
    const userMessageBridge: UserMessageBridge = {
      broadcastToAll,
      broadcastToSubscribers,
      broadcastLockStatus: (session) => this.healthIdle.broadcastLockStatus(session),
      updateStatus: this.updateStatus.bind(this),
      emitContextInjection,
      clearIdleTimer: (sessionId) => this.healthIdle.clearIdleTimer(sessionId),
      getSessionRecord: (sessionId) => getSessionRecord(sessionId),
      getSdkHandle: (sessionId) => this.sdkHandles.get(sessionId),
      startSessionWithSdk: (sessionId, session, opts) =>
        this.sessionLifecycle.startSessionWithSdk(sessionId, session, opts),
      getSessionSettings: (sessionId) => this.getSessionSettings(sessionId),
      sendToCLI: this.sendToCLI.bind(this),
      sendUserMessage: this.sendUserMessage.bind(this),
      get permBridge() {
        return lazyPermBridge();
      },
      get multiBrainBridge() {
        return lazyMultiBrainBridge();
      },
    };
    this.userMessageHandler = new UserMessageHandler(userMessageBridge);

    // Build the bridge interface for SessionLifecycleManager
    const lifecycleBridge: SessionLifecycleBridge = {
      broadcastToAll,
      broadcastToSubscribers,
      updateStatus: this.updateStatus.bind(this),
      emitContextInjection,
      handleSystemInit: (session, msg) => this.messageHandler.handleSystemInit(session, msg),
      handleAssistant: (session, msg) => this.messageHandler.handleAssistant(session, msg),
      handleResult: (session, msg) => this.messageHandler.handleResult(session, msg),
      handleStreamEvent,
      handleToolProgress,
      handleSystemStatus: (session, msg) => this.messageHandler.handleSystemStatus(session, msg),
      handleControlRequest: (session, msg) => handleControlRequest(this.permBridge, session, msg),
      handleNormalizedMessage: (session, msg) =>
        this.messageHandler.handleNormalizedMessage(session, msg),
      scheduleCleanup: (sessionId) => this.healthIdle.scheduleCleanup(sessionId),
      clearCompactTimers,
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
      clearIdleTimer: (sessionId) => this.healthIdle.clearIdleTimer(sessionId),
      stopIdleTracking: (sessionId) => this.idleDetector.stopTracking(sessionId),
      deleteSessionSettings: (sessionId) => this.sessionSettings.delete(sessionId),
      notifyParentOfChildEnd: (childSessionId, status, preEndShortId) =>
        notifyParentOfChildEnd(this.multiBrainBridge, childSessionId, status, preEndShortId),
      setSessionSettings: (sessionId, settings) => this.sessionSettings.set(sessionId, settings),
      cancelCleanupTimer: (sessionId) => this.healthIdle.cancelCleanupTimer(sessionId),
      clearSessionCache: (sessionId) => this.rtkPipeline.clearSessionCache(sessionId),
    };
    this.sessionLifecycle = new SessionLifecycleManager(lifecycleBridge);

    // Start health check + cleanup AFTER all handlers are constructed
    // (healthIdleBridge closures reference this.sessionLifecycle)
    this.healthIdle.startHealthCheck(() => this.cliProcesses);
    this.healthIdle.startCleanupSweep();
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

  /**
   * Scan DB for zombie sessions (active in DB but not in memory) and mark them ended.
   * Returns count of cleaned sessions.
   */
  cleanupZombieSessions(): number {
    return cleanupZombieSessions((id) => this.cliProcesses.has(id) || this.sdkHandles.has(id));
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  async startSession(opts: StartSessionOpts): Promise<string> {
    return this.sessionLifecycle.startSession(opts);
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
      this.healthIdle.clearIdleTimer(sessionId);
      log.info("Keep-alive enabled, idle timer cleared", { sessionId });
    } else if (next.idleTimeoutMs === 0) {
      // Explicit "never" timeout — clear timer
      this.healthIdle.clearIdleTimer(sessionId);
    } else {
      // Reset timer with new duration if session is currently idle
      const st = session.state.status;
      if (st === "idle") {
        this.healthIdle.clearIdleTimer(sessionId);
        this.healthIdle.startIdleTimer(session, next);
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
      this.userMessageHandler.routeBrowserMessage(session, msg);
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

    this.userMessageHandler.handleUserMessage(session, content, source);
  }

  /** Send a multimodal message (text + images) directly to CLI. */
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
    this.userMessageHandler.sendMultimodalMessage(session, contentBlocks, source);
  }

  /** Bridge interface for compact-manager.ts */
  private get compactBridge(): CompactBridge {
    return {
      broadcastToAll,
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
      broadcastToAll,
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

  /** Public: broadcast a custom event to all subscribers of a session */
  broadcastEvent(sessionId: string, event: Record<string, unknown>): void {
    const session = getActiveSession(sessionId);
    if (!session) return;
    broadcastToAll(session, event as unknown as BrowserIncomingMessage);
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

    broadcastToAll(session, {
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
