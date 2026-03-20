/**
 * WsBridge — Core message router between CLI, Browser, and Telegram.
 * Handles session lifecycle, permissions, auto-approve, and subscriber system.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import { launchCLI, createPlanModeWatcher } from "./cli-launcher.js";
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
  AutoApproveConfig,
} from "@companion/shared";
import { SESSION_IDLE_TIMEOUT_MS, HEALTH_CHECK_INTERVAL_MS } from "@companion/shared";
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
}

const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
  keepAlive: false,
};

export class WsBridge {
  private cliProcesses = new Map<string, LaunchResult>();
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
    return cleanupZombieSessions((id) => this.cliProcesses.has(id));
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
    };

    // Create in-memory session
    const session = createActiveSession(sessionId, initialState);

    // Persist to DB
    createSessionRecord({
      id: sessionId,
      projectSlug: opts.projectSlug,
      model: opts.model,
      cwd: opts.cwd,
      permissionMode: opts.permissionMode,
      source: opts.source ?? "api",
      parentId: opts.parentId,
      channelId: opts.channelId,
    });

    // If resuming, clear cliSessionId from old session so it's no longer listed as resumable
    if (opts.resume && opts.cliSessionId) {
      clearCliSessionId(opts.cliSessionId);
    }

    // Create plan mode watcher
    const planWatcher = createPlanModeWatcher(
      (ndjson) => this.sendToCLI(session, ndjson),
      (action) => {
        log.warn("Plan mode stuck escalation", { sessionId, action });
        if (action === "kill") {
          this.killSession(sessionId);
        }
        // Notify subscribers about stuck plan mode
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
      (exitCode) => this.handleCLIExit(session, exitCode),
    );

    session.cliSend = launch.send;
    session.pid = launch.pid;
    this.cliProcesses.set(sessionId, launch);

    // Flush pending messages
    for (const pending of session.pendingMessages) {
      launch.send(pending);
    }
    session.pendingMessages = [];

    // Send initial prompt via stdin NDJSON (interactive mode, not --prompt flag)
    if (opts.prompt && !opts.resume) {
      const ndjson = JSON.stringify({
        type: "user",
        message: { role: "user", content: opts.prompt },
      });
      // Small delay to let CLI initialize before sending
      setTimeout(() => {
        this.sendToCLI(session, ndjson);
      }, 1000);
    }

    log.info("Session started", { sessionId, cwd: opts.cwd, model: opts.model });
    return sessionId;
  }

  killSession(sessionId: string): void {
    this.clearIdleTimer(sessionId);
    this.sessionSettings.delete(sessionId);

    const launch = this.cliProcesses.get(sessionId);
    if (launch) {
      launch.kill();
      this.cliProcesses.delete(sessionId);
    }

    const watcher = this.planWatchers.get(sessionId);
    if (watcher) {
      watcher.stop();
      this.planWatchers.delete(sessionId);
    }

    const session = getActiveSession(sessionId);
    if (session) {
      this.updateStatus(session, "ended");
      persistSession(session);
      removeActiveSession(sessionId);
    }

    // Always update DB regardless of in-memory state
    endSessionRecord(sessionId);
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

    // Notify CLI status
    ws.send(JSON.stringify({
      type: session.cliSend ? "cli_connected" : "cli_disconnected",
    }));
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
    }
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

    session.messageHistory.push(browserMsg);
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

  /** Max context tokens by model name */
  private static getMaxContextTokens(model: string): number {
    if (model.includes("haiku")) return 200_000;
    // opus + sonnet both have 1M context
    return 1_000_000;
  }

  /** Broadcast context_update event with current token usage */
  private broadcastContextUpdate(session: ActiveSession): void {
    const state = session.state;
    const totalTokens =
      state.total_input_tokens +
      state.total_output_tokens +
      state.cache_read_tokens;
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

    session.messageHistory.push(browserMsg);
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

    // Broadcast context usage after updating token counts
    this.broadcastContextUpdate(session);

    // Start idle timer after session completes a result (goes idle)
    this.startIdleTimer(session);
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
    log.info("CLI process exited", { sessionId: session.id, exitCode });

    session.cliSend = null;
    this.cliProcesses.delete(session.id);
    this.clearIdleTimer(session.id);

    const watcher = this.planWatchers.get(session.id);
    if (watcher) {
      watcher.stop();
      this.planWatchers.delete(session.id);
    }

    this.broadcastToAll(session, { type: "cli_disconnected" });
    this.updateStatus(session, "ended");
    endSessionRecord(session.id);
    persistSession(session);
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
    // Reset idle timer whenever user sends a message
    this.clearIdleTimer(session.id);

    // Record in history
    const historyMsg: BrowserIncomingMessage = {
      type: "user_message",
      content,
      timestamp: Date.now(),
    };
    session.messageHistory.push(historyMsg);

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

    // Send to CLI via NDJSON stdin
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

    // Notify browsers the permission was handled
    this.broadcastToAll(session, {
      type: "permission_cancelled",
      request_id: msg.request_id,
    });
  }

  private handleInterrupt(session: ActiveSession): void {
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
