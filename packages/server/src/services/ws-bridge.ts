/**
 * WsBridge — Core message router between CLI, Browser, and Telegram.
 * Handles session lifecycle, permissions, auto-approve, and subscriber system.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import { launchCLI, createPlanModeWatcher } from "./cli-launcher.js";
import { startSdkSession, type SdkSessionHandle } from "./sdk-engine.js";
import { summarizeSession, buildSummaryInjection } from "./session-summarizer.js";
import { buildSessionContext } from "./session-context.js";
import { handleMentions } from "./mention-router.js";
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
} from "@companion/shared";
import { SESSION_IDLE_TIMEOUT_MS, HEALTH_CHECK_INTERVAL_MS, getMaxContextTokens } from "@companion/shared";
import type { LaunchResult } from "./cli-launcher.js";

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
    (result: { behavior: "allow" | "deny"; message?: string; updatedPermissions?: unknown[] }) => void
  >();
  private planWatchers = new Map<string, ReturnType<typeof createPlanModeWatcher>>();
  private onStatusChange?: StatusChangeCallback;
  /** Idle timers keyed by session ID — only for non-Telegram sessions */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-session timeout/keep-alive settings */
  private sessionSettings = new Map<string, SessionSettings>();
  /** Process liveness check interval handle */
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { onStatusChange?: StatusChangeCallback }) {
    this.onStatusChange = opts?.onStatusChange;
    this.startHealthCheck();
  }

  /** Stop the health check interval (call on server shutdown) */
  stopHealthCheck(): void {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
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
    return cleanupZombieSessions(
      (id) => this.cliProcesses.has(id) || this.sdkHandles.has(id),
    );
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
    /** Optional identity/personality prompt re-injected after context compaction. */
    identityPrompt?: string;
    /** When false, disables auto re-injection on compact for this session (default: true). */
    autoReinjectOnCompact?: boolean;
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
    };

    // Create in-memory session
    const session = createActiveSession(sessionId, initialState);

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
      fullPrompt = `${fullPrompt}${summaryContext ?? ""}${sessionContext}`;
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
                  updatedPermissions: response.updatedPermissions as import("@anthropic-ai/claude-agent-sdk").PermissionUpdate[] | undefined,
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
                permission_suggestions: permOpts.suggestions as PermissionRequest["permission_suggestions"],
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

    // Launch CLI process
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
      const fullPrompt = `${opts.prompt}${summaryContext ?? ""}${sessionContext}`;

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

    if (session) {
      this.updateStatus(session, "ended");
      persistSession(session);
      removeActiveSession(sessionId);
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

  subscribe(
    sessionId: string,
    subscriberId: string,
    callback: (msg: unknown) => void,
  ): () => void {
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
    ws.send(JSON.stringify({
      type: "session_init",
      session: session.state,
    } satisfies BrowserIncomingMessage));

    if (session.messageHistory.length > 0) {
      ws.send(JSON.stringify({
        type: "message_history",
        messages: session.messageHistory as BrowserIncomingMessage[],
      } satisfies BrowserIncomingMessage));
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
      ws.send(JSON.stringify({
        type: "cli_disconnected",
        reason: "CLI process not connected",
      }));
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
    let msg: CLIMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      log.debug("Non-JSON CLI output", { line: line.slice(0, 100) });
      return;
    }

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

  private handleSystemInit(
    session: ActiveSession,
    msg: CLISystemInitMessage,
  ): void {
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
    const identityPart = session.identityPrompt
      ? ` ${session.identityPrompt}`
      : "";

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

  private handleAssistant(
    session: ActiveSession,
    msg: CLIAssistantMessage,
  ): void {
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
      }
    }

    const browserMsg: BrowserIncomingMessage = {
      type: "assistant",
      message: msg.message,
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
        storeMessage({
          id: msg.message.id ?? randomUUID(),
          sessionId: session.id,
          role: "assistant",
          content: textContent,
          source: "api",
        });
      }
    }
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

    this.broadcastToAll(session, {
      type: "context_update",
      contextUsedPercent,
      totalTokens,
      maxTokens,
    });
  }

  private handleResult(
    session: ActiveSession,
    msg: CLIResultMessage,
  ): void {
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
      cache_read_tokens:
        msg.usage?.cache_read_input_tokens ?? session.state.cache_read_tokens,
    };

    const browserMsg: BrowserIncomingMessage = {
      type: "result",
      data: msg,
    };

    pushMessageHistory(session, browserMsg);

    // Buffer result for subscribers that may not yet be registered (race window fix).
    // If no subscribers or browser sockets are connected, stash with TTL so late
    // arrivals can replay it when they subscribe.
    const hasActiveReceivers =
      session.browserSockets.size > 0 || session.subscribers.size > 0;
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

    this.updateStatus(session, "idle");
    persistSession(session);

    // Check cost budget warnings
    this.checkCostBudget(session);

    // Broadcast context usage after updating token counts
    this.broadcastContextUpdate(session);

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
  private checkSmartCompact(session: ActiveSession): void {
    const { compact_mode, compact_threshold } = session.state;
    if (compact_mode === "manual") return;

    // Use per-turn context estimate (same formula as broadcastContextUpdate)
    const prev = this.prevTokens.get(session.id) ?? { input: 0, output: 0 };
    const lastTurnInput = session.state.total_input_tokens - prev.input;
    const lastTurnOutput = session.state.total_output_tokens - prev.output;
    const contextTokens = lastTurnInput + lastTurnOutput;
    const maxTokens = WsBridge.getMaxContextTokens(session.state.model);
    const contextPct = (contextTokens / maxTokens) * 100;

    if (contextPct < compact_threshold) {
      session.compactPending = false;
      return;
    }

    // Already pending or already compacting
    if (session.compactPending || session.state.status === "compacting") return;

    if (compact_mode === "aggressive") {
      // Guard against double-compact
      session.compactPending = true;
      log.info("Aggressive compact triggered", { session: session.id, contextPct: Math.round(contextPct) });
      this.sendCompactCommand(session);
      return;
    }

    // Smart mode: session just went idle in handleResult → trigger handoff now
    if (session.state.status === "idle") {
      session.compactPending = true;
      log.info("Smart compact handoff triggered at idle", { session: session.id, contextPct: Math.round(contextPct) });
      this.triggerSmartCompactHandoff(session);
    }
  }

  /**
   * Smart compact handoff flow:
   * 1. Ask Claude to summarize current progress
   * 2. Wait for response (it will come through handleResult)
   * 3. Save snapshot to session state
   * 4. Send /compact
   * 5. After compact, inject handoff context
   */
  private triggerSmartCompactHandoff(session: ActiveSession): void {
    // Notify subscribers
    this.broadcastToAll(session, {
      type: "compact_handoff",
      stage: "summarizing",
      message: "Smart compact: asking Claude to summarize before compacting...",
    } as BrowserIncomingMessage);

    // Send handoff request to Claude
    const handoffPrompt = [
      "Before context compaction, briefly summarize in 3-5 sentences:",
      "1. What you just completed",
      "2. What tasks remain (if any)",
      "3. Your planned next step",
      "Keep it concise — this will be injected after compaction to restore context.",
    ].join("\n");

    this.sendToCLI(session, JSON.stringify({
      type: "user",
      content: `[SYSTEM: Context at ${session.state.compact_threshold}% — auto-compact handoff]\n\n${handoffPrompt}`,
    }));

    // The response will come through normal handleResult flow.
    // We detect completion by watching for the next idle transition
    // after compactPending=true. At that point, send /compact.
    // For now, we mark a delayed compact trigger.
    this.schedulePostHandoffCompact(session);
  }

  /** Compact handoff timers keyed by session ID — cleared on session removal */
  private compactTimers = new Map<string, { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> }>();

  /**
   * EarlyResults buffer — stores result messages that arrived before a subscriber
   * was ready to handle them. Entries are keyed by sessionId and expire after
   * EARLY_RESULT_TTL_MS to prevent stale state accumulation.
   */
  private earlyResults = new Map<string, EarlyResultEntry>();

  /** After handoff summary is received, trigger the actual /compact. */
  private schedulePostHandoffCompact(session: ActiveSession): void {
    // Clear any existing timers for this session
    this.clearCompactTimers(session.id);

    // Track whether we've seen a busy→idle transition (not the initial idle)
    let seenBusy = false;

    // Wait for Claude to respond (poll status transitions)
    const checkInterval = setInterval(() => {
      // Session ended or compact cancelled
      if (!session.compactPending || session.state.status === "ended" || session.state.status === "error") {
        this.clearCompactTimers(session.id);
        session.compactPending = false;
        return;
      }

      // Track busy state — handoff prompt should make Claude go busy
      if (session.state.status === "busy") {
        seenBusy = true;
      }

      // Session went idle again AFTER being busy = Claude finished the handoff summary
      if (seenBusy && session.state.status === "idle") {
        this.clearCompactTimers(session.id);

        this.broadcastToAll(session, {
          type: "compact_handoff",
          stage: "compacting",
          message: "Handoff summary received. Running /compact...",
        } as BrowserIncomingMessage);

        log.info("Post-handoff compact executing", { session: session.id });
        this.sendCompactCommand(session);
      }
    }, 2000);

    // Safety timeout: cancel after 60s if Claude never responds
    const safetyTimeout = setTimeout(() => {
      this.clearCompactTimers(session.id);
      if (session.compactPending) {
        log.warn("Smart compact handoff timed out", { session: session.id });
        session.compactPending = false;
      }
    }, 60_000);

    this.compactTimers.set(session.id, { interval: checkInterval, timeout: safetyTimeout });
  }

  /** Clear compact handoff timers for a session */
  private clearCompactTimers(sessionId: string): void {
    const timers = this.compactTimers.get(sessionId);
    if (timers) {
      clearInterval(timers.interval);
      clearTimeout(timers.timeout);
      this.compactTimers.delete(sessionId);
    }
  }

  /** Send /compact slash command to CLI. */
  private sendCompactCommand(session: ActiveSession): void {
    this.sendToCLI(session, JSON.stringify({
      type: "user",
      content: "/compact",
    }));
  }

  private handleStreamEvent(
    session: ActiveSession,
    msg: CLIStreamEventMessage,
  ): void {
    this.broadcastToAll(session, {
      type: "stream_event",
      event: msg.event,
      parent_tool_use_id: msg.parent_tool_use_id,
    });
  }

  // Tools that are safe state transitions — auto-approve immediately
  private static readonly ALWAYS_APPROVE_TOOLS = new Set([
    "EnterPlanMode",
    "ExitPlanMode",
  ]);

  // Tools that should NEVER be auto-approved
  private static readonly NEVER_AUTO_APPROVE_TOOLS = new Set([
    "AskUserQuestion",
  ]);

  private handleControlRequest(
    session: ActiveSession,
    msg: CLIControlRequestMessage,
  ): void {
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

    this.broadcastToAll(session, {
      type: "permission_request",
      request: perm,
    });

    // Start auto-approve timer
    this.startAutoApproveTimer(session, perm);
  }

  private handleToolProgress(
    session: ActiveSession,
    msg: CLIToolProgressMessage,
  ): void {
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

    log.info("CLI process exited", { sessionId: session.id, exitCode, wasStarting, uptimeMs, hadTurns });

    session.cliSend = null;
    this.cliProcesses.delete(session.id);
    this.sdkHandles.delete(session.id);
    this.clearIdleTimer(session.id);
    this.clearCompactTimers(session.id);
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
      reason = "CLI exited immediately — this may indicate a --print mode issue. Session can be retried.";
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

    // Auto-summarize only for sessions that actually ran
    if (hadTurns) {
      void summarizeSession(session.id);
    }

    // Schedule removal from in-memory map after 5 minutes (allows browser reconnect/replay)
    setTimeout(() => {
      const s = getActiveSession(session.id);
      if (s && (s.state.status === "ended" || s.state.status === "error")) {
        removeActiveSession(session.id);
        log.debug("Removed ended session from memory", { sessionId: session.id });
      }
    }, 5 * 60 * 1000);
  }

  // ── Browser message routing ─────────────────────────────────────────────

  private routeBrowserMessage(
    session: ActiveSession,
    msg: BrowserOutgoingMessage,
  ): void {
    switch (msg.type) {
      case "user_message":
        this.handleUserMessage(session, msg.content);
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
    }
  }

  private handleUserMessage(
    session: ActiveSession,
    content: string,
    source?: string,
  ): void {
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

    // Reset idle timer whenever user sends a message
    this.clearIdleTimer(session.id);

    // Record in history
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content,
      timestamp: Date.now(),
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
      source: (source as "telegram" | "web" | "api" | "agent" | "system") ?? "api",
    });

    // Route @mentions to target sessions — skip if source is "mention" or "debate" to prevent loops
    if (session.state.short_id && source !== "mention" && source !== "debate") {
      handleMentions(
        content,
        session.id,
        session.state.short_id,
        (targetId, msg) => this.sendUserMessage(targetId, msg, "mention"),
      );
    }

    // SDK engine path: start a new query with resume to continue the conversation
    const existingSdkHandle = this.sdkHandles.get(session.id);
    if (existingSdkHandle || USE_SDK_ENGINE) {
      // If SDK is still running from previous turn, abort and wait for cleanup
      if (existingSdkHandle?.isRunning()) {
        existingSdkHandle.abort();
      }
      // Always clear stale handle before starting new one (prevents duplicate loops)
      this.sdkHandles.delete(session.id);

      // Resume the conversation with the new user message
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
        log.warn("No cliSessionId for SDK resume — starting fresh session", {
          sessionId: session.id,
        });
        this.startSessionWithSdk(session.id, session, {
          cwd: session.state.cwd || ".",
          model: session.state.model || "claude-sonnet-4-6",
          permissionMode: session.state.permissionMode,
          prompt: content,
        });
      }

      this.updateStatus(session, "busy");
      return;
    }

    // CLI engine path: send NDJSON to stdin
    const ndjson = JSON.stringify({
      type: "user",
      message: { role: "user", content },
    });
    this.sendToCLI(session, ndjson);
    this.updateStatus(session, "busy");
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

    // SDK engine path: resolve the permission Promise
    const resolver = this.permissionResolvers.get(msg.request_id);
    if (resolver) {
      resolver({
        behavior: msg.behavior,
        ...(msg.updated_permissions
          ? { updatedPermissions: msg.updated_permissions }
          : {}),
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
              ...(msg.updated_permissions
                ? { updatedPermissions: msg.updated_permissions }
                : {}),
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
    const ndjson = JSON.stringify({
      type: "control_request",
      request: { subtype: "set_model", model: cliModel },
    });
    this.sendToCLI(session, ndjson);
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

  private startAutoApproveTimer(
    session: ActiveSession,
    perm: PermissionRequest,
  ): void {
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

  private broadcastToAll(
    session: ActiveSession,
    msg: BrowserIncomingMessage,
  ): void {
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
  }

  private broadcastToSubscribers(
    session: ActiveSession,
    msg: unknown,
  ): void {
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
    session.state = { ...session.state, status };

    this.broadcastToAll(session, {
      type: "status_change",
      status,
    });

    this.onStatusChange?.(session.id, status);
  }
}
