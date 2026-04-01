/**
 * Claude Code HTTP Hook types.
 *
 * Claude Code can send HTTP POST requests to configured hook URLs
 * on specific events (PreToolUse, PostToolUse, Stop, Notification).
 * Companion registers itself as a hook receiver to get richer event data.
 *
 * Ref: Claude Code settings.json hooks format (public/stable API).
 */

// ─── Hook Event Types ───────────────────────────────────────────────────────

export type HookEventType = "PreToolUse" | "PostToolUse" | "Stop" | "Notification";

/** Incoming hook event from Claude Code */
export interface HookEvent {
  /** Hook type */
  type: HookEventType;
  /** Session ID (CLI internal) */
  session_id: string;
  /** Tool name (for PreToolUse/PostToolUse) */
  tool_name?: string;
  /** Tool input parameters */
  tool_input?: Record<string, unknown>;
  /** Tool output/result (for PostToolUse) */
  tool_output?: string;
  /** Whether tool errored (for PostToolUse) */
  tool_error?: boolean;
  /** Stop reason (for Stop events) */
  stop_reason?: string;
  /** Notification message (for Notification events) */
  message?: string;
  /** Timestamp */
  timestamp?: number;
}

// ─── Hook Response Types ────────────────────────────────────────────────────

/** Response to PreToolUse — can block or modify the tool call */
export interface PreToolUseResponse {
  /** Whether to proceed with the tool call */
  decision: "allow" | "deny" | "modify";
  /** Reason for decision (shown to user) */
  reason?: string;
  /** Modified tool input (only when decision is "modify") */
  modified_input?: Record<string, unknown>;
}

/** Response to other hook types — simple acknowledgment */
export interface HookAckResponse {
  /** Whether the hook was processed successfully */
  ok: boolean;
}

export type HookResponse = PreToolUseResponse | HookAckResponse;

// ─── Hook Configuration ─────────────────────────────────────────────────────

/** Hook configuration for Claude Code settings */
export interface HookConfig {
  type: "http";
  url: string;
  /** Optional: only fire for specific tool names */
  tool_names?: string[];
}

/** Full hooks section of Claude Code settings */
export interface HooksSettings {
  PreToolUse?: HookConfig[];
  PostToolUse?: HookConfig[];
  Stop?: HookConfig[];
  Notification?: HookConfig[];
}

// ─── Browser Messages for Hook Events ───────────────────────────────────────

/** Hook event broadcast to browser/subscribers */
export interface HookEventBroadcast {
  type: "hook_event";
  hookType: HookEventType;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolError?: boolean;
  message?: string;
  timestamp: number;
}
