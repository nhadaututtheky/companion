/**
 * WsBridge session lifecycle — extracted from ws-bridge.ts.
 * Handles session creation/teardown, SDK engine startup, CLI launcher startup,
 * initial prompt sending, and CLI exit cleanup (workspace disconnect, plan watcher,
 * permission cleanup, status update, event emission, summarization, CodeGraph rescan).
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import { launchCLI, createPlanModeWatcher } from "./cli-launcher.js";
import { startSdkSession } from "./sdk-engine.js";
import { summarizeSession, buildSummaryInjection } from "./session-summarizer.js";
import { saveSessionFindings } from "../wiki/feedback.js";
import { buildSessionContext } from "./session-context.js";
import { buildAdapterContextPrefix } from "./adapter-context-builder.js";
import {
  buildProjectMap,
  getCodeGraphConfig,
  clearActivityState,
} from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
import { removeTracker } from "../codegraph/event-collector.js";
import { disconnectAllSpectators } from "./spectator-bridge.js";
import { revokeAllForSession } from "./share-manager.js";
import { connectCli, disconnectCli, getWorkspaceForSession } from "./workspace-store.js";
import { getWorkspaceContext } from "./workspace-context.js";
import { eventBus } from "./event-bus.js";
import { sessionSettingsService } from "./session-settings-service.js";
import { cleanupPulse } from "./pulse-estimator.js";
import { getActiveAccount, addAccountCost } from "./credential-manager.js";
import { isEncryptionEnabled } from "./crypto.js";
import {
  createActiveSession,
  getActiveSession,
  removeActiveSession,
  persistSession,
  createSessionRecord,
  endSessionRecord,
  getSessionRecord,
  clearCliSessionId,
  pushMessageHistory,
  getSessionMessages,
} from "./session-store.js";
import { clearEarlyResult, clearStreamBatch } from "./ws-stream-handler.js";
import { clearPrevTokens } from "./ws-context-tracker.js";
import type { SdkSessionHandle } from "./sdk-engine.js";
import type { ActiveSession } from "./session-store.js";
import type {
  CLIAssistantMessage,
  CLIResultMessage,
  CLIStreamEventMessage,
  CLIControlRequestMessage,
  CLIToolProgressMessage,
  BrowserIncomingMessage,
  SessionStatus,
  SessionState,
  PermissionRequest,
  NormalizedMessage,
  CLIProcess,
  CLIPlatform,
  ContextInjectionType,
} from "@companion/shared";
import {
  SESSION_IDLE_TIMEOUT_MS,
  thinkingModeToEffort,
  DEFAULT_PERMISSION_MODE,
} from "@companion/shared";

const log = createLogger("ws-session-lifecycle");

/** Whether to use the new SDK engine (set USE_SDK_ENGINE=1 to enable) */
const USE_SDK_ENGINE = process.env.USE_SDK_ENGINE === "1";

/** Default per-session settings (mirrors ws-bridge.ts) */
const DEFAULT_SESSION_SETTINGS = {
  idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
  keepAlive: false,
  autoReinjectOnCompact: true,
};

// ─── Shared Types ───────────────────────────────────────────────────────────

/** Options for starting a new session (shared between WsBridge and SessionLifecycleManager). */
export interface StartSessionOpts {
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
  /** Thinking mode — maps to Claude `--effort`. Off=low, Adaptive=omit, Deep=max. */
  thinkingMode?: import("@companion/shared").ThinkingMode;
  /** Context window: "200k" (default) or "1m" (Opus 4.7/4.6, Sonnet 4.6). */
  contextMode?: import("@companion/shared").ContextMode;
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
}

// ─── Bridge Interface ────────────────────────────────────────────────────────

