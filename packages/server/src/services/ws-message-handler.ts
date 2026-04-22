/**
 * WsBridge CLI message handling — extracted from ws-bridge.ts.
 * Handles NormalizedMessage routing, CLI message parsing, system init/status,
 * identity re-injection, assistant message processing, and result finalization.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";
import {
  getSessionRecord,
  persistSession,
  storeMessage,
  updateCliSessionId,
  pushMessageHistory,
} from "./session-store.js";
import { getFullBreakdown } from "./context-budget.js";
import { getWikiStartContext } from "./context-budget.js";
import { recordWikiOp } from "../wiki/index.js";
import {
  buildProjectMap,
  buildMessageContext as _buildMessageContext,
  buildActivityContext as _buildActivityContext,
  clearActivityState as _clearActivityState,
  reviewPlan,
  checkBreaks,
  hasPlanIndicators,
  extractFilePaths,
  getCodeGraphConfig,
} from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
import { processToolEvent } from "../codegraph/event-collector.js";
import { getOrCreatePulse, finalizePulseTurn } from "./pulse-estimator.js";
import { bufferEarlyResult, clearEarlyResult } from "./ws-stream-handler.js";
import {
  handleStreamEvent as _handleStreamEvent,
  handleToolProgress as _handleToolProgress,
  forceFlushStreamBatch,
} from "./ws-stream-handler.js";
import { handleControlRequest as _handleControlRequest } from "./ws-permission-handler.js";
import {
  handleControlResponse as _handleControlResponse,
  emitContextInjection as _emitContextInjection,
  broadcastContextUpdate as _broadcastContextUpdate,
  requestContextUsage as _requestContextUsage,
  checkCostBudget as _checkCostBudget,
  checkSmartCompact as _checkSmartCompact,
} from "./ws-context-tracker.js";
import type { ContextBridge } from "./ws-context-tracker.js";
import type { PermissionBridge } from "./ws-permission-handler.js";
import type { CompactBridge } from "./compact-manager.js";
import type { RTKPipeline } from "../rtk/index.js";
import type { ActiveSession } from "./session-store.js";
import { DEFAULT_PERMISSION_MODE } from "@companion/shared";
import type {
  CLIMessage,
  CLISystemInitMessage,
  CLIAssistantMessage,
  CLIResultMessage,
  CLIStreamEventMessage,
  CLIControlRequestMessage,
  CLIToolProgressMessage,
  BrowserIncomingMessage,
  ContextInjectionType,
  SessionStatus,
  NormalizedMessage,
} from "@companion/shared";
import type { IdleDetector } from "./idle-detector.js";
import type { SessionSettings } from "./ws-health-idle.js";

const log = createLogger("ws-message-handler");

// ─── Bridge Interface ────────────────────────────────────────────────────────

export interface MessageHandlerBridge {
  broadcastToAll: (session: ActiveSession, msg: BrowserIncomingMessage) => void;
  broadcastToSubscribers: (session: ActiveSession, msg: unknown) => void;
  updateStatus: (session: ActiveSession, status: SessionStatus) => void;
  persistSession: (session: ActiveSession) => void;
  emitContextInjection: (
    session: ActiveSession,
    type: ContextInjectionType,
    label: string,
    size: number,
  ) => void;
  broadcastContextUpdate: (session: ActiveSession) => void;
  requestContextUsage: (session: ActiveSession) => void;
  checkCostBudget: (session: ActiveSession) => void;
  checkSmartCompact: (session: ActiveSession) => void;
  startIdleTimer: (session: ActiveSession) => void;
  sendToCLI: (session: ActiveSession, ndjson: string) => void;
  reloadRTKConfig: () => void;
  getRtkPipeline: () => RTKPipeline;
  getIdleDetector: () => IdleDetector;
  getPlanWatcher: (
    sessionId: string,
  ) => ReturnType<typeof import("./cli-launcher.js").createPlanModeWatcher> | undefined;
  getSessionSettings: (sessionId: string) => SessionSettings;
  handleStreamEvent: (session: ActiveSession, msg: CLIStreamEventMessage) => void;
  handleControlRequest: (session: ActiveSession, msg: CLIControlRequestMessage) => void;
  handleToolProgress: (session: ActiveSession, msg: CLIToolProgressMessage) => void;
  handleControlResponse: (session: ActiveSession, parsed: Record<string, unknown>) => void;
}

// ─── MessageHandler ──────────────────────────────────────────────────────────

export class MessageHandler {
  constructor(private readonly bridge: MessageHandlerBridge) {}

  // ── handleNormalizedMessage ───────────────────────────────────────────────

  /**
   * Handle a NormalizedMessage from any CLI adapter.
   * Routes to existing handlers via raw message passthrough (Claude)
   * or by reconstructing compatible message shapes (other platforms).
   */
  handleNormalizedMessage(session: ActiveSession, msg: NormalizedMessage): void {
    this.bridge.getIdleDetector().recordOutput(session.id);

    // For Claude: passthrough to existing handleCLIMessage via raw
    // This preserves all existing behavior during the transition period.
    if (msg.platform === "claude" && msg.raw) {
      const rawStr = typeof msg.raw === "string" ? msg.raw : JSON.stringify(msg.raw);
      this.handleCLIMessage(session, rawStr);
      return;
    }

    // For non-Claude platforms: route normalized messages to handlers
    switch (msg.type) {
      case "system_init":
        this.handleSystemInit(session, {
          type: "system",
          subtype: "init",
          cwd: msg.cwd ?? session.state.cwd,
          session_id: msg.sessionId ?? session.id,
          tools: msg.tools ?? [],
          mcp_servers: [],
          model: msg.model ?? session.state.model,
          permissionMode: msg.permissionMode ?? DEFAULT_PERMISSION_MODE,
          claude_code_version: msg.cliVersion ?? "unknown",
          slash_commands: [],
          uuid: "",
        } as CLISystemInitMessage);
        break;

      case "assistant":
        if (msg.contentBlocks) {
          this.handleAssistant(session, {
            type: "assistant",
            message: {
              id: `${msg.platform}-${Date.now()}`,
              type: "message",
              role: "assistant",
              model: msg.model ?? session.state.model,
              content: msg.contentBlocks,
              stop_reason: msg.stopReason ?? null,
              usage: {
                input_tokens: msg.tokenUsage?.input ?? 0,
                output_tokens: msg.tokenUsage?.output ?? 0,
                cache_creation_input_tokens: msg.tokenUsage?.cacheCreation ?? 0,
                cache_read_input_tokens: msg.tokenUsage?.cacheRead ?? 0,
              },
            },
            parent_tool_use_id: null,
            uuid: "",
            session_id: session.id,
          } as CLIAssistantMessage);
        }
        break;

      case "complete":
        this.handleResult(session, {
          type: "result",
          subtype: msg.isError ? "error_during_execution" : "success",
          is_error: msg.isError ?? false,
          result: msg.resultText,
          duration_ms: msg.durationMs ?? 0,
          duration_api_ms: msg.durationMs ?? 0,
          num_turns: msg.numTurns ?? 1,
          total_cost_usd: msg.costUsd ?? 0,
          stop_reason: null,
          usage: {
            input_tokens: msg.tokenUsage?.input ?? 0,
            output_tokens: msg.tokenUsage?.output ?? 0,
            cache_creation_input_tokens: msg.tokenUsage?.cacheCreation ?? 0,
            cache_read_input_tokens: msg.tokenUsage?.cacheRead ?? 0,
          },
          total_lines_added: msg.linesAdded,
          total_lines_removed: msg.linesRemoved,
          uuid: "",
          session_id: session.id,
        } as CLIResultMessage);
        break;

      case "progress":
        if (msg.toolName) {
          this.bridge.handleToolProgress(session, {
            type: "tool_progress",
            tool_use_id: msg.toolUseId ?? "",
            tool_name: msg.toolName,
            parent_tool_use_id: null,
            elapsed_time_seconds: msg.elapsedSeconds ?? 0,
            uuid: "",
            session_id: session.id,
          } as CLIToolProgressMessage);
        }
        break;

      case "error":
        this.bridge.broadcastToSubscribers(session, {
          type: "error",
          message: msg.errorMessage ?? "Unknown error",
        });
        break;

      case "status":
        // Non-Claude platforms reporting status changes (e.g. compacting)
        if (msg.raw) {
          const raw = msg.raw as Record<string, unknown>;
          const status = (raw.status as string | null) ?? null;
          if (status === "compacting" || status === null) {
            this.handleSystemStatus(session, { subtype: "status", status });
          }
        }
        break;

      case "control_request": {
        // Non-Claude platforms requesting user permission — route through full permission handler
        const requestId = msg.requestId ?? randomUUID();
        this.bridge.handleControlRequest(session, {
          type: "control_request",
          request_id: requestId,
          request: {
            subtype: msg.request?.subtype ?? "tool_use",
            tool_name: msg.request?.tool_name ?? msg.toolName ?? "unknown",
            input: msg.request?.input ?? {},
            description: msg.request?.description,
            tool_use_id: msg.request?.tool_use_id,
          },
        });
        break;
      }

      case "keep_alive":
        break;
    }
  }

  // ── handleCLIMessage ──────────────────────────────────────────────────────

  /** @deprecated — Use handleNormalizedMessage for new code. Kept for Claude raw passthrough. */
  handleCLIMessage(session: ActiveSession, line: string): void {
    // Record output activity for idle detection
    this.bridge.getIdleDetector().recordOutput(session.id);

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
      this.bridge.handleControlResponse(session, parsed);
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
        this.bridge.handleStreamEvent(session, msg as CLIStreamEventMessage);
        break;
      case "control_request":
        this.bridge.handleControlRequest(session, msg as CLIControlRequestMessage);
        break;
      case "tool_progress":
        this.bridge.handleToolProgress(session, msg as CLIToolProgressMessage);
        break;
      case "keep_alive":
        // no-op
        break;
    }
  }

  // ── handleSystemInit ──────────────────────────────────────────────────────

  handleSystemInit(session: ActiveSession, msg: CLISystemInitMessage): void {
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

    this.bridge.broadcastToAll(session, {
      type: "session_init",
      session: session.state,
    });

    this.bridge.updateStatus(session, "idle");
    this.bridge.persistSession(session);

    // Broadcast context breakdown estimate (includes wiki if enabled)
    try {
      const breakdown = getFullBreakdown(
        session.state.cwd,
        session.state.mcp_servers,
        session.state.model,
      );
      this.bridge.broadcastToAll(session, {
        type: "context_breakdown",
        breakdown,
      });
    } catch (err) {
      log.error("Failed to estimate context breakdown", { error: String(err) });
    }

    // Inject wiki L0 context if enabled and domain configured.
    // Gated to Claude CLI — non-Claude adapters need adapter-specific user-message plumbing.
    if (msg.claude_code_version && msg.claude_code_version !== "unknown") {
      this.injectWikiContext(session, "init");
    }

    log.info("CLI initialized", {
      sessionId: session.id,
      cliSessionId: msg.session_id,
      model: msg.model,
      version: msg.claude_code_version,
    });
  }

  // ── handleSystemStatus ────────────────────────────────────────────────────

  handleSystemStatus(
    session: ActiveSession,
    msg: { subtype: "status"; status: "compacting" | null },
  ): void {
    if (msg.status === "compacting") {
      this.bridge.updateStatus(session, "compacting");
    } else if (msg.status === null && session.compactPending) {
      // Compact finished — reset the guard flag
      session.compactPending = false;
      this.bridge.broadcastToAll(session, {
        type: "compact_handoff",
        stage: "done",
        message: "Context compaction complete.",
      } as BrowserIncomingMessage);

      // Auto re-inject identity context after compaction
      this.maybeReinjectIdentity(session);
    }
  }

  // ── maybeReinjectIdentity ─────────────────────────────────────────────────

  /**
   * After context compaction completes, re-inject a minimal system context
   * message so Claude retains project/identity awareness in the new context window.
   * Only fires if autoReinjectOnCompact is enabled (default: true).
   */
  maybeReinjectIdentity(session: ActiveSession): void {
    const settings = this.bridge.getSessionSettings(session.id);
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
    this.bridge.sendToCLI(session, ndjson);

    // Also re-inject Wiki L0 domain context so core rules survive compaction.
    this.injectWikiContext(session, "compact");
  }

  // ── injectWikiContext ─────────────────────────────────────────────────────

  /**
   * Inject the Wiki KB L0 domain context into the Claude CLI as a user message,
   * so the agent sees core rules + article index + MCP tool hints inline.
   * Claude-only — non-Claude adapters need their own user-message plumbing.
   *
   * @param phase "init" at session start, "compact" after context compaction.
   */
  private injectWikiContext(session: ActiveSession, phase: "init" | "compact"): void {
    try {
      const wikiCtx = getWikiStartContext(session.state.cwd);
      if (!wikiCtx) {
        recordWikiOp({ type: "l0_skip", source: phase });
        return;
      }

      const header =
        phase === "init"
          ? `[Wiki KB — domain "${wikiCtx.domain}" context loaded at session start]`
          : `[Wiki KB — re-injection after compaction — domain "${wikiCtx.domain}"]`;
      const toolsHint = [
        "### How to use this wiki (persistent across sessions)",
        "",
        "**Reading** — call `companion_wiki_search` to find articles, `companion_wiki_read` to load a full article.",
        "",
        "**Writing — do this proactively, not only when asked.** Call `companion_wiki_note` whenever you:",
        "- Fix a bug and learn the underlying root cause",
        "- Discover a non-obvious pattern, convention, or invariant in the codebase",
        "- Infer a hidden constraint, gotcha, or undocumented API contract",
        "- Make a judgment call that a future session would need context to repeat",
        "",
        "Notes start as rough drafts in the raw bin; the wiki compiler later polishes them into canonical articles. Think of this wiki as your shared notebook with every future agent working on this project — a note you write now compounds for every session after.",
      ].join("\n");
      const content = `${header}\n\n${wikiCtx.content}\n\n---\n${toolsHint}`;

      const ndjson = JSON.stringify({
        type: "user",
        message: { role: "user", content },
      });
      this.bridge.sendToCLI(session, ndjson);

      recordWikiOp({
        type: "l0_inject",
        domain: wikiCtx.domain,
        tokens: wikiCtx.tokens,
        source: phase,
      });

      log.info(`Wiki L0 injected (${phase})`, {
        sessionId: session.id,
        domain: wikiCtx.domain,
        tokens: wikiCtx.tokens,
        bytes: content.length,
      });
    } catch (err) {
      log.debug("Wiki context injection failed", { phase, error: String(err) });
    }
  }

  // ── handleAssistant ───────────────────────────────────────────────────────

  handleAssistant(session: ActiveSession, msg: CLIAssistantMessage): void {
    // Track file operations from tool_use blocks
    if (msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type !== "tool_use") continue;

        const toolName = block.name;

        // Detect plan mode via tool_use (before filePath guard — these tools have no file path)
        if (toolName === "EnterPlanMode") {
          session.state = { ...session.state, is_in_plan_mode: true };
          this.bridge.getPlanWatcher(session.id)?.onEnterPlan();
        } else if (toolName === "ExitPlanMode") {
          session.state = { ...session.state, is_in_plan_mode: false };
          this.bridge.getPlanWatcher(session.id)?.onExitPlan();
        }

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
              this.bridge.broadcastToAll(session, {
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
        } catch {
          /* never block */
        }
      }
    }

    // Reload RTK config periodically (picks up settings changes without restart)
    this.bridge.reloadRTKConfig();

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

    const rtkPipeline = this.bridge.getRtkPipeline();
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
              } catch {
                /* never block */
              }

              const rtkResult = rtkPipeline.transform(block.content, {
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
    this.bridge.broadcastToAll(session, browserMsg);
    this.bridge.updateStatus(session, "busy");

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
        } catch {
          /* never block */
        }

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
                  this.bridge.emitContextInjection(
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

  // ── handleResult ──────────────────────────────────────────────────────────

  handleResult(session: ActiveSession, msg: CLIResultMessage): void {
    // Flush any pending stream event batch BEFORE broadcasting result.
    // Without this, late batched stream events would arrive after Telegram's
    // completeStream() — causing duplicate text or orphaned messages.
    forceFlushStreamBatch(session);
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
      bufferEarlyResult(session.id, browserMsg);
      log.debug("Buffered early result (no receivers yet)", { sessionId: session.id });
    } else {
      clearEarlyResult(session.id);
    }

    this.bridge.broadcastToAll(session, browserMsg);

    // Broadcast updated session state so clients can re-compute context meter
    this.bridge.broadcastToAll(session, {
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
        this.bridge.broadcastToAll(session, {
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
    } catch {
      /* never block */
    }

    this.bridge.updateStatus(session, "idle");
    this.bridge.persistSession(session);

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
              this.bridge.emitContextInjection(
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
    this.bridge.checkCostBudget(session);

    // Broadcast context usage after updating token counts (estimate from deltas)
    this.bridge.broadcastContextUpdate(session);

    // Request accurate context usage from CLI (if supported)
    this.bridge.requestContextUsage(session);

    // Check smart compact (must be after context broadcast, before idle timer)
    this.bridge.checkSmartCompact(session);

    // Start idle timer after session completes a result (goes idle)
    this.bridge.startIdleTimer(session);
  }
}
