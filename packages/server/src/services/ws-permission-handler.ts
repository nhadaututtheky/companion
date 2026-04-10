/**
 * WsBridge permission handling — extracted from ws-bridge.ts (Phase 3).
 * Handles control_request/response routing, auto-approve timers, and interrupt.
 */

import { createLogger } from "../logger.js";
import { broadcastToAll } from "./ws-broadcast.js";
import { getOrCreatePulse } from "./pulse-estimator.js";
import type { ActiveSession } from "./session-store.js";
import type {
  CLIControlRequestMessage,
  PermissionRequest,
  BrowserIncomingMessage,
  HookEvent,
  PreToolUseResponse,
} from "@companion/shared";
import type { SdkSessionHandle } from "./sdk-engine.js";

const log = createLogger("ws-permission");

// ─── Constants ──────────────────────────────────────────────────────────────

/** Tools that are safe state transitions — auto-approve immediately */
const ALWAYS_APPROVE_TOOLS = new Set(["EnterPlanMode", "ExitPlanMode"]);

/** Tools that should NEVER be auto-approved */
const NEVER_AUTO_APPROVE_TOOLS = new Set(["AskUserQuestion"]);

// ─── Types ──────────────────────────────────────────────────────────────────

export type PermissionResolver = (result: {
  behavior: "allow" | "deny";
  message?: string;
  updatedPermissions?: unknown[];
}) => void;

export interface PermissionBridge {
  sendToCLI: (session: ActiveSession, ndjson: string) => void;
  permissionResolvers: Map<string, PermissionResolver>;
  sdkHandles: Map<string, SdkSessionHandle>;
}

// ─── Permission Response ────────────────────────────────────────────────────

/** Handle a permission response (allow/deny) from browser or auto-approve. */
export function handlePermissionResponse(
  bridge: PermissionBridge,
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
    try {
      getOrCreatePulse(session.id).setBlocked(false);
    } catch {
      /* */
    }
  }

  // SDK engine path: resolve the permission Promise
  const resolver = bridge.permissionResolvers.get(msg.request_id);
  if (resolver) {
    resolver({
      behavior: msg.behavior,
      ...(msg.updated_permissions ? { updatedPermissions: msg.updated_permissions } : {}),
    });
    bridge.permissionResolvers.delete(msg.request_id);
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

    bridge.sendToCLI(session, ndjson);
  } else {
    // Stale response — no resolver and no CLI stdin; discard silently
    log.debug("Permission response has no target (stale?)", {
      sessionId: session.id,
      requestId: msg.request_id,
    });
  }

  // Notify browsers the permission was handled
  broadcastToAll(session, {
    type: "permission_cancelled",
    request_id: msg.request_id,
  });
}

// ─── Control Request (Permission Request from CLI) ──────────────────────────

/** Handle a control_request (permission request) from CLI. */
export function handleControlRequest(
  bridge: PermissionBridge,
  session: ActiveSession,
  msg: CLIControlRequestMessage,
): void {
  const toolName = msg.request.tool_name ?? "";
  const subtype = msg.request.subtype;

  // Auto-approve safe state transition tools
  const shouldAutoApprove =
    ALWAYS_APPROVE_TOOLS.has(toolName) && !(session.bypassDisabled && toolName === "ExitPlanMode");

  if (shouldAutoApprove) {
    log.info("Auto-approving safe tool", {
      tool: toolName,
      requestId: msg.request_id.slice(0, 8),
    });
    handlePermissionResponse(bridge, session, {
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
  try {
    getOrCreatePulse(session.id).setBlocked(true);
  } catch {
    /* */
  }

  broadcastToAll(session, {
    type: "permission_request",
    request: perm,
  });

  // Start auto-approve timer
  startAutoApproveTimer(bridge, session, perm);
}

// ─── Auto-Approve Timer ─────────────────────────────────────────────────────

/** Start a timer to auto-approve a permission request after the configured timeout. */
function startAutoApproveTimer(
  bridge: PermissionBridge,
  session: ActiveSession,
  perm: PermissionRequest,
): void {
  const config = session.autoApproveConfig;
  if (!config.enabled || config.timeoutSeconds <= 0) return;

  // Never auto-approve tools requiring user decision
  if (NEVER_AUTO_APPROVE_TOOLS.has(perm.tool_name)) return;

  // Skip Bash if allowBash is false
  if (perm.tool_name === "Bash" && !config.allowBash) return;

  const timer = setTimeout(() => {
    session.autoApproveTimers.delete(perm.request_id);
    if (!session.pendingPermissions.has(perm.request_id)) return;

    log.info("Auto-approving after timeout", {
      tool: perm.tool_name,
      timeoutSeconds: config.timeoutSeconds,
    });

    handlePermissionResponse(bridge, session, {
      request_id: perm.request_id,
      behavior: "allow",
    });
  }, config.timeoutSeconds * 1000);

  session.autoApproveTimers.set(perm.request_id, timer);
}

// ─── Interrupt ──────────────────────────────────────────────────────────────

/** Handle user interrupt request — abort current CLI/SDK operation. */
export function handleInterrupt(bridge: PermissionBridge, session: ActiveSession): void {
  // SDK engine path: use query.interrupt()
  const sdkHandle = bridge.sdkHandles.get(session.id);
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
  bridge.sendToCLI(session, ndjson);
}

// ─── Hook Events ────────────────────────────────────────────────────────────

/** Handle an incoming HTTP hook event from Claude Code CLI. */
export function handleHookEvent(
  session: ActiveSession,
  event: HookEvent,
): { found: boolean; decision?: PreToolUseResponse } {
  const timestamp = event.timestamp ?? Date.now();

  // Broadcast hook event to all subscribers (browser, Telegram)
  broadcastToAll(session, {
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
    sessionId: session.id,
    type: event.type,
    tool: event.tool_name,
  });

  // PreToolUse: default allow
  if (event.type === "PreToolUse") {
    return { found: true, decision: { decision: "allow" } };
  }

  return { found: true };
}