export interface SessionLifecycleBridge {
  broadcastToAll: (session: ActiveSession, msg: BrowserIncomingMessage) => void;
  broadcastToSubscribers: (session: ActiveSession, msg: unknown) => void;
  updateStatus: (session: ActiveSession, status: SessionStatus) => void;
  emitContextInjection: (
    session: ActiveSession,
    type: ContextInjectionType,
    label: string,
    size: number,
  ) => void;
  handleSystemInit: (
    session: ActiveSession,
    msg: import("@companion/shared").CLISystemInitMessage,
  ) => void;
  handleAssistant: (session: ActiveSession, msg: CLIAssistantMessage) => void;
  handleResult: (session: ActiveSession, msg: CLIResultMessage) => void;
  handleStreamEvent: (session: ActiveSession, msg: CLIStreamEventMessage) => void;
  handleToolProgress: (session: ActiveSession, msg: CLIToolProgressMessage) => void;
  handleSystemStatus: (
    session: ActiveSession,
    msg: { subtype: "status"; status: "compacting" | null },
  ) => void;
  handleControlRequest: (session: ActiveSession, msg: CLIControlRequestMessage) => void;
  handleNormalizedMessage: (session: ActiveSession, msg: NormalizedMessage) => void;
  scheduleCleanup: (sessionId: string) => void;
  clearCompactTimers: (sessionId: string) => void;
  sendToCLI: (session: ActiveSession, ndjson: string) => void;
  getCliProcess: (sessionId: string) => CLIProcess | undefined;
  setCliProcess: (sessionId: string, process: CLIProcess) => void;
  deleteCliProcess: (sessionId: string) => void;
  getSdkHandle: (sessionId: string) => SdkSessionHandle | undefined;
  setSdkHandle: (sessionId: string, handle: SdkSessionHandle) => void;
  deleteSdkHandle: (sessionId: string) => void;
  getPlanWatcher: (sessionId: string) => ReturnType<typeof createPlanModeWatcher> | undefined;
  setPlanWatcher: (sessionId: string, watcher: ReturnType<typeof createPlanModeWatcher>) => void;
  deletePlanWatcher: (sessionId: string) => void;
  getPermissionResolver: (
    id: string,
  ) =>
    | ((response: {
        behavior: "allow" | "deny";
        updatedPermissions?: unknown[];
        message?: string;
      }) => void)
    | undefined;
  setPermissionResolver: (
    id: string,
    fn: (response: {
      behavior: "allow" | "deny";
      updatedPermissions?: unknown[];
      message?: string;
    }) => void,
  ) => void;
  deletePermissionResolver: (id: string) => void;
  getRtkPipeline: () => import("../rtk/index.js").RTKPipeline;
  getHooksBaseUrl: () => string;
  getSessionSettings: (sessionId: string) => {
    idleTimeoutMs: number;
    keepAlive: boolean;
    autoReinjectOnCompact: boolean;
  };
  killSession: (sessionId: string) => void;
  clearIdleTimer: (sessionId: string) => void;
  stopIdleTracking: (sessionId: string) => void;
  deleteSessionSettings: (sessionId: string) => void;
  notifyParentOfChildEnd: (childSessionId: string, status: string, preEndShortId?: string) => void;
  setSessionSettings: (
    sessionId: string,
    settings: { idleTimeoutMs: number; keepAlive: boolean; autoReinjectOnCompact: boolean },
  ) => void;
  cancelCleanupTimer: (sessionId: string) => void;
  clearSessionCache: (sessionId: string) => void;
}

// ─── SessionLifecycleManager ─────────────────────────────────────────────────

export class SessionLifecycleManager {
  constructor(private readonly bridge: SessionLifecycleBridge) {}

  // ── Public orchestrator: create and start a new session ──────────────────

