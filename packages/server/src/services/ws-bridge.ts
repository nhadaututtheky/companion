/**
 * WsBridge — Core message router between CLI, Browser, and Telegram.
 * Handles session lifecycle, permissions, auto-approve, and subscriber system.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import { createDefaultPipeline, getRTKConfig, type RTKPipeline } from "../rtk/index.js";
import { launchCLI, createPlanModeWatcher } from "./cli-launcher.js";
import { startSdkSession, type SdkSessionHandle } from "./sdk-engine.js";
import { summarizeSession, buildSummaryInjection } from "./session-summarizer.js";
import { buildSessionContext } from "./session-context.js";
import { handleMentions } from "./mention-router.js";
import {
  handleDocsCommand as handleDocsCmd,
  handleResearchCommand as handleResearchCmd,
  handleCrawlCommand as handleCrawlCmd,
  maybeEnrichWithDocs as enrichWithDocs,
  type WebIntelBridge,
} from "./web-intel-handler.js";
import {
  checkSmartCompact as checkCompact,
  clearCompactTimers,
  type CompactBridge,
} from "./compact-manager.js";
import {
  buildProjectMap,
  buildMessageContext,
  buildActivityContext,
  clearActivityState,
  reviewPlan,
  checkBreaks,
  hasPlanIndicators,
  extractFilePaths,
  getCodeGraphConfig,
} from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
import { scanPrompt, isScanEnabled } from "./prompt-scanner.js";
import { broadcastToSpectators, disconnectAllSpectators } from "./spectator-bridge.js";
import { revokeAllForSession } from "./share-manager.js";
import { eventBus } from "./event-bus.js";
import { generateSessionName } from "./session-namer.js";
import { processToolEvent, removeTracker } from "../codegraph/event-collector.js";
import {
  getOrCreatePulse,
  cleanupPulse,
  finalizePulseTurn,
} from "./pulse-estimator.js";
import {
  createActiveSession,
  getActiveSession,
  getAllActiveSessions,
  removeActiveSession,
  persistSession,
  createSessionRecord,
  endSessionRecord,
  storeMessage,
  updateCliSessionId,
  cleanupZombieSessions,
  clearCliSessionId,
  pushMessageHistory,
  updateSessionCostWarned,
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
  SessionState,
  SessionStatus,
  PermissionRequest,
  HookEvent,
  PreToolUseResponse,
  isTerminal as isTerminalStatus,
} from "@companion/shared";
import {
  SESSION_IDLE_TIMEOUT_MS,
  HEALTH_CHECK_INTERVAL_MS,
  getMaxContextTokens,
} from "@companion/shared";
import type { LaunchResult } from "./cli-launcher.js";
import { IdleDetector } from "./idle-detector.js";
import { terminalLock } from "./terminal-lock.js";

const log = createLogger("ws-bridge");

// ─── Types ──────────────────────────────────────────────────────────────────

interface SocketLike {
  send: (data: string) => void;
}

type StatusChangeCallback = (sessionId: string, status: SessionStatus) => void;

// ─── WsBridge ───────────────────────────────────────────────────────────────

// ─── Session Settings ────────────────────────────────────────────────────────

export interface SessionSettings {
  /** Idle timeout in milliseconds. 0 = never. */
  idleTimeoutMs: number;
  /** When true, the idle timer is suppressed (keep-alive). */
  keepAlive: boolean;
  /** When true, automatically re-inject identity context after compaction. */
  autoReinjectOnCompact: boolean;
}

const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
  keepAlive: false,
  autoReinjectOnCompact: true,
};

// ─── EarlyResults buffer ─────────────────────────────────────────────────────

interface EarlyResultEntry {
  msg: BrowserIncomingMessage;
  expiresAt: number;
}

/** TTL for buffered early results (5 seconds) */
const EARLY_RESULT_TTL_MS = 5_000;

/** Whether to use the new SDK engine (set USE_SDK_ENGINE=1 to enable) */
const USE_SDK_ENGINE = process.env.USE_SDK_ENGINE === "1";

export class WsBridge {
  private cliProcesses = new Map<string, LaunchResult>();
  private sdkHandles = new Map<string, SdkSessionHandle>();
  /** Permission resolvers: requestId → resolve function (for SDK canUseTool bridge) */
  private permissionResolvers = new Map<
    string,
    (result: {
      behavior: "allow" | "deny";
      message?: string;
      updatedPermissions?: unknown[];
    }) => void
  >();
  private planWatchers = new Map<string, ReturnType<typeof createPlanModeWatcher>>();
  /** RTK compression pipeline for tool outputs */
  private rtkPipeline: RTKPipeline = this.initRTKPipeline();
  private onStatusChange?: StatusChangeCallback;
  /** Idle timers keyed by session ID — only for non-Telegram sessions */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-session timeout/keep-alive settings */
  private sessionSettings = new Map<string, SessionSettings>();
  /** Process liveness check interval handle */
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  /** Cleanup timers keyed by session ID — cancellable 5-min post-end removal */
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Periodic sweep interval — catches sessions that slipped through per-session timers */
  private cleanupSweepInterval: ReturnType<typeof setInterval> | null = null;
  /** Idle detector for agent output tracking */
  private idleDetector: IdleDetector;

  /** Delay before removing an ended session from in-memory maps (5 minutes) */
  private static readonly SESSION_CLEANUP_DELAY_MS = 5 * 60 * 1000;
  /** How often the periodic sweep runs (10 minutes) */
  private static readonly CLEANUP_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

