/**
 * SdkEngine — Wraps @anthropic-ai/claude-agent-sdk `query()` as the session runner.
 * Replaces cli-launcher.ts for cleaner typed message streaming.
 *
 * Performance safeguards:
 * - AbortController per session for clean cancellation
 * - Inactivity watchdog (5 min no-message → abort)
 * - maxTurns / maxBudgetUsd passed to SDK
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKSystemMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKPartialAssistantMessage,
  Query,
  PermissionResult,
  PermissionUpdate,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { createLogger } from "../logger.js";

const log = createLogger("sdk-engine");

// ─── Constants ───────────────────────────────────────────────────────────────

/** If no SDK message arrives in this window, abort the session */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Default max turns per session (safety net) */
const DEFAULT_MAX_TURNS = 200;

/** Default max budget per session (USD) */
const DEFAULT_MAX_BUDGET_USD = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SdkSessionOptions {
  sessionId: string;
  cwd: string;
  model: string;
  permissionMode?: string;
  prompt: string;
  resume?: string; // CLI session ID to resume
  forkSession?: boolean;
  maxTurns?: number;
  maxBudgetUsd?: number;
  envVars?: Record<string, string>;
}

export interface SdkSessionHandle {
  /** Abort the session cleanly */
  abort: () => void;
  /** The Query async generator (for interrupt/setModel) */
  query: Query;
  /** Whether the session loop is still running */
  isRunning: () => boolean;
}

/** Callback to request permission from the user (returns a Promise that resolves when user responds) */
export type PermissionRequestCallback = (
  requestId: string,
  toolName: string,
  input: Record<string, unknown>,
  options: {
    suggestions?: PermissionUpdate[];
    description?: string;
    toolUseId?: string;
  },
) => Promise<PermissionResult>;

export interface SdkMessageCallbacks {
  onSystemInit: (msg: SDKSystemMessage) => void;
  onAssistant: (msg: SDKAssistantMessage) => void;
  onResult: (msg: SDKResultMessage) => void;
  onStreamEvent: (msg: SDKPartialAssistantMessage) => void;
  onToolProgress: (msg: Extract<SDKMessage, { type: "tool_progress" }>) => void;
  onStatusChange: (msg: { subtype: string; status: unknown }) => void;
  onError: (error: string) => void;
  onExit: (exitCode: number, reason?: string) => void;
  /** Permission bridge: called when SDK needs user approval */
  requestPermission: PermissionRequestCallback;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Start an SDK-driven session. Returns a handle for aborting.
 * The session runs as an async loop — messages are delivered via callbacks.
 */
export function startSdkSession(
  opts: SdkSessionOptions,
  callbacks: SdkMessageCallbacks,
): SdkSessionHandle {
  const abortController = new AbortController();
  let running = true;
  let lastMessageAt = Date.now();

  // Inactivity watchdog — checks every 60s
  const watchdogInterval = setInterval(() => {
    if (!running) {
      clearInterval(watchdogInterval);
      return;
    }
    const elapsed = Date.now() - lastMessageAt;
    if (elapsed > INACTIVITY_TIMEOUT_MS) {
      log.warn("Session inactivity timeout", {
        sessionId: opts.sessionId,
        elapsedMs: elapsed,
      });
      abortController.abort();
    }
  }, 60_000);

  // Permission bridge: SDK calls canUseTool → we forward to WsBridge → wait for user response
  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    toolOpts: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
      renderedPrompt?: string;
    },
  ): Promise<PermissionResult> => {
    const requestId = randomUUID();

    try {
      const result = await callbacks.requestPermission(
        requestId,
        toolName,
        input,
        {
          suggestions: toolOpts.suggestions,
          description: toolOpts.decisionReason ?? toolOpts.renderedPrompt,
          toolUseId: toolOpts.toolUseID,
        },
      );
      return result;
    } catch {
      // If permission request fails (e.g. abort), deny
      return { behavior: "deny", message: "Permission request failed" };
    }
  };

  // Build SDK options
  const sdkQuery = query({
    prompt: opts.prompt,
    options: {
      abortController,
      cwd: opts.cwd,
      model: opts.model,
      permissionMode: (opts.permissionMode ?? "default") as PermissionMode,
      includePartialMessages: true,
      canUseTool,
      maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
      maxBudgetUsd: opts.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
      ...(opts.resume ? { resume: opts.resume } : {}),
      ...(opts.forkSession ? { forkSession: true } : {}),
    },
  });

  // Async message loop
  const runLoop = async () => {
    try {
      for await (const msg of sdkQuery) {
        if (!running) break;
        lastMessageAt = Date.now();

        routeMessage(msg, callbacks, opts.sessionId);
      }

      // Normal completion
      if (running) {
        running = false;
        callbacks.onExit(0);
      }
    } catch (err: unknown) {
      running = false;
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      if (isAbort) {
        log.info("Session aborted", { sessionId: opts.sessionId });
        callbacks.onExit(0, "Session aborted by user");
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error("SDK session error", { sessionId: opts.sessionId, error: errMsg });
        callbacks.onError(errMsg);
        callbacks.onExit(1, errMsg);
      }
    } finally {
      running = false;
      clearInterval(watchdogInterval);
    }
  };

  // Fire and forget — the loop runs in background
  void runLoop();

  return {
    abort: () => {
      running = false;
      abortController.abort();
      clearInterval(watchdogInterval);
    },
    query: sdkQuery,
    isRunning: () => running,
  };
}

// ─── Message Router ──────────────────────────────────────────────────────────

function routeMessage(
  msg: SDKMessage,
  callbacks: SdkMessageCallbacks,
  sessionId: string,
): void {
  switch (msg.type) {
    case "system": {
      if ("subtype" in msg && msg.subtype === "init") {
        callbacks.onSystemInit(msg as SDKSystemMessage);
      } else if ("subtype" in msg && msg.subtype === "status") {
        callbacks.onStatusChange(msg as { subtype: string; status: unknown });
      }
      break;
    }
    case "assistant": {
      callbacks.onAssistant(msg as SDKAssistantMessage);
      break;
    }
    case "result": {
      callbacks.onResult(msg as SDKResultMessage);
      break;
    }
    case "stream_event": {
      callbacks.onStreamEvent(msg as SDKPartialAssistantMessage);
      break;
    }
    case "tool_progress": {
      callbacks.onToolProgress(msg as Extract<SDKMessage, { type: "tool_progress" }>);
      break;
    }
    default: {
      // Log unhandled types at debug level
      log.debug("Unhandled SDK message type", { type: (msg as { type: string }).type, sessionId });
    }
  }
}