  async startSession(opts: StartSessionOpts): Promise<string> {
    const sessionId = randomUUID();

    const initialState: SessionState = {
      session_id: sessionId,
      source: (opts.source as SessionState["source"]) ?? "web",
      model: opts.model,
      cwd: opts.cwd,
      tools: [],
      permissionMode: opts.permissionMode ?? DEFAULT_PERMISSION_MODE,
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
      parent_id: opts.parentId,
      role: opts.role,
      cost_budget_usd: opts.costBudgetUsd,
      cost_warned: 0,
      compact_mode: (opts.compactMode as SessionState["compact_mode"]) ?? "manual",
      compact_threshold: opts.compactThreshold ?? 75,
      thinking_mode: opts.thinkingMode ?? "adaptive",
      context_mode: opts.contextMode ?? "200k",
    };

    // Create in-memory session
    const session = createActiveSession(sessionId, initialState);
    if (opts.parentId) session.isChild = true;

    // Hydrate message history from the original session when resuming
    if (opts.resume && opts.resumeFromSessionId) {
      try {
        const { items } = getSessionMessages(opts.resumeFromSessionId, { limit: 200 });
        for (const msg of items) {
          if (msg.role === "user") {
            pushMessageHistory(session, {
              type: "user_message",
              content: msg.content,
              timestamp: msg.timestamp,
              source: msg.source,
            });
          } else if (msg.role === "assistant") {
            pushMessageHistory(session, {
              type: "assistant",
              timestamp: msg.timestamp,
              message: {
                id: msg.id,
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: msg.content }],
                model: "",
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: {
                  input_tokens: 0,
                  output_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
              },
            });
          }
        }
        log.info("Hydrated message history from previous session", {
          newSessionId: sessionId,
          originalSessionId: opts.resumeFromSessionId,
          messageCount: items.length,
        });
      } catch (err) {
        log.warn("Failed to hydrate message history on resume", { error: String(err) });
      }
    }

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
      this.bridge.setSessionSettings(sessionId, {
        ...DEFAULT_SESSION_SETTINGS,
        autoReinjectOnCompact: false,
      });
    }

    // Persist to DB (returns generated shortId)
    // Capture active account ID at session creation time
    const activeAccountId = isEncryptionEnabled() ? getActiveAccount()?.id : undefined;

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
      role: opts.role,
      workspaceId: opts.workspaceId,
      cliPlatform: opts.cliPlatform,
      accountId: activeAccountId,
    });

    // Attach shortId to session state for clients
    initialState.short_id = shortId;

    // ── Resume: inherit per-session settings from the previous row ─────────
    // Without this, the new `sessions` row sticks with migration defaults
    // and the user's custom idleTimeoutMs / keepAlive / thinking_mode /
    // context_mode silently resets. This was the INV-3 regression cycle.
    //
    // Reads via service so we benefit from its cache and stay on the single
    // source of truth; writes via service so subscribers (ws-bridge Map,
    // telegram-idle-manager cfg) pick up the inherited values immediately.
    if (opts.resume && opts.resumeFromSessionId) {
      try {
        const prev = sessionSettingsService.get(opts.resumeFromSessionId);
        sessionSettingsService.update(sessionId, {
          idleTimeoutMs: prev.idleTimeoutMs,
          idleTimeoutEnabled: prev.idleTimeoutEnabled,
          keepAlive: prev.keepAlive,
          autoReinjectOnCompact: prev.autoReinjectOnCompact,
          thinking_mode: prev.thinking_mode,
          context_mode: prev.context_mode,
        });
        log.info("Inherited session settings from resumed session", {
          sessionId,
          resumeFromSessionId: opts.resumeFromSessionId,
          idleTimeoutMs: prev.idleTimeoutMs,
        });
      } catch (err) {
        log.warn("Failed to inherit settings on resume — using defaults", {
          sessionId,
          error: String(err),
        });
      }
    }

    // Connect session to workspace and inject shared context
    if (opts.workspaceId) {
      const platform = opts.cliPlatform ?? "claude";
      connectCli(opts.workspaceId, platform, sessionId);

      const wsCtx = getWorkspaceContext(opts.workspaceId, platform);
      if (wsCtx && opts.prompt) {
        opts.prompt = `${wsCtx.content}\n---\n\n${opts.prompt}`;
      } else if (wsCtx && !opts.prompt) {
        opts.prompt = wsCtx.content;
      }
    }

    // If resuming, clear cliSessionId from old session so it's no longer listed as resumable
    if (opts.resume && opts.cliSessionId) {
      clearCliSessionId(opts.cliSessionId);
    }

    // ── SDK Engine path ──────────────────────────────────────────────────
    if (USE_SDK_ENGINE) {
      return this.startSessionWithSdk(sessionId, session, opts);
    }

    // ── Legacy CLI launcher path ────────────────────────────────────────
    return this.startSessionWithCli(sessionId, session, {
      ...opts,
      effort: thinkingModeToEffort(opts.thinkingMode),
    });
  }

  // ── Public orchestrator: kill and clean up a session ─────────────────────

  killSession(sessionId: string): void {
    this.bridge.clearIdleTimer(sessionId);
    this.bridge.cancelCleanupTimer(sessionId);
    this.bridge.deleteSessionSettings(sessionId);
    clearEarlyResult(sessionId);

    // Kill SDK handle if present
    const sdkHandle = this.bridge.getSdkHandle(sessionId);
    if (sdkHandle) {
      sdkHandle.abort();
      this.bridge.deleteSdkHandle(sessionId);
    }

    // Kill legacy CLI process if present
    const launch = this.bridge.getCliProcess(sessionId);
    if (launch) {
      launch.kill();
      this.bridge.deleteCliProcess(sessionId);
    }

    // Clean up any pending permission resolvers for this session
    const session = getActiveSession(sessionId);
    if (session) {
      for (const [reqId] of session.pendingPermissions) {
        const resolver = this.bridge.getPermissionResolver(reqId);
        if (resolver) {
          resolver({ behavior: "deny", message: "Session killed" });
          this.bridge.deletePermissionResolver(reqId);
        }
      }
    }

    const watcher = this.bridge.getPlanWatcher(sessionId);
    if (watcher) {
      watcher.stop();
      this.bridge.deletePlanWatcher(sessionId);
    }

    // Clean up stream/context state
    clearStreamBatch(sessionId);
    clearPrevTokens(sessionId);
    this.bridge.clearCompactTimers(sessionId);

    // Clean up graph activity tracker, injection state, and pulse (safe no-ops if never created)
    removeTracker(sessionId);
    clearActivityState(sessionId);
    cleanupPulse(sessionId);

    if (session) {
      // Capture shortId BEFORE endSessionRecord clears it (for child_ended notification)
      const preEndRecord = getSessionRecord(sessionId);
      const savedShortId = preEndRecord?.shortId ?? undefined;

      // Aggregate session cost to account (same as handleCLIExit path)
      if (preEndRecord?.accountId && session.state.total_cost_usd > 0) {
        addAccountCost(preEndRecord.accountId, session.state.total_cost_usd);
      }

      this.bridge.updateStatus(session, "ended");
      persistSession(session);
      disconnectAllSpectators(sessionId, "Session killed");
      revokeAllForSession(sessionId);

      // Emit session ended event
      eventBus.emit("session:ended", {
        sessionId,
        exitCode: -1,
        reason: "Session killed by user",
      });

      // Notify parent session if this was a child (multi-brain workspace)
      this.bridge.notifyParentOfChildEnd(sessionId, "ended", savedShortId);

      removeActiveSession(sessionId);
      this.bridge.clearSessionCache(sessionId);
    }

    // Always update DB regardless of in-memory state
    endSessionRecord(sessionId);

    // Auto-summarize (non-blocking)
    void summarizeSession(sessionId);
  }

  // ── SDK Engine session startup ────────────────────────────────────────────

  startSessionWithSdk(
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
        permissionMode: opts.permissionMode ?? DEFAULT_PERMISSION_MODE,
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
              this.bridge.emitContextInjection(
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
          this.bridge.handleSystemInit(session, {
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
            permissionMode: msg.permissionMode ?? opts.permissionMode ?? DEFAULT_PERMISSION_MODE,
            claude_code_version: msg.claude_code_version ?? "",
            slash_commands: [],
            uuid: msg.uuid ?? "",
          });
        },

        onAssistant: (msg) => {
          // Map SDK message to our CLIAssistantMessage shape
          this.bridge.handleAssistant(session, {
            type: "assistant",
            message: msg.message as CLIAssistantMessage["message"],
            parent_tool_use_id: msg.parent_tool_use_id,
            error: msg.error,
            uuid: msg.uuid ?? "",
            session_id: msg.session_id,
          });
        },

        onResult: (msg) => {
          this.bridge.handleResult(session, msg as unknown as CLIResultMessage);
        },

        onStreamEvent: (msg) => {
          this.bridge.handleStreamEvent(session, {
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
          this.bridge.handleToolProgress(session, {
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
            this.bridge.handleSystemStatus(session, {
              subtype: "status",
              status: "compacting",
            });
          }
        },

        onError: (error) => {
          this.bridge.broadcastToAll(session, {
            type: "error",
            message: error,
          } as unknown as BrowserIncomingMessage);
        },

        onExit: (exitCode, _reason) => {
          this.bridge.deleteSdkHandle(sessionId);
          this.handleCLIExit(session, exitCode);
        },

        // Permission bridge: SDK blocks until this resolves
        requestPermission: (requestId, toolName, input, permOpts) => {
          return new Promise((resolve) => {
            // Store resolver — will be called when user responds via WebSocket
            this.bridge.setPermissionResolver(requestId, (response) => {
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
            this.bridge.handleControlRequest(session, {
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
    this.bridge.setSdkHandle(sessionId, handle);

    log.info("Session started (SDK engine)", { sessionId, cwd: opts.cwd, model: opts.model });
    return sessionId;
  }

  // ── Legacy CLI launcher session startup ──────────────────────────────────

  startSessionWithCli(
    sessionId: string,
    session: ActiveSession,
    opts: {
      projectSlug?: string;
      cwd: string;
      model: string;
      permissionMode?: string;
      prompt?: string;
      resume?: boolean;
      resumeFromSessionId?: string;
      cliSessionId?: string;
      source?: string;
      envVars?: Record<string, string>;
      bare?: boolean;
      effort?: "low" | "medium" | "high" | "xhigh" | "max";
      contextMode?: "200k" | "1m";
      cliPlatform?: CLIPlatform;
      platformOptions?: Record<string, unknown>;
    },
  ): string {
    const cliPlatform = opts.cliPlatform ?? "claude";

    // Store platform in session state
    session.state.cli_platform = cliPlatform;

    // Create plan mode watcher (Claude-specific but harmless for other platforms)
    const planWatcher = createPlanModeWatcher(
      (ndjson) => this.bridge.sendToCLI(session, ndjson),
      (action) => {
        log.warn("Plan mode stuck escalation", { sessionId, action });
        if (action === "kill") {
          this.bridge.killSession(sessionId);
        }
        this.bridge.broadcastToSubscribers(session, {
          type: "error",
          message: `Plan mode stuck — ${action}`,
        });
      },
    );
    planWatcher.start();
    this.bridge.setPlanWatcher(sessionId, planWatcher);

    // Non-Claude platforms receive the prompt via CLI args, not stdin, so we
    // must pre-enrich it with session context / CodeGraph / prior-session
    // replay before launch. Claude does this AFTER launch in sendInitialPrompt.
    let launchPrompt = opts.prompt;
    const nonClaudeWantsContext =
      cliPlatform !== "claude" && (opts.prompt || (opts.resume && opts.resumeFromSessionId));
    if (nonClaudeWantsContext) {
      const approvalMode = opts.platformOptions?.approvalMode as string | undefined;
      const prefix = buildAdapterContextPrefix({
        sessionId,
        shortId: session.state.short_id ?? sessionId.slice(0, 8),
        projectSlug: opts.projectSlug,
        cwd: opts.cwd,
        model: opts.model,
        permissionMode: opts.permissionMode,
        source: opts.source,
        cliPlatform,
        resumeFromSessionId: opts.resume ? opts.resumeFromSessionId : undefined,
        planMode: approvalMode === "plan",
      });
      const body = opts.prompt ?? "Please continue from where the previous session left off.";
      launchPrompt = prefix + body;
    }

    // Launch CLI process via adapter registry
    const hooksUrl = this.bridge.getHooksBaseUrl();
    const launchPromise = launchCLI(
      {
        sessionId,
        cwd: opts.cwd,
        model: opts.model,
        permissionMode: opts.permissionMode,
        prompt: launchPrompt,
        resume: opts.resume,
        cliSessionId: opts.cliSessionId,
        envVars: opts.envVars,
        hooksUrl,
        hookSecret: session.hookSecret,
        bare: opts.bare,
        effort: opts.effort,
        contextMode: opts.contextMode,
        cliPlatform,
        platformOptions: { ...opts.platformOptions, projectSlug: opts.projectSlug },
      },
      (msg: NormalizedMessage) => this.bridge.handleNormalizedMessage(session, msg),
      (exitCode) => {
        const proc = this.bridge.getCliProcess(sessionId);
        if (proc) {
          session.lastStderrLines = proc.getStderrLines();
        }
        this.handleCLIExit(session, exitCode);
      },
    );

    // Handle async launch — move all post-launch logic into the .then()
    launchPromise
      .then((launch) => {
        session.cliSend = launch.send;
        session.pid = launch.pid;
        this.bridge.setCliProcess(sessionId, launch);

        // Flush pending messages
        for (const pending of session.pendingMessages) {
          launch.send(pending);
        }
        session.pendingMessages = [];

        // Send initial prompt after launch
        this.sendInitialPrompt(session, sessionId, opts, cliPlatform);
      })
      .catch((err) => {
        log.error("Failed to launch CLI", { sessionId, platform: cliPlatform, error: String(err) });
        this.bridge.broadcastToSubscribers(session, {
          type: "error",
          message: `Failed to launch ${cliPlatform}: ${String(err)}`,
        });
        this.handleCLIExit(session, 1);
      });

    log.info("Session started (CLI launcher)", {
      sessionId,
      cwd: opts.cwd,
      model: opts.model,
      platform: cliPlatform,
    });
    return sessionId;
  }

  // ── Initial prompt send ───────────────────────────────────────────────────

  /** Send the initial prompt to a newly launched CLI session */
  sendInitialPrompt(
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
    if (!opts.prompt || opts.resume) return;

    if (cliPlatform !== "claude") {
      // Non-Claude platforms: prompt was passed via CLI args in adapter.launch()
      // No need to send via stdin — adapter handles it
      return;
    }

    // Claude-specific: send initial prompt via stdin NDJSON
    if (opts.prompt && !opts.resume) {
      const summaryContext = buildSummaryInjection(opts.projectSlug);
      const sessionContext = buildSessionContext({
        sessionId,
        shortId: session.state.short_id ?? sessionId.slice(0, 8),
        projectSlug: opts.projectSlug,
        model: opts.model,
        permissionMode: opts.permissionMode ?? DEFAULT_PERMISSION_MODE,
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
              this.bridge.emitContextInjection(
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
        this.bridge.sendToCLI(session, ndjson);
      }, 1000);
    }
  }

  // ── CLI exit handler ──────────────────────────────────────────────────────

  handleCLIExit(session: ActiveSession, exitCode: number): void {
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
    this.bridge.deleteCliProcess(session.id);
    this.bridge.deleteSdkHandle(session.id);
    this.bridge.clearIdleTimer(session.id);
    this.bridge.clearCompactTimers(session.id);
    this.bridge.stopIdleTracking(session.id);
    clearPrevTokens(session.id);
    clearEarlyResult(session.id);
    clearStreamBatch(session.id);
    cleanupPulse(session.id);
    this.bridge.deleteSessionSettings(session.id);

    // Disconnect from workspace if linked
    const wsId = getWorkspaceForSession(session.id);
    if (wsId) {
      const platform = (session.state.cli_platform ?? "claude") as CLIPlatform;
      disconnectCli(wsId, platform);
    }

    // Reject any outstanding SDK permission resolvers for this session
    for (const [reqId] of session.pendingPermissions) {
      const resolver = this.bridge.getPermissionResolver(reqId);
      if (resolver) {
        resolver({ behavior: "deny", message: "Session ended" });
        this.bridge.deletePermissionResolver(reqId);
      }
    }

    const watcher = this.bridge.getPlanWatcher(session.id);
    if (watcher) {
      watcher.stop();
      this.bridge.deletePlanWatcher(session.id);
    }

    // Build a human-readable reason for the exit
    let reason: string | undefined;
    if (isEarlyExit && exitCode !== 0) {
      reason = `CLI crashed on startup (exit code ${exitCode}). Check that Claude Code is installed and authenticated.`;
    } else if (isEarlyExit && exitCode === 0) {
      reason =
        "CLI exited immediately — this may indicate a --print mode issue. Session can be retried.";
    } else if (exitCode === 143 || exitCode === 137) {
      // SIGTERM (143) or SIGKILL (137) — normal termination
      reason = "Session was stopped";
    } else if (exitCode === 0 || exitCode === null || exitCode === undefined) {
      reason = "Session completed";
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

    this.bridge.broadcastToAll(session, {
      type: "cli_disconnected",
      exitCode,
      reason,
    } as BrowserIncomingMessage);

    // Use "error" status for early/unexpected exits so the UI can show diagnostics
    const finalStatus = isEarlyExit ? "error" : "ended";
    this.bridge.updateStatus(session, finalStatus);

    // Capture shortId BEFORE endSessionRecord clears it (for child_ended notification)
    const preEndRecord = getSessionRecord(session.id);
    const savedShortId = preEndRecord?.shortId ?? undefined;

    // Aggregate session cost to the account that was used
    if (preEndRecord?.accountId && session.state.total_cost_usd > 0) {
      addAccountCost(preEndRecord.accountId, session.state.total_cost_usd);
    }

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

    // Notify parent session if this was a child (multi-brain workspace)
    this.bridge.notifyParentOfChildEnd(session.id, finalStatus, savedShortId);

    // Auto-summarize only for sessions that actually ran
    if (hadTurns) {
      void summarizeSession(session.id);
      // Wiki feedback: save session findings as raw material (waits for summary)
      void saveSessionFindings(session.id);
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
    this.bridge.scheduleCleanup(session.id);
  }
}