  constructor(opts?: { onStatusChange?: StatusChangeCallback }) {
    this.onStatusChange = opts?.onStatusChange;
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
    this.startHealthCheck();
    this.startCleanupSweep();
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
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.cleanupSweepInterval !== null) {
      clearInterval(this.cleanupSweepInterval);
      this.cleanupSweepInterval = null;
    }
    // Cancel all pending cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
  }

  /**
   * Every CLEANUP_SWEEP_INTERVAL_MS, sweep all in-memory sessions and remove any
   * that are in a terminal state (ended/error) but have no pending cleanup timer.
   * This catches sessions that transitioned to terminal via paths that didn't call
   * scheduleCleanup, or where the timer fired but removeActiveSession wasn't reached.
   */
  private startCleanupSweep(): void {
    this.cleanupSweepInterval = setInterval(() => {
      for (const session of getAllActiveSessions()) {
        const isTerminal = session.state.status === "ended" || session.state.status === "error";
        if (!isTerminal) continue;
        // If no cleanup timer is pending, this session slipped through — remove it now
        if (!this.cleanupTimers.has(session.id)) {
          this.rtkPipeline.clearSessionCache(session.id);
          removeActiveSession(session.id);
          log.debug("Sweep: removed stale ended session from memory", { sessionId: session.id });
        }
      }
    }, WsBridge.CLEANUP_SWEEP_INTERVAL_MS);
  }

  /** Schedule removal of an ended session from in-memory maps after the cleanup delay. */
  private scheduleCleanup(sessionId: string): void {
    // Cancel any existing timer for this session
    this.cancelCleanupTimer(sessionId);

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(sessionId);
      const s = getActiveSession(sessionId);
      if (s && (s.state.status === "ended" || s.state.status === "error")) {
        this.rtkPipeline.clearSessionCache(sessionId);
        removeActiveSession(sessionId);
        log.debug("Removed ended session from memory", { sessionId });
      }
    }, WsBridge.SESSION_CLEANUP_DELAY_MS);

    this.cleanupTimers.set(sessionId, timer);
  }

  /** Cancel a pending cleanup timer (e.g. when a session is resumed before cleanup fires). */
  private cancelCleanupTimer(sessionId: string): void {
    const existing = this.cleanupTimers.get(sessionId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.cleanupTimers.delete(sessionId);
    }
  }

  /**
   * Every HEALTH_CHECK_INTERVAL_MS, verify all tracked CLI processes are still alive.
   * If a process died without triggering onExit (e.g. OOM kill), handle the exit manually.
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      for (const [sessionId, launch] of this.cliProcesses) {
        const alive = launch.isAlive?.() ?? true;
        if (!alive) {
          log.warn("Health check: process died silently, cleaning up", { sessionId });
          const session = getActiveSession(sessionId);
          if (session) {
            // Capture stderr before handling exit
            session.lastStderrLines = launch.getStderrLines?.() ?? [];
            this.handleCLIExit(session, -1);
          } else {
            this.cliProcesses.delete(sessionId);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
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
  }): Promise<string> {
    const sessionId = randomUUID();

    const initialState: SessionState = {
      session_id: sessionId,
      model: opts.model,
      cwd: opts.cwd,
      tools: [],
      permissionMode: opts.permissionMode ?? "default",
      claude_code_version: "",
      mcp_servers: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      files_read: [],
      files_modified: [],
      files_created: [],
      started_at: Date.now(),
      status: "starting",
      is_in_plan_mode: false,
      name: opts.name,
      cost_budget_usd: opts.costBudgetUsd,
      cost_warned: 0,
      compact_mode: (opts.compactMode as SessionState["compact_mode"]) ?? "manual",
      compact_threshold: opts.compactThreshold ?? 75,
      thinking_mode:
        opts.thinkingBudget === undefined ? "adaptive" : opts.thinkingBudget === 0 ? "off" : "deep",
    };

    // Create in-memory session
    const session = createActiveSession(sessionId, initialState);

    // Emit session created event
    eventBus.emit("session:created", {
      sessionId,
      projectSlug: opts.projectSlug,
    });

    // Store identity prompt on session if provided
    if (opts.identityPrompt) {
      session.identityPrompt = opts.identityPrompt;
    }

    // Apply per-session auto-reinject setting (defaults to true)
    if (opts.autoReinjectOnCompact === false) {
      this.sessionSettings.set(sessionId, {
        ...DEFAULT_SESSION_SETTINGS,
        autoReinjectOnCompact: false,
      });
    }

    // Persist to DB (returns generated shortId)
    const shortId = createSessionRecord({
      id: sessionId,
      projectSlug: opts.projectSlug,
      model: opts.model,
      cwd: opts.cwd,
      permissionMode: opts.permissionMode,
      source: opts.source ?? "api",
      parentId: opts.parentId,
      channelId: opts.channelId,
      name: opts.name,
      costBudgetUsd: opts.costBudgetUsd,
      compactMode: opts.compactMode,
      compactThreshold: opts.compactThreshold,
      personaId: opts.personaId,
    });

    // Attach shortId to session state for clients
    initialState.short_id = shortId;

    // If resuming, clear cliSessionId from old session so it's no longer listed as resumable
    if (opts.resume && opts.cliSessionId) {
      clearCliSessionId(opts.cliSessionId);
    }

    // ── SDK Engine path ──────────────────────────────────────────────────
    if (USE_SDK_ENGINE) {
      return this.startSessionWithSdk(sessionId, session, opts);
    }

    // ── Legacy CLI launcher path ────────────────────────────────────────
    return this.startSessionWithCli(sessionId, session, opts);
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
    // Build prompt with summary + session context injection
    let fullPrompt = opts.prompt ?? "";
    if (fullPrompt && !opts.resume) {
      const summaryContext = buildSummaryInjection(opts.projectSlug);
      const sessionContext = buildSessionContext({
        sessionId,
        shortId: session.state.short_id ?? sessionId.slice(0, 8),
        projectSlug: opts.projectSlug,
        model: opts.model,
        permissionMode: opts.permissionMode ?? "default",
        cwd: opts.cwd,
        source: opts.source ?? "sdk",
      });
      // CodeGraph: inject project map if graph is ready (respects config)
      let codeGraphMap = "";
      if (opts.projectSlug && isGraphReady(opts.projectSlug)) {
        const cgConfig = getCodeGraphConfig(opts.projectSlug);
        if (cgConfig.injectionEnabled && cgConfig.projectMapEnabled) {
          try {
            codeGraphMap = buildProjectMap(opts.projectSlug) ?? "";
            if (codeGraphMap) {
              this.emitContextInjection(
                session,
                "project_map",
                `Project map for ${opts.projectSlug}`,
                codeGraphMap.length,
              );
            }
          } catch {
            /* skip */
          }
        }
      }
      fullPrompt = `${fullPrompt}${summaryContext ?? ""}${sessionContext}${codeGraphMap}`;
    }

    const handle = startSdkSession(
      {
        sessionId,
        cwd: opts.cwd,
        model: opts.model,
        permissionMode: opts.permissionMode,
        prompt: fullPrompt,
        resume: opts.resume ? opts.cliSessionId : undefined,
        maxTurns: 200,
        maxBudgetUsd: 10,
        envVars: opts.envVars,
      },
      {
        onSystemInit: (msg) => {
          this.handleSystemInit(session, {
            type: "system",
            subtype: "init",
            session_id: msg.session_id,
            cwd: msg.cwd,
            tools: msg.tools,
            mcp_servers: (msg.mcp_servers ?? []).map((s: unknown) => {
              if (typeof s === "string") return { name: s, status: "connected" };
              return s as { name: string; status: string };
            }),
            model: msg.model,
            permissionMode: msg.permissionMode ?? opts.permissionMode ?? "default",
            claude_code_version: msg.claude_code_version ?? "",
            slash_commands: [],
            uuid: msg.uuid ?? "",
          });
        },

        onAssistant: (msg) => {
          // Map SDK message to our CLIAssistantMessage shape
          this.handleAssistant(session, {
            type: "assistant",
            message: msg.message as CLIAssistantMessage["message"],
            parent_tool_use_id: msg.parent_tool_use_id,
            error: msg.error,
            uuid: msg.uuid ?? "",
            session_id: msg.session_id,
          });
        },

        onResult: (msg) => {
          this.handleResult(session, msg as unknown as CLIResultMessage);
        },

        onStreamEvent: (msg) => {
          this.handleStreamEvent(session, {
            type: "stream_event",
            event: msg.event,
            parent_tool_use_id: msg.parent_tool_use_id,
            uuid: msg.uuid ?? "",
            session_id: msg.session_id,
          });
        },

        onToolProgress: (msg) => {
          const typed = msg as {
            type: "tool_progress";
            tool_use_id: string;
            tool_name: string;
            parent_tool_use_id: string | null;
            elapsed_time_seconds: number;
            uuid: string;
            session_id: string;
          };
          this.handleToolProgress(session, {
            type: "tool_progress",
            tool_use_id: typed.tool_use_id,
            tool_name: typed.tool_name,
            parent_tool_use_id: typed.parent_tool_use_id,
            elapsed_time_seconds: typed.elapsed_time_seconds,
            uuid: typed.uuid,
            session_id: typed.session_id,
          });
        },

        onStatusChange: (msg) => {
          if (msg.status === "compacting") {
            this.handleSystemStatus(session, {
              subtype: "status",
              status: "compacting",
            });
          }
        },

        onError: (error) => {
          this.broadcastToAll(session, {
            type: "error",
            message: error,
          });
        },

        onExit: (exitCode, _reason) => {
          this.sdkHandles.delete(sessionId);
          this.handleCLIExit(session, exitCode);
        },

        // Permission bridge: SDK blocks until this resolves
        requestPermission: (requestId, toolName, input, permOpts) => {
          return new Promise((resolve) => {
            // Store resolver — will be called when user responds via WebSocket
            this.permissionResolvers.set(requestId, (response) => {
              if (response.behavior === "allow") {
                resolve({
                  behavior: "allow",
                  updatedPermissions: response.updatedPermissions as
                    | import("@anthropic-ai/claude-agent-sdk").PermissionUpdate[]
                    | undefined,
                });
              } else {
                resolve({ behavior: "deny", message: "Denied by user" });
              }
            });

            // Forward to handleControlRequest which broadcasts to browsers
            this.handleControlRequest(session, {
              type: "control_request",
              request_id: requestId,
              request: {
                subtype: "can_use_tool",
                tool_name: toolName,
                input,
                permission_suggestions:
                  permOpts.suggestions as PermissionRequest["permission_suggestions"],
                description: permOpts.description,
                tool_use_id: permOpts.toolUseId,
              },
            });
          });
        },
      },
    );

    // Mark session as connected (SDK doesn't have a "stdin sender" — messages go through query)
    session.cliSend = null; // SDK manages its own stdin
    this.sdkHandles.set(sessionId, handle);

    log.info("Session started (SDK engine)", { sessionId, cwd: opts.cwd, model: opts.model });
    return sessionId;
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
    },
  ): string {
    // Create plan mode watcher
    const planWatcher = createPlanModeWatcher(
      (ndjson) => this.sendToCLI(session, ndjson),
      (action) => {
        log.warn("Plan mode stuck escalation", { sessionId, action });
        if (action === "kill") {
          this.killSession(sessionId);
        }
        this.broadcastToSubscribers(session, {
          type: "error",
          message: `Plan mode stuck — ${action}`,
        });
      },
    );
    planWatcher.start();
    this.planWatchers.set(sessionId, planWatcher);

    // Launch CLI process with hooks URL pointing to Companion's hook receiver
    const hooksUrl = this.getHooksBaseUrl();
    const launch = launchCLI(
      {
        sessionId,
        cwd: opts.cwd,
        model: opts.model,
        permissionMode: opts.permissionMode,
        prompt: opts.prompt,
        resume: opts.resume,
        cliSessionId: opts.cliSessionId,
        envVars: opts.envVars,
        hooksUrl,
        hookSecret: session.hookSecret,
        bare: opts.bare,
        thinkingBudget: opts.thinkingBudget,
      },
      (ndjsonLine) => this.handleCLIMessage(session, ndjsonLine),
      (exitCode) => {
        session.lastStderrLines = launch.getStderrLines();
        this.handleCLIExit(session, exitCode);
      },
    );

    session.cliSend = launch.send;
    session.pid = launch.pid;
    this.cliProcesses.set(sessionId, launch);

    // Flush pending messages
    for (const pending of session.pendingMessages) {
      launch.send(pending);
    }
    session.pendingMessages = [];

    // Send initial prompt via stdin NDJSON
    if (opts.prompt && !opts.resume) {
      const summaryContext = buildSummaryInjection(opts.projectSlug);
      const sessionContext = buildSessionContext({
        sessionId,
        shortId: session.state.short_id ?? sessionId.slice(0, 8),
        projectSlug: opts.projectSlug,
        model: opts.model,
        permissionMode: opts.permissionMode ?? "default",
        cwd: opts.cwd,
        source: opts.source ?? "cli",
      });
      // CodeGraph: inject project map if graph is ready (respects config)
      let codeGraphMapCli = "";
      if (opts.projectSlug && isGraphReady(opts.projectSlug)) {
        const cgCliConfig = getCodeGraphConfig(opts.projectSlug);
        if (cgCliConfig.injectionEnabled && cgCliConfig.projectMapEnabled) {
          try {
            codeGraphMapCli = buildProjectMap(opts.projectSlug) ?? "";
            if (codeGraphMapCli) {
              this.emitContextInjection(
                session,
                "project_map",
                `Project map for ${opts.projectSlug}`,
                codeGraphMapCli.length,
              );
            }
          } catch {
            /* skip */
          }
        }
      }
      const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}${codeGraphMapCli}`;

      const ndjson = JSON.stringify({
        type: "user",
        message: { role: "user", content: fullPrompt },
      });
      setTimeout(() => {
        this.sendToCLI(session, ndjson);
      }, 1000);
    }

    log.info("Session started (CLI launcher)", { sessionId, cwd: opts.cwd, model: opts.model });
    return sessionId;
  }

  killSession(sessionId: string): void {
    this.clearIdleTimer(sessionId);
    this.cancelCleanupTimer(sessionId);
    this.sessionSettings.delete(sessionId);
    this.earlyResults.delete(sessionId);

    // Kill SDK handle if present
    const sdkHandle = this.sdkHandles.get(sessionId);
    if (sdkHandle) {
      sdkHandle.abort();
      this.sdkHandles.delete(sessionId);
    }

    // Kill legacy CLI process if present
    const launch = this.cliProcesses.get(sessionId);
    if (launch) {
      launch.kill();
      this.cliProcesses.delete(sessionId);
    }

    // Clean up any pending permission resolvers for this session
    const session = getActiveSession(sessionId);
    if (session) {
      for (const [reqId] of session.pendingPermissions) {
        const resolver = this.permissionResolvers.get(reqId);
        if (resolver) {
          resolver({ behavior: "deny", message: "Session killed" });
          this.permissionResolvers.delete(reqId);
        }
      }
    }

    const watcher = this.planWatchers.get(sessionId);
    if (watcher) {
      watcher.stop();
      this.planWatchers.delete(sessionId);
    }

    // Clean up graph activity tracker, injection state, and pulse (safe no-ops if never created)
    removeTracker(sessionId);
    clearActivityState(sessionId);
    cleanupPulse(sessionId);

    if (session) {
      this.updateStatus(session, "ended");
      persistSession(session);
      removeActiveSession(sessionId);
      this.rtkPipeline.clearSessionCache(sessionId);
    }

    // Always update DB regardless of in-memory state
    endSessionRecord(sessionId);

    // Auto-summarize (non-blocking)
    void summarizeSession(sessionId);
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return getActiveSession(sessionId);
  }

  getActiveSessions(): ActiveSession[] {
    return getAllActiveSessions();
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
    const early = this.earlyResults.get(sessionId);
    if (early && Date.now() < early.expiresAt) {
      log.info("Replaying early result to late subscriber", { sessionId, subscriberId });
      try {
        callback(early.msg);
      } catch (err) {
        log.error("Early result replay error", { subscriber: subscriberId, err: String(err) });
      }
      this.earlyResults.delete(sessionId);
    } else if (early) {
      // Entry expired — clean it up
      this.earlyResults.delete(sessionId);
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

    // Replay any buffered early result to this browser (race window fix)
    const earlyResult = this.earlyResults.get(sessionId);
    if (earlyResult && Date.now() < earlyResult.expiresAt) {
      log.debug("Replaying early result to late browser", { sessionId });
      try {
        ws.send(JSON.stringify(earlyResult.msg));
      } catch {
        // ignore send errors on this newly connected socket
      }
      this.earlyResults.delete(sessionId);
    } else if (earlyResult) {
      this.earlyResults.delete(sessionId);
    }

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

  // ── CLI message handling ────────────────────────────────────────────────

  private handleCLIMessage(session: ActiveSession, line: string): void {
    // Record output activity for idle detection
    this.idleDetector.recordOutput(session.id);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      log.debug("Non-JSON CLI output", { line: line.slice(0, 100) });
      return;
    }

    // Handle control_response separately — not part of CLIMessage union
    // (responses to control_requests we sent TO the CLI, e.g. get_context_usage)
    if (parsed.type === "control_response") {
      this.handleControlResponse(session, parsed);
      return;
    }

    const msg = parsed as CLIMessage;

    switch (msg.type) {
      case "system":
        if ("subtype" in msg && msg.subtype === "init") {
          this.handleSystemInit(session, msg as CLISystemInitMessage);
        } else if ("subtype" in msg && msg.subtype === "status") {
          this.handleSystemStatus(session, msg);
        }
        break;
      case "assistant":
        this.handleAssistant(session, msg as CLIAssistantMessage);
        break;
      case "result":
        this.handleResult(session, msg as CLIResultMessage);
        break;
      case "stream_event":
        this.handleStreamEvent(session, msg as CLIStreamEventMessage);
        break;
      case "control_request":
        this.handleControlRequest(session, msg as CLIControlRequestMessage);
        break;
      case "tool_progress":
        this.handleToolProgress(session, msg as CLIToolProgressMessage);
        break;
      case "keep_alive":
        // no-op
        break;
    }
  }

  private handleSystemInit(session: ActiveSession, msg: CLISystemInitMessage): void {
    session.state = {
      ...session.state,
      session_id: msg.session_id || session.state.session_id,
      cwd: msg.cwd,
      tools: msg.tools,
      permissionMode: msg.permissionMode,
      claude_code_version: msg.claude_code_version,
      mcp_servers: msg.mcp_servers,
      model: msg.model,
      status: "idle",
    };

    // Persist the CLI's internal session ID for resume support
    if (msg.session_id) {
      session.cliSessionId = msg.session_id;
      updateCliSessionId(session.id, msg.session_id);
    }

    this.broadcastToAll(session, {
      type: "session_init",
      session: session.state,
    });

    this.updateStatus(session, "idle");
    persistSession(session);

    log.info("CLI initialized", {
      sessionId: session.id,
      cliSessionId: msg.session_id,
      model: msg.model,
      version: msg.claude_code_version,
    });
  }

  private handleSystemStatus(
    session: ActiveSession,
    msg: { subtype: "status"; status: "compacting" | null },
  ): void {
    if (msg.status === "compacting") {
      this.updateStatus(session, "compacting");
    } else if (msg.status === null && session.compactPending) {
      // Compact finished — reset the guard flag
      session.compactPending = false;
      this.broadcastToAll(session, {
        type: "compact_handoff",
        stage: "done",
        message: "Context compaction complete.",
      } as BrowserIncomingMessage);

      // Auto re-inject identity context after compaction
      this.maybeReinjectIdentity(session);
    }
  }

  /**
   * After context compaction completes, re-inject a minimal system context
   * message so Claude retains project/identity awareness in the new context window.
   * Only fires if autoReinjectOnCompact is enabled (default: true).
   */
  private maybeReinjectIdentity(session: ActiveSession): void {
    const settings = this.sessionSettings.get(session.id) ?? DEFAULT_SESSION_SETTINGS;
    if (!settings.autoReinjectOnCompact) return;

    // Check budget before re-injecting
    const record = getSessionRecord(session.id);
    if (record?.costBudgetUsd && session.state.total_cost_usd >= record.costBudgetUsd) {
      log.info("Skipping identity re-injection — budget exceeded", { sessionId: session.id });
      return;
    }

    const projectName = session.state.name ?? session.state.session_id.slice(0, 8);
    const cwd = session.state.cwd;
    const identityPart = session.identityPrompt ? ` ${session.identityPrompt}` : "";

    const reinjectMsg = [
      `[System context re-injection after compaction]`,
      `You are working on project: ${projectName}.`,
      `Working directory: ${cwd}.`,
      identityPart,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    log.info("Re-injecting identity after compact", { sessionId: session.id });

    // Use the internal CLI send path directly to avoid budget gate and history noise
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content: reinjectMsg },
    });
    this.sendToCLI(session, ndjson);
  }

  private handleAssistant(session: ActiveSession, msg: CLIAssistantMessage): void {
    // Track file operations from tool_use blocks
    if (msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type !== "tool_use") continue;

        const toolName = block.name;
        const input = block.input as Record<string, string>;
        const filePath = input?.file_path ?? input?.path ?? "";

        if (!filePath) continue;

        if (toolName === "Read") {
          if (!session.state.files_read.includes(filePath)) {
            session.state = {
              ...session.state,
              files_read: [...session.state.files_read, filePath],
            };
          }
        } else if (toolName === "Edit") {
          if (!session.state.files_modified.includes(filePath)) {
            session.state = {
              ...session.state,
              files_modified: [...session.state.files_modified, filePath],
            };
          }
        } else if (toolName === "Write") {
          if (session.state.files_read.includes(filePath)) {
            if (!session.state.files_modified.includes(filePath)) {
              session.state = {
                ...session.state,
                files_modified: [...session.state.files_modified, filePath],
              };
            }
          } else {
            if (!session.state.files_created.includes(filePath)) {
              session.state = {
                ...session.state,
                files_created: [...session.state.files_created, filePath],
              };
            }
          }
        }

        // Detect plan mode via tool_use
        if (toolName === "EnterPlanMode") {
          session.state = { ...session.state, is_in_plan_mode: true };
          this.planWatchers.get(session.id)?.onEnterPlan();
        } else if (toolName === "ExitPlanMode") {
          session.state = { ...session.state, is_in_plan_mode: false };
          this.planWatchers.get(session.id)?.onExitPlan();
        }

        // CodeGraph: emit graph:activity event (fire-and-forget)
        try {
          const cgEventRecord = getSessionRecord(session.id);
          const cgProjectSlug = cgEventRecord?.projectSlug;
          if (cgProjectSlug) {
            const activityEvent = processToolEvent(
              session.id,
              cgProjectSlug,
              session.state.cwd,
              toolName,
              block.input as Record<string, unknown>,
            );
            if (activityEvent) {
              this.broadcastToAll(session, {
                type: "graph:activity",
                sessionId: activityEvent.sessionId,
                filePaths: activityEvent.filePaths,
                nodeIds: activityEvent.nodeIds,
                toolName: activityEvent.toolName,
                toolAction: activityEvent.toolAction,
                timestamp: activityEvent.timestamp,
              });
            }
          }
        } catch {
          // Fire-and-forget — never block agent thread
        }

        // Pulse: record tool_use (fire-and-forget)
        try {
          getOrCreatePulse(session.id).recordToolUse(
            toolName,
            block.input as Record<string, unknown>,
          );
        } catch { /* never block */ }
      }
    }

    // Reload RTK config periodically (picks up settings changes without restart)
    this.reloadRTKConfig();

    // RTK: Compress tool_result content (ANSI strip, dedup, truncation)
    // Full output goes to browser; compressed version tracked for token savings
    let rtkSessionSaved = 0;
    let rtkSessionCompressions = 0;
    let rtkCacheHits = 0;

    // Build toolName lookup: tool_use_id → tool name
    // NOTE: tool_use and tool_result may be in the same assistant message
    // (Claude SDK batches them). For cross-message correlation, we'd need
    // session-level tracking of tool_use_id → name. This covers the common case.
    const toolNameMap = new Map<string, string>();
    if (msg.message?.content) {
      for (const b of msg.message.content) {
        if (b.type === "tool_use" && b.id && b.name) {
          toolNameMap.set(b.id, b.name);
        }
      }
    }

    const sanitizedMessage = msg.message
      ? {
          ...msg.message,
          content: msg.message.content?.map((block) => {
            if (block.type === "tool_result" && typeof block.content === "string") {
              // Pulse: record tool result success/failure
              try {
                getOrCreatePulse(session.id).recordToolResult(
                  toolNameMap.get(block.tool_use_id) ?? "unknown",
                  !!block.is_error,
                );
              } catch { /* never block */ }

              const rtkResult = this.rtkPipeline.transform(block.content, {
                sessionId: session.id,
                isError: block.is_error,
                toolName: toolNameMap.get(block.tool_use_id) ?? undefined,
              });
              if (rtkResult.savings.totalTokensSaved > 0) {
                rtkSessionSaved += rtkResult.savings.totalTokensSaved;
                rtkSessionCompressions++;
                if (rtkResult.savings.cached) rtkCacheHits++;
                log.debug("RTK compressed tool output", {
                  sessionId: session.id,
                  strategies: rtkResult.savings.strategiesApplied,
                  ratio: rtkResult.savings.ratio.toFixed(2),
                  tokensSaved: rtkResult.savings.totalTokensSaved,
                  cached: rtkResult.savings.cached,
                  budgetTruncated: rtkResult.savings.budgetTruncated,
                });
              }
              // Send compressed to browser (cleaner display)
              return { ...block, content: rtkResult.compressed };
            }
            return block;
          }),
        }
      : msg.message;

    // Track RTK savings in session state
    if (rtkSessionSaved > 0) {
      session.state = {
        ...session.state,
        rtk_tokens_saved: (session.state.rtk_tokens_saved ?? 0) + rtkSessionSaved,
        rtk_compressions: (session.state.rtk_compressions ?? 0) + rtkSessionCompressions,
        rtk_cache_hits: (session.state.rtk_cache_hits ?? 0) + rtkCacheHits,
      };
    }

    const browserMsg: BrowserIncomingMessage = {
      type: "assistant",
      message: sanitizedMessage,
      parent_tool_use_id: msg.parent_tool_use_id,
      timestamp: Date.now(),
    };

    pushMessageHistory(session, browserMsg);
    this.broadcastToAll(session, browserMsg);
    this.updateStatus(session, "busy");

    // Store assistant message text in DB
    if (msg.message?.content) {
      const textContent = msg.message.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (textContent) {
        // Pulse: record assistant text for tone analysis
        try {
          getOrCreatePulse(session.id).recordAssistantText(textContent);
        } catch { /* never block */ }

        storeMessage({
          id: msg.message.id ?? randomUUID(),
          sessionId: session.id,
          role: "assistant",
          content: textContent,
          source: "api",
        });

        // ── CodeGraph: plan review (non-blocking, respects config) ──
        const cgRecord = getSessionRecord(session.id);
        const cgPlanSlug = cgRecord?.projectSlug;
        if (cgPlanSlug && isGraphReady(cgPlanSlug) && hasPlanIndicators(textContent)) {
          const cgPlanConfig = getCodeGraphConfig(cgPlanSlug);
          if (cgPlanConfig.injectionEnabled && cgPlanConfig.planReviewEnabled) {
            const files = extractFilePaths(textContent);
            if (files.length > 0) {
              try {
                const hint = reviewPlan(cgPlanSlug, files);
                if (hint) {
                  session.pendingCodeGraphHint = hint;
                  this.emitContextInjection(
                    session,
                    "plan_review",
                    `Plan review: ${files.length} files analyzed`,
                    hint.length,
                  );
                }
              } catch {
                /* skip */
              }
            }
          }
        }
      }
    }
  }

  /** Emit a context:injection event to all connected browsers for this session */
  private emitContextInjection(
    session: ActiveSession,
    injectionType: "project_map" | "message_context" | "plan_review" | "break_check" | "web_docs" | "activity_feed",
    summary: string,
    charCount: number,
  ): void {
    this.broadcastToAll(session, {
      type: "context:injection",
      sessionId: session.id,
      injectionType,
      summary,
      charCount,
      tokenEstimate: Math.ceil(charCount / 4),
      timestamp: Date.now(),
    } as unknown as BrowserIncomingMessage);
  }

  /** Max context tokens by model name — delegates to shared constant */
  private static getMaxContextTokens(model: string): number {
    return getMaxContextTokens(model);
  }

  /** Broadcast context_update event with current token usage.
   *
   * CLI sends cumulative totals (total_input_tokens grows each turn).
   * Context window ≈ last turn's input tokens + last turn's output tokens.
   * We estimate by computing the delta between previous and current cumulative values.
   */
  private prevTokens = new Map<string, { input: number; output: number }>();

  private broadcastContextUpdate(session: ActiveSession): void {
    const state = session.state;
    const prev = this.prevTokens.get(session.id) ?? { input: 0, output: 0 };

    // Per-turn values = delta from previous cumulative totals
    const lastTurnInput = state.total_input_tokens - prev.input;
    const lastTurnOutput = state.total_output_tokens - prev.output;
    this.prevTokens.set(session.id, {
      input: state.total_input_tokens,
      output: state.total_output_tokens,
    });

    // Context ≈ last turn input + last output (output joins next turn's context)
    const totalTokens = lastTurnInput + lastTurnOutput;
    const maxTokens = WsBridge.getMaxContextTokens(state.model);
    const contextUsedPercent = Math.min(100, (totalTokens / maxTokens) * 100);

    // Pulse: record context pressure
    try {
      getOrCreatePulse(session.id).recordContextUpdate(contextUsedPercent);
    } catch { /* never block */ }

    this.broadcastToAll(session, {
      type: "context_update",
      contextUsedPercent,
      totalTokens,
      maxTokens,
    });
  }

  /**
   * Request accurate context usage from Claude CLI via get_context_usage control_request.
   * Sent after each turn completes (idle). Response arrives as control_response on stdout.
   */
  private requestContextUsage(session: ActiveSession): void {
    // Only for CLI engine sessions (SDK has its own tracking)
    if (this.sdkHandles.has(session.id)) return;
    // Don't request if session is ended
    if (session.state.status === "ended" || session.state.status === "error") return;

    const ndjson = JSON.stringify({
      type: "control_request",
      request: { subtype: "get_context_usage" },
    });
    this.sendToCLI(session, ndjson);
  }

  /**
   * Handle control_response messages from CLI (e.g. get_context_usage response).
   * These are responses to control_requests we sent TO the CLI.
   */
  private handleControlResponse(session: ActiveSession, msg: Record<string, unknown>): void {
    const response = msg.response as Record<string, unknown> | undefined;
    if (!response) return;

    const subtype = response.subtype as string | undefined;

    if (subtype === "get_context_usage") {
      const usage = response.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            context_window?: number;
          }
        | undefined;

      if (!usage) return;

      const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
      const maxTokens = usage.context_window ?? WsBridge.getMaxContextTokens(session.state.model);
      const contextUsedPercent = maxTokens > 0 ? Math.min(100, (totalTokens / maxTokens) * 100) : 0;

      this.broadcastToAll(session, {
        type: "context_update",
        contextUsedPercent,
        totalTokens,
        maxTokens,
      });
    }
  }

  private handleResult(session: ActiveSession, msg: CLIResultMessage): void {
    session.state = {
      ...session.state,
      total_cost_usd: msg.total_cost_usd,
      num_turns: msg.num_turns,
      total_lines_added: msg.total_lines_added ?? session.state.total_lines_added,
      total_lines_removed: msg.total_lines_removed ?? session.state.total_lines_removed,
      total_input_tokens: msg.usage?.input_tokens ?? session.state.total_input_tokens,
      total_output_tokens: msg.usage?.output_tokens ?? session.state.total_output_tokens,
      cache_creation_tokens:
        msg.usage?.cache_creation_input_tokens ?? session.state.cache_creation_tokens,
      cache_read_tokens: msg.usage?.cache_read_input_tokens ?? session.state.cache_read_tokens,
    };

    const browserMsg: BrowserIncomingMessage = {
      type: "result",
      data: msg,
    };

    pushMessageHistory(session, browserMsg);

    // Buffer result for subscribers that may not yet be registered (race window fix).
    // If no subscribers or browser sockets are connected, stash with TTL so late
    // arrivals can replay it when they subscribe.
    const hasActiveReceivers = session.browserSockets.size > 0 || session.subscribers.size > 0;
    if (!hasActiveReceivers) {
      this.earlyResults.set(session.id, {
        msg: browserMsg,
        expiresAt: Date.now() + EARLY_RESULT_TTL_MS,
      });
      log.debug("Buffered early result (no receivers yet)", { sessionId: session.id });
    } else {
      // Clear any stale early result once we know receivers are present
      this.earlyResults.delete(session.id);
    }

    this.broadcastToAll(session, browserMsg);

    // Broadcast updated session state so clients can re-compute context meter
    this.broadcastToAll(session, {
      type: "session_update",
      session: {
        total_cost_usd: session.state.total_cost_usd,
        num_turns: session.state.num_turns,
        total_input_tokens: session.state.total_input_tokens,
        total_output_tokens: session.state.total_output_tokens,
        cache_creation_tokens: session.state.cache_creation_tokens,
        cache_read_tokens: session.state.cache_read_tokens,
      },
    });

    // Pulse: finalize turn and broadcast reading (fire-and-forget, observe-only)
    try {
      // Pass cumulative tokens — PulseEstimator computes delta internally
      const cumulativeTokens = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
      const pulseReading = finalizePulseTurn(
        session.id,
        msg.num_turns,
        cumulativeTokens,
        msg.total_cost_usd,
      );
      if (pulseReading) {
        this.broadcastToAll(session, {
          type: "pulse:update",
          sessionId: session.id,
          score: pulseReading.score,
          state: pulseReading.state,
          trend: pulseReading.trend,
          signals: { ...pulseReading.signals },
          topSignal: pulseReading.topSignal,
          turn: pulseReading.turn,
          timestamp: pulseReading.timestamp,
        });
      }
    } catch { /* never block */ }

    this.updateStatus(session, "idle");
    persistSession(session);

    // ── CodeGraph: break check if files were modified (non-blocking, respects config) ──
    if (session.state.files_modified.length > 0) {
      const cgResultRecord = getSessionRecord(session.id);
      const cgBreakSlug = cgResultRecord?.projectSlug;
      if (cgBreakSlug && isGraphReady(cgBreakSlug)) {
        const cgBreakConfig = getCodeGraphConfig(cgBreakSlug);
        if (cgBreakConfig.injectionEnabled && cgBreakConfig.breakCheckEnabled) {
          try {
            const hint = checkBreaks(cgBreakSlug, session.state.files_modified);
            if (hint) {
              session.pendingCodeGraphHint = hint;
              this.emitContextInjection(
                session,
                "break_check",
                `Break check: ${session.state.files_modified.length} files modified`,
                hint.length,
              );
            }
          } catch {
            /* skip */
          }
        }
      }
    }

    // Check cost budget warnings
    this.checkCostBudget(session);

    // Broadcast context usage after updating token counts (estimate from deltas)
    this.broadcastContextUpdate(session);

    // Request accurate context usage from CLI (if supported)
    this.requestContextUsage(session);

    // Check smart compact (must be after context broadcast, before idle timer)
    this.checkSmartCompact(session);

    // Start idle timer after session completes a result (goes idle)
    this.startIdleTimer(session);
  }

  /** Check cost budget and broadcast warnings at 80% and 100% thresholds. */
  private checkCostBudget(session: ActiveSession): void {
    const { cost_budget_usd, cost_warned, total_cost_usd } = session.state;
    if (!cost_budget_usd || cost_budget_usd <= 0) return;

    const pct = total_cost_usd / cost_budget_usd;

    if (pct >= 1.0 && cost_warned < 2) {
      // 100% — budget reached
      session.state = { ...session.state, cost_warned: 2 };
      // Existing cost_warning for Telegram bridge
      this.broadcastToAll(session, {
        type: "cost_warning",
        level: "critical",
        costUsd: total_cost_usd,
        budgetUsd: cost_budget_usd,
        message: `Cost budget reached: $${total_cost_usd.toFixed(2)} / $${cost_budget_usd.toFixed(2)}`,
      } as BrowserIncomingMessage);
      // Structured budget_exceeded event for web client
      this.broadcastToAll(session, {
        type: "budget_exceeded",
        budget: cost_budget_usd,
        spent: total_cost_usd,
      } as BrowserIncomingMessage);
      updateSessionCostWarned(session.id, 2);
    } else if (pct >= 0.8 && cost_warned < 1) {
      // 80% — first warning
      session.state = { ...session.state, cost_warned: 1 };
      // Existing cost_warning for Telegram bridge
      this.broadcastToAll(session, {
        type: "cost_warning",
        level: "warning",
        costUsd: total_cost_usd,
        budgetUsd: cost_budget_usd,
        message: `Approaching cost budget: $${total_cost_usd.toFixed(2)} / $${cost_budget_usd.toFixed(2)} (${Math.round(pct * 100)}%)`,
      } as BrowserIncomingMessage);
      // Structured budget_warning event for web client
      this.broadcastToAll(session, {
        type: "budget_warning",
        budget: cost_budget_usd,
        spent: total_cost_usd,
        percentage: 80,
      } as BrowserIncomingMessage);
      updateSessionCostWarned(session.id, 1);
    }
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

  private checkSmartCompact(session: ActiveSession): void {
    const prev = this.prevTokens.get(session.id) ?? { input: 0, output: 0 };
    checkCompact(this.compactBridge, session, prev);
  }

  /**
   * EarlyResults buffer — stores result messages that arrived before a subscriber
   * was ready to handle them. Entries are keyed by sessionId and expire after
   * EARLY_RESULT_TTL_MS to prevent stale state accumulation.
   */
  private earlyResults = new Map<string, EarlyResultEntry>();

  /** Clear compact handoff timers for a session (delegates to compact-manager) */
  private clearCompactTimers(sessionId: string): void {
    clearCompactTimers(sessionId);
  }

  private handleStreamEvent(session: ActiveSession, msg: CLIStreamEventMessage): void {
    // Pulse: track thinking block size for depth signal
    try {
      const event = msg.event as { delta?: { type?: string; thinking?: string } } | undefined;
      if (event?.delta?.type === "thinking_delta" && event.delta.thinking) {
        getOrCreatePulse(session.id).recordThinking(event.delta.thinking.length);
      }
    } catch { /* never block */ }

    this.broadcastToAll(session, {
      type: "stream_event",
      event: msg.event,
      parent_tool_use_id: msg.parent_tool_use_id,
    });
  }

  // Tools that are safe state transitions — auto-approve immediately
  private static readonly ALWAYS_APPROVE_TOOLS = new Set(["EnterPlanMode", "ExitPlanMode"]);

  // Tools that should NEVER be auto-approved
  private static readonly NEVER_AUTO_APPROVE_TOOLS = new Set(["AskUserQuestion"]);

  private handleControlRequest(session: ActiveSession, msg: CLIControlRequestMessage): void {
    const toolName = msg.request.tool_name ?? "";
    const subtype = msg.request.subtype;

    // Auto-approve safe state transition tools
    const shouldAutoApprove =
      WsBridge.ALWAYS_APPROVE_TOOLS.has(toolName) &&
      !(session.bypassDisabled && toolName === "ExitPlanMode");

    if (shouldAutoApprove) {
      log.info("Auto-approving safe tool", {
        tool: toolName,
        requestId: msg.request_id.slice(0, 8),
      });
      this.handlePermissionResponse(session, {
        request_id: msg.request_id,
        behavior: "allow",
      });
      return;
    }

    log.info("control_request received", {
      tool: toolName,
      subtype,
      requestId: msg.request_id.slice(0, 8),
    });

    const perm: PermissionRequest = {
      request_id: msg.request_id,
      tool_name: toolName || subtype || "unknown",
      input: msg.request.input ?? {},
      permission_suggestions: msg.request.permission_suggestions,
      description: msg.request.description,
      tool_use_id: msg.request.tool_use_id ?? "",
      timestamp: Date.now(),
    };

    session.pendingPermissions.set(msg.request_id, perm);

    // Pulse: mark session as blocked (waiting for human)
    try { getOrCreatePulse(session.id).setBlocked(true); } catch { /* */ }

    this.broadcastToAll(session, {
      type: "permission_request",
      request: perm,
    });

    // Start auto-approve timer
    this.startAutoApproveTimer(session, perm);
  }

  private handleToolProgress(session: ActiveSession, msg: CLIToolProgressMessage): void {
    this.broadcastToAll(session, {
      type: "tool_progress",
      tool_use_id: msg.tool_use_id,
      tool_name: msg.tool_name,
      elapsed_time_seconds: msg.elapsed_time_seconds,
    });
  }

  private handleCLIExit(session: ActiveSession, exitCode: number): void {
    const wasStarting = session.state.status === "starting";
    const hadTurns = session.state.num_turns > 0;
    const uptimeMs = Date.now() - session.state.started_at;
    const isEarlyExit = uptimeMs < 10_000 && !hadTurns;

    log.info("CLI process exited", {
      sessionId: session.id,
      exitCode,
      wasStarting,
      uptimeMs,
      hadTurns,
    });

    session.cliSend = null;
    this.cliProcesses.delete(session.id);
    this.sdkHandles.delete(session.id);
    this.clearIdleTimer(session.id);
    this.clearCompactTimers(session.id);
    this.idleDetector.stopTracking(session.id);
    this.prevTokens.delete(session.id);
    this.earlyResults.delete(session.id);

    // Reject any outstanding SDK permission resolvers for this session
    for (const [reqId] of session.pendingPermissions) {
      const resolver = this.permissionResolvers.get(reqId);
      if (resolver) {
        resolver({ behavior: "deny", message: "Session ended" });
        this.permissionResolvers.delete(reqId);
      }
    }

    const watcher = this.planWatchers.get(session.id);
    if (watcher) {
      watcher.stop();
      this.planWatchers.delete(session.id);
    }

    // Build a human-readable reason for the exit
    let reason: string | undefined;
    if (isEarlyExit && exitCode !== 0) {
      reason = `CLI crashed on startup (exit code ${exitCode}). Check that Claude Code is installed and authenticated.`;
    } else if (isEarlyExit && exitCode === 0) {
      reason =
        "CLI exited immediately — this may indicate a --print mode issue. Session can be retried.";
    } else if (exitCode !== 0) {
      reason = `CLI exited unexpectedly (exit code ${exitCode})`;
    }

    // Send stderr snippet if captured
    const stderrSnippet = session.lastStderrLines?.join("\n");
    if (stderrSnippet && reason) {
      reason = `${reason}\n${stderrSnippet}`;
    } else if (stderrSnippet) {
      reason = stderrSnippet;
    }

    this.broadcastToAll(session, {
      type: "cli_disconnected",
      exitCode,
      reason,
    } as BrowserIncomingMessage);

    // Use "error" status for early/unexpected exits so the UI can show diagnostics
    const finalStatus = isEarlyExit ? "error" : "ended";
    this.updateStatus(session, finalStatus);
    endSessionRecord(session.id, finalStatus);
    persistSession(session);
    disconnectAllSpectators(session.id, "Session ended");
    revokeAllForSession(session.id);

    // Emit session ended event
    eventBus.emit("session:ended", {
      sessionId: session.id,
      exitCode,
      reason,
    });

    // Auto-summarize only for sessions that actually ran
    if (hadTurns) {
      void summarizeSession(session.id);
    }

    // CodeGraph: incremental rescan if session modified files
    if (hadTurns) {
      const record = getSessionRecord(session.id);
      if (record?.projectSlug) {
        const modified = (record.filesModified as string[]) ?? [];
        const created = (record.filesCreated as string[]) ?? [];
        const changed = [...modified, ...created];
        if (changed.length > 0) {
          import("../codegraph/diff-updater.js")
            .then(({ incrementalRescan }) => {
              void incrementalRescan(record.projectSlug!, changed)
                .then((result) => {
                  log.info("CodeGraph incremental rescan", {
                    projectSlug: record.projectSlug,
                    ...result,
                  });
                })
                .catch((err) => {
                  log.warn("CodeGraph rescan failed", { error: String(err) });
                });
            })
            .catch(() => {
              /* codegraph module not available */
            });
        }
      }
    }

    // Schedule removal from in-memory map after 5 minutes (allows browser reconnect/replay)
    this.scheduleCleanup(session.id);
  }

  // ── Browser message routing ─────────────────────────────────────────────

  private routeBrowserMessage(session: ActiveSession, msg: BrowserOutgoingMessage): void {
    switch (msg.type) {
      case "user_message":
        this.handleUserMessage(session, msg.content, "web");
        break;
      case "permission_response":
        this.handlePermissionResponse(session, msg);
        break;
      case "interrupt":
        this.handleInterrupt(session);
        break;
      case "set_model":
        this.handleSetModel(session, msg.model);
        break;
      case "set_auto_approve":
        session.autoApproveConfig = msg.config;
        log.info("Auto-approve config updated", {
          enabled: msg.config.enabled,
          timeoutSeconds: msg.config.timeoutSeconds,
        });
        break;
      case "set_thinking_mode":
        session.state = { ...session.state, thinking_mode: msg.mode };
        log.info("Thinking mode updated", { sessionId: session.state.session_id, mode: msg.mode });
        this.broadcastToSubscribers(session, {
          type: "session_update",
          session: { thinking_mode: msg.mode },
        });
        break;
    }
  }

  private handleUserMessage(session: ActiveSession, content: string, source?: string): void {
    // ── Budget gate: block message if budget is exceeded ─────────────────
    const { cost_budget_usd, total_cost_usd } = session.state;
    if (cost_budget_usd && cost_budget_usd > 0 && total_cost_usd >= cost_budget_usd) {
      this.broadcastToAll(session, {
        type: "budget_exceeded",
        budget: cost_budget_usd,
        spent: total_cost_usd,
      } as BrowserIncomingMessage);
      log.warn("Message blocked — budget exceeded", {
        sessionId: session.id,
        budget: cost_budget_usd,
        spent: total_cost_usd,
      });
      return;
    }

    // ── WebIntel: /docs command — fetch web docs and inject into message ──
    const docsMatch = content.match(/^\/docs\s+(https?:\/\/\S+)(\s+--refresh)?/i);
    if (docsMatch) {
      const url = docsMatch[1]!;
      const refresh = !!docsMatch[2];
      this.handleDocsCommand(session, content, url, refresh, source);
      return;
    }

    // ── WebIntel: /research command — multi-page web research ──
    const researchMatch = content.match(/^\/research\s+(.+)/i);
    if (researchMatch) {
      const query = researchMatch[1]!.trim();
      this.handleResearchCommand(session, query, source);
      return;
    }

    // ── WebIntel: /crawl command — site crawl ──
    const crawlMatch = content.match(
      /^\/crawl\s+(https?:\/\/\S+)(?:\s+--depth\s+(\d+))?(?:\s+--max\s+(\d+))?/i,
    );
    if (crawlMatch) {
      const url = crawlMatch[1]!;
      const depth = Math.min(crawlMatch[2] ? parseInt(crawlMatch[2], 10) : 2, 5);
      const maxPages = Math.min(crawlMatch[3] ? parseInt(crawlMatch[3], 10) : 50, 200);
      this.handleCrawlCommand(session, url, depth, maxPages, source);
      return;
    }

    // Delegate to shared internal handler
    this.handleUserMessageInternal(session, content, source);
  }

  /** Bridge interface for web-intel-handler.ts */
  private get webIntelBridge(): WebIntelBridge {
    return {
      broadcastToAll: this.broadcastToAll.bind(this),
      handleUserMessageInternal: this.handleUserMessageInternal.bind(this),
      emitContextInjection: this.emitContextInjection.bind(this),
    };
  }

  private handleDocsCommand(
    session: ActiveSession,
    originalContent: string,
    url: string,
    refresh: boolean,
    source?: string,
  ): void {
    handleDocsCmd(this.webIntelBridge, session, originalContent, url, refresh, source);
  }

  private handleResearchCommand(session: ActiveSession, query: string, source?: string): void {
    handleResearchCmd(this.webIntelBridge, session, query, source);
  }

  private handleCrawlCommand(
    session: ActiveSession,
    url: string,
    depth: number,
    maxPages: number,
    source?: string,
  ): void {
    handleCrawlCmd(this.webIntelBridge, session, url, depth, maxPages, source);
  }

  private handleUserMessageInternal(
    session: ActiveSession,
    content: string,
    source?: string,
  ): void {
    // Reset idle timer whenever user sends a message
    this.clearIdleTimer(session.id);

    // ── PromptScanner: scan for risky patterns before recording/forwarding ──
    if (isScanEnabled()) {
      const scanResult = scanPrompt(content);
      if (scanResult.risks.length > 0) {
        this.broadcastToAll(session, {
          type: "prompt_scan" as const,
          risks: scanResult.risks.map((r) => ({
            category: r.category,
            severity: r.severity,
            description: r.description,
            matched: r.matched,
          })),
          blocked: !scanResult.safe,
        });
        if (!scanResult.safe) {
          log.warn("Prompt blocked by scanner", {
            sessionId: session.id,
            categories: [...new Set(scanResult.risks.map((r) => r.category))],
            maxSeverity: scanResult.maxSeverity,
          });
          return;
        }
      }
    }

    // Record in history
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content,
      timestamp: Date.now(),
      source: source ?? "web",
    };
    pushMessageHistory(session, historyMsg);

    // Broadcast to browsers
    this.broadcastToAll(session, historyMsg);

    // Store in DB
    storeMessage({
      id: randomUUID(),
      sessionId: session.id,
      role: "user",
      content,
      source: (source ?? "web") as "telegram" | "web" | "api" | "agent" | "system",
    });

    // Auto-generate session name from first user message
    if (!session.state.name && !session.nameGenerated) {
      session.nameGenerated = true;
      void generateSessionName(content).then((name) => {
        session.state = { ...session.state, name };
        persistSession(session);
        this.broadcastToSubscribers(session, {
          type: "session_update",
          session: { name },
        });
      });
    }

    // Route @mentions to target sessions
    if (session.state.short_id && source !== "mention" && source !== "debate") {
      handleMentions(content, session.id, session.state.short_id, (targetId, msg) =>
        this.sendUserMessage(targetId, msg, "mention"),
      );
    }

    // ── CodeGraph: prepend pending hint from plan-review or break-check ──
    let cgContent = content;
    if (session.pendingCodeGraphHint) {
      cgContent = `${session.pendingCodeGraphHint}\n\n${cgContent}`;
      session.pendingCodeGraphHint = undefined;
    }

    // ── CodeGraph: inject relevant code context (sync, <200ms, respects config) ──
    const record = getSessionRecord(session.id);
    const cgSlug = record?.projectSlug;
    const cgMsgConfig = cgSlug ? getCodeGraphConfig(cgSlug) : null;
    if (
      cgSlug &&
      isGraphReady(cgSlug) &&
      cgMsgConfig?.injectionEnabled &&
      cgMsgConfig.messageContextEnabled
    ) {
      try {
        const ctx = buildMessageContext(cgSlug, content);
        if (ctx) {
          cgContent = `${cgContent}${ctx}`;
          this.emitContextInjection(
            session,
            "message_context",
            `Code context for message`,
            ctx.length,
          );
        }
      } catch {
        /* skip */
      }
    }

    // ── CodeGraph: activity feed injection (agent self-awareness) ──
    if (
      cgSlug &&
      cgMsgConfig?.injectionEnabled &&
      cgMsgConfig.activityFeedEnabled
    ) {
      try {
        const contextPercent = session.state.total_input_tokens && session.state.total_output_tokens
          ? 0 // We don't have exact context %, use 0 to let buildActivityContext decide
          : 0;
        const activityCtx = buildActivityContext(
          session.id,
          cgSlug,
          session.state.num_turns,
          contextPercent,
        );
        if (activityCtx) {
          cgContent = `${cgContent}${activityCtx}`;
          this.emitContextInjection(
            session,
            "activity_feed",
            `Activity feed: agent footprint`,
            activityCtx.length,
          );
        }
      } catch {
        /* skip */
      }
    }

    // ── WebIntel: auto-inject library docs (async, best-effort, respects config) ────────
    // Try to enrich with docs before sending to CLI/SDK (timeout 3s)
    const webDocsDisabled =
      cgMsgConfig && (!cgMsgConfig.injectionEnabled || !cgMsgConfig.webDocsEnabled);
    const lockOwner = `${source ?? "web"}-${Date.now()}`;

    const sendWithLock = async (content: string) => {
      if (!getActiveSession(session.id)) return;
      try {
        await terminalLock.acquire(session.id, lockOwner);
      } catch (err) {
        log.warn("Lock acquire timeout — sending without lock", {
          sessionId: session.id,
          err: String(err),
        });
      }
      try {
        this.sendToEngine(session, content);
      } finally {
        terminalLock.release(session.id, lockOwner);
        this.broadcastLockStatus(session);
      }
    };

    if (webDocsDisabled) {
      sendWithLock(cgContent);
    } else {
      this.maybeEnrichWithDocs(session, cgContent)
        .then((enrichedContent) => sendWithLock(enrichedContent))
        .catch(() => sendWithLock(cgContent));
    }

    this.updateStatus(session, "busy");
  }

  private async maybeEnrichWithDocs(session: ActiveSession, content: string): Promise<string> {
    return enrichWithDocs(this.webIntelBridge, session, content);
  }

  /**
   * Send content to the active engine (SDK or CLI).
   */
  private sendToEngine(session: ActiveSession, content: string): void {
    // SDK engine path
    const existingSdkHandle = this.sdkHandles.get(session.id);
    if (existingSdkHandle || USE_SDK_ENGINE) {
      if (existingSdkHandle?.isRunning()) {
        existingSdkHandle.abort();
      }
      this.sdkHandles.delete(session.id);

      if (session.cliSessionId) {
        this.startSessionWithSdk(session.id, session, {
          cwd: session.state.cwd || ".",
          model: session.state.model || "claude-sonnet-4-6",
          permissionMode: session.state.permissionMode,
          prompt: content,
          resume: true,
          cliSessionId: session.cliSessionId,
        });
      } else {
        this.startSessionWithSdk(session.id, session, {
          cwd: session.state.cwd || ".",
          model: session.state.model || "claude-sonnet-4-6",
          permissionMode: session.state.permissionMode,
          prompt: content,
        });
      }
      return;
    }

    // CLI engine path
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    this.sendToCLI(session, ndjson);
  }

  private handlePermissionResponse(
    session: ActiveSession,
    msg: {
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: unknown[];
    },
  ): void {
    // Clear auto-approve timer
    const timer = session.autoApproveTimers.get(msg.request_id);
    if (timer) {
      clearTimeout(timer);
      session.autoApproveTimers.delete(msg.request_id);
    }

    session.pendingPermissions.delete(msg.request_id);

    // Pulse: unblock if no more pending permissions
    if (session.pendingPermissions.size === 0) {
      try { getOrCreatePulse(session.id).setBlocked(false); } catch { /* */ }
    }

    // SDK engine path: resolve the permission Promise
    const resolver = this.permissionResolvers.get(msg.request_id);
    if (resolver) {
      resolver({
        behavior: msg.behavior,
        ...(msg.updated_permissions ? { updatedPermissions: msg.updated_permissions } : {}),
      });
      this.permissionResolvers.delete(msg.request_id);
    } else if (session.cliSend) {
      // CLI engine path: send NDJSON response to stdin (only if CLI is connected)
      let ndjson: string;
      if (msg.behavior === "allow") {
        ndjson = JSON.stringify({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: msg.request_id,
            response: {
              behavior: "allow",
              updatedInput: {},
              ...(msg.updated_permissions ? { updatedPermissions: msg.updated_permissions } : {}),
            },
          },
        });
      } else {
        ndjson = JSON.stringify({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: msg.request_id,
            response: {
              behavior: "deny",
              message: "Denied by user",
            },
          },
        });
      }

      this.sendToCLI(session, ndjson);
    } else {
      // Stale response — no resolver and no CLI stdin; discard silently
      log.debug("Permission response has no target (stale?)", {
        sessionId: session.id,
        requestId: msg.request_id,
      });
    }

    // Notify browsers the permission was handled
    this.broadcastToAll(session, {
      type: "permission_cancelled",
      request_id: msg.request_id,
    });
  }

  private handleInterrupt(session: ActiveSession): void {
    // SDK engine path: use query.interrupt()
    const sdkHandle = this.sdkHandles.get(session.id);
    if (sdkHandle) {
      try {
        sdkHandle.query.interrupt();
      } catch (err) {
        log.warn("Failed to interrupt SDK session", {
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    // CLI engine path: send NDJSON interrupt
    const ndjson = JSON.stringify({
      type: "control_request",
      request: { subtype: "interrupt" },
    });
    this.sendToCLI(session, ndjson);
  }

  private static readonly MODEL_MAP: Record<string, string> = {
    sonnet: "claude-sonnet-4-6",
    opus: "claude-opus-4-6",
    haiku: "claude-haiku-4-5",
  };

  private handleSetModel(session: ActiveSession, model: string): void {
    const cliModel = WsBridge.MODEL_MAP[model] ?? model;

    // SDK path: use typed setModel() API
    const sdkHandle = this.sdkHandles.get(session.id);
    if (sdkHandle) {
      sdkHandle.query.setModel(cliModel).catch((err) => {
        log.warn("SDK setModel failed", { sessionId: session.id, error: String(err) });
      });
    } else {
      // CLI path: send NDJSON to stdin
      const ndjson = JSON.stringify({
        type: "control_request",
        request: { subtype: "set_model", model: cliModel },
      });
      this.sendToCLI(session, ndjson);
    }

    session.state = { ...session.state, model };

    this.broadcastToAll(session, {
      type: "session_update",
      session: { model },
    });
  }

  // ── Idle timer (auto-kill non-Telegram sessions after inactivity) ───────

  private startIdleTimer(session: ActiveSession): void {
    // Only apply to api/web sessions — Telegram has its own idle handling
    const source = (session.state as unknown as { source?: string }).source;
    if (source === "telegram") return;

    // Check per-session settings
    const settings = this.sessionSettings.get(session.id) ?? DEFAULT_SESSION_SETTINGS;
    if (settings.keepAlive) return;
    if (settings.idleTimeoutMs === 0) return;

    this.clearIdleTimer(session.id);

    const timeoutMs = settings.idleTimeoutMs;
    const timer = setTimeout(() => {
      this.idleTimers.delete(session.id);
      // Only kill if session is still idle (not busy or already ended)
      const current = getActiveSession(session.id);
      if (!current || current.state.status === "ended" || current.state.status === "error") return;
      if (current.state.status === "busy" || current.state.status === "compacting") return;

      log.warn("Session idle timeout, auto-stopping", { sessionId: session.id, timeoutMs });
      this.killSession(session.id);
    }, timeoutMs);

    this.idleTimers.set(session.id, timer);
  }

  private clearIdleTimer(sessionId: string): void {
    const existing = this.idleTimers.get(sessionId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.idleTimers.delete(sessionId);
    }
  }

  // ── Auto-approve timer ──────────────────────────────────────────────────

  private startAutoApproveTimer(session: ActiveSession, perm: PermissionRequest): void {
    const config = session.autoApproveConfig;
    if (!config.enabled || config.timeoutSeconds <= 0) return;

    // Never auto-approve tools requiring user decision
    if (WsBridge.NEVER_AUTO_APPROVE_TOOLS.has(perm.tool_name)) return;

    // Skip Bash if allowBash is false
    if (perm.tool_name === "Bash" && !config.allowBash) return;

    const timer = setTimeout(() => {
      session.autoApproveTimers.delete(perm.request_id);
      if (!session.pendingPermissions.has(perm.request_id)) return;

      log.info("Auto-approving after timeout", {
        tool: perm.tool_name,
        timeoutSeconds: config.timeoutSeconds,
      });

      this.handlePermissionResponse(session, {
        request_id: perm.request_id,
        behavior: "allow",
      });
    }, config.timeoutSeconds * 1000);

    session.autoApproveTimers.set(perm.request_id, timer);
  }

  // ── Lock status broadcast ──────────────────────────────────────────────

  private broadcastLockStatus(session: ActiveSession): void {
    const lockInfo = terminalLock.getLockInfo(session.id);
    const msg: BrowserIncomingMessage = {
      type: "lock_status",
      locked: !!lockInfo,
      owner: lockInfo?.owner ?? null,
      queueSize: lockInfo?.queueSize ?? 0,
    };
    this.broadcastToAll(session, msg);
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

  private broadcastToAll(session: ActiveSession, msg: BrowserIncomingMessage): void {
    const payload = JSON.stringify(msg);

    // Send to browser WebSockets
    for (const ws of session.browserSockets) {
      try {
        ws.send(payload);
      } catch {
        session.browserSockets.delete(ws);
      }
    }

    // Send to subscribers (Telegram, etc.)
    this.broadcastToSubscribers(session, msg);

    // Fan-out to spectators (QR Stream Sharing)
    broadcastToSpectators(session.id, msg);
  }

  private broadcastToSubscribers(session: ActiveSession, msg: unknown): void {
    for (const [id, callback] of session.subscribers) {
      try {
        callback(msg);
      } catch (err) {
        log.error("Subscriber callback error", { subscriber: id, err: String(err) });
      }
    }
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

    const timestamp = event.timestamp ?? Date.now();

    // Broadcast hook event to all subscribers (browser, Telegram)
    this.broadcastToAll(session, {
      type: "hook_event",
      hookType: event.type,
      toolName: event.tool_name,
      toolInput: event.tool_input,
      toolOutput: event.tool_output,
      toolError: event.tool_error,
      message: event.message,
      timestamp,
    });

    log.debug("Hook event received", {
      sessionId,
      type: event.type,
      tool: event.tool_name,
    });

    // PreToolUse: default allow (extensible — custom rules can be added here)
    if (event.type === "PreToolUse") {
      return { found: true, decision: { decision: "allow" } };
    }

    return { found: true };
  }
}
