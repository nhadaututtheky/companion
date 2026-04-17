// Types for the WebSocket bridge between Claude Code CLI and browser/Telegram

// ─── CLI Message Types (NDJSON from Claude Code CLI) ─────────────────────────

export interface CLISystemInitMessage {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  permissionMode: string;
  claude_code_version: string;
  slash_commands: string[];
  uuid: string;
}

export interface CLISystemStatusMessage {
  type: "system";
  subtype: "status";
  status: "compacting" | null;
  permissionMode?: string;
  uuid: string;
  session_id: string;
}

export interface CLIAssistantMessage {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: string | null;
    usage: TokenUsage;
  };
  parent_tool_use_id: string | null;
  error?: string;
  uuid: string;
  session_id: string;
}

export interface CLIResultMessage {
  type: "result";
  subtype: "success" | "error_during_execution" | "error_max_turns" | "error_max_budget_usd";
  is_error: boolean;
  result?: string;
  errors?: string[];
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  stop_reason: string | null;
  usage: TokenUsage;
  total_lines_added?: number;
  total_lines_removed?: number;
  uuid: string;
  session_id: string;
}

export interface CLIStreamEventMessage {
  type: "stream_event";
  event: unknown;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

export interface CLIToolProgressMessage {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  uuid: string;
  session_id: string;
}

export interface CLIControlRequestMessage {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name?: string;
    input?: Record<string, unknown>;
    permission_suggestions?: PermissionUpdate[];
    description?: string;
    tool_use_id?: string;
  };
}

export interface CLIKeepAliveMessage {
  type: "keep_alive";
}

export type CLIMessage =
  | CLISystemInitMessage
  | CLISystemStatusMessage
  | CLIAssistantMessage
  | CLIResultMessage
  | CLIStreamEventMessage
  | CLIToolProgressMessage
  | CLIControlRequestMessage
  | CLIKeepAliveMessage
  | { type: "user"; message: { role: "user"; content: string } };

// ─── Content Block Types ─────────────────────────────────────────────────────

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | ContentBlock[];
      is_error?: boolean;
    }
  | { type: "thinking"; thinking: string; budget_tokens?: number };

// ─── Token Usage ─────────────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

// ─── Browser Messages (browser <-> bridge) ───────────────────────────────────

/** Messages the browser/client sends TO the bridge */
export type BrowserOutgoingMessage =
  | {
      type: "user_message";
      content: string;
      session_id?: string;
      /** Base64-encoded images attached from web UI */
      images?: Array<{ data: string; mediaType: string; name: string }>;
    }
  | {
      type: "permission_response";
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: PermissionUpdate[];
    }
  | { type: "interrupt" }
  | { type: "set_model"; model: string }
  | { type: "set_auto_approve"; config: AutoApproveConfig }
  | { type: "set_thinking_mode"; mode: ThinkingMode }
  | { type: "set_context_mode"; mode: ContextMode };

/** Messages the bridge sends TO the browser/client */
export type BrowserIncomingMessage =
  | { type: "session_init"; session: SessionState }
  | { type: "session_update"; session: Partial<SessionState> }
  | {
      type: "assistant";
      message: CLIAssistantMessage["message"];
      parent_tool_use_id: string | null;
      timestamp: number;
    }
  | {
      type: "stream_event";
      event: unknown;
      parent_tool_use_id: string | null;
    }
  | {
      type: "stream_event_batch";
      events: Array<{ event: unknown; parent_tool_use_id?: string }>;
    }
  | { type: "result"; data: CLIResultMessage }
  | { type: "permission_request"; request: PermissionRequest }
  | { type: "permission_cancelled"; request_id: string }
  | {
      type: "tool_progress";
      tool_use_id: string;
      tool_name: string;
      elapsed_time_seconds: number;
    }
  | { type: "status_change"; status: SessionStatus }
  | { type: "error"; message: string }
  | { type: "cli_disconnected"; exitCode?: number; reason?: string }
  | { type: "cli_connected" }
  | { type: "user_message"; content: string; timestamp: number; source?: string }
  | { type: "message_history"; messages: BrowserIncomingMessage[] }
  | { type: "context_update"; contextUsedPercent: number; totalTokens: number; maxTokens: number }
  | {
      type: "cost_warning";
      level: "warning" | "critical";
      costUsd: number;
      budgetUsd: number;
      message: string;
    }
  | { type: "budget_exceeded"; budget: number; spent: number }
  | { type: "budget_warning"; budget: number; spent: number; percentage: number }
  | { type: "compact_handoff"; stage: "summarizing" | "compacting" | "done"; message: string }
  | {
      type: "hook_event";
      hookType: string;
      toolName?: string;
      toolInput?: Record<string, unknown>;
      toolOutput?: string;
      toolError?: boolean;
      message?: string;
      timestamp: number;
    }
  | { type: "lock_status"; locked: boolean; owner: string | null; queueSize: number }
  | { type: "session_idle"; sessionId: string; idleDurationMs: number }
  | { type: "idle_warning"; remainingMs: number; message: string }
  | {
      type: "prompt_scan";
      risks: Array<{ category: string; severity: string; description: string; matched: string }>;
      blocked: boolean;
    }
  | { type: "spectator_count"; count: number }
  | {
      type: "graph:activity";
      sessionId: string;
      filePaths: string[];
      nodeIds: string[];
      toolName: string;
      toolAction: "read" | "modify" | "create";
      timestamp: number;
    }
  | {
      type: "pulse:update";
      sessionId: string;
      score: number;
      state: "flow" | "focused" | "cautious" | "struggling" | "spiraling" | "blocked";
      trend: "improving" | "stable" | "degrading";
      signals: Record<string, number>;
      topSignal: string;
      turn: number;
      timestamp: number;
    }
  | {
      type: "context_breakdown";
      breakdown: {
        totalTokens: number;
        maxTokens: number;
        percent: number;
        sources: Array<{
          label: string;
          tokens: number;
          count: number;
          details?: string[];
        }>;
      };
    }
  | {
      type: "child_spawned";
      childSessionId: string;
      childShortId: string;
      childName: string;
      childRole: string;
      childModel: string;
    }
  | {
      type: "child_ended";
      childSessionId: string;
      childShortId?: string;
      childName?: string;
      childRole?: string;
      status: string;
    };

// ─── Session State ───────────────────────────────────────────────────────────

export type SessionStatus =
  | "starting"
  | "connected"
  | "idle"
  | "busy"
  | "compacting"
  | "plan_mode"
  | "ended"
  | "error";

// ─── Session State Machine ────────────────────────────────────────────────

/** Valid transitions map — defines which status transitions are allowed */
export const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  starting: ["connected", "ended", "error"],
  connected: ["idle", "ended", "error"],
  idle: ["busy", "compacting", "plan_mode", "ended", "error"],
  busy: ["idle", "compacting", "plan_mode", "ended", "error"],
  compacting: ["idle", "busy", "ended", "error"],
  plan_mode: ["idle", "busy", "ended", "error"],
  ended: [], // terminal state
  error: ["starting", "ended"], // can retry or finalize
};

/** Guard: can this session accept a new user message? */
export function canAcceptUserMessage(status: SessionStatus): boolean {
  return status === "idle" || status === "plan_mode";
}

/** Guard: is the session in a terminal state? */
export function isTerminal(status: SessionStatus): boolean {
  return status === "ended" || status === "error";
}

/** Guard: is the session idle (not processing anything)? */
export function isIdle(status: SessionStatus): boolean {
  return status === "idle" || status === "plan_mode";
}

export type CompactMode = "manual" | "smart" | "aggressive";

export interface SessionState {
  session_id: string;
  /** Short memorable ID for @mentions (e.g. "fox", "bear") */
  short_id?: string;
  /** User-defined session name (persists after session end) */
  name?: string;
  /** Where this session was created from */
  source?: "web" | "telegram" | "api" | "agent";
  /** Parent session ID (multi-brain workspace) */
  parent_id?: string;
  /** Agent role in multi-brain workspace */
  role?: "coordinator" | "specialist" | "researcher" | "reviewer";
  /** CLI platform used for this session */
  cli_platform?: import("./cli-adapter").CLIPlatform;
  model: string;
  cwd: string;
  tools: string[];
  permissionMode: string;
  claude_code_version: string;
  mcp_servers: { name: string; status: string }[];
  total_cost_usd: number;
  num_turns: number;
  total_lines_added: number;
  total_lines_removed: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  files_read: string[];
  files_modified: string[];
  files_created: string[];
  started_at: number;
  status: SessionStatus;
  /** Whether Claude is in plan mode (for stuck detection) */
  is_in_plan_mode: boolean;

  // Session management config
  /** Cost warning threshold in USD (null/undefined = no budget) */
  cost_budget_usd?: number;
  /** Budget warning state: 0=none, 1=warned at 80%, 2=warned at 100% */
  cost_warned: number;
  /** Compact mode: manual | smart | aggressive */
  compact_mode: CompactMode;
  /** Context % threshold to trigger compact (default 75) */
  compact_threshold: number;
  /** Thinking mode: adaptive (default), off, or deep */
  thinking_mode: ThinkingMode;
  /** Context window mode: "200k" (default) or "1m" (Opus 4.7/4.6, Sonnet 4.6). */
  context_mode?: ContextMode;

  // RTK (Runtime Token Keeper) metrics
  /** Estimated tokens saved by RTK compression this session */
  rtk_tokens_saved?: number;
  /** Number of tool outputs compressed by RTK */
  rtk_compressions?: number;
  /** Number of cache hits (re-used compressed outputs) */
  rtk_cache_hits?: number;
}

// ─── Permission Types ────────────────────────────────────────────────────────

export type PermissionDestination =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "session";

export type PermissionUpdate =
  | {
      type: "addRules";
      rules: { toolName: string; ruleContent?: string }[];
      behavior: "allow" | "deny" | "ask";
      destination: PermissionDestination;
    }
  | {
      type: "replaceRules";
      rules: { toolName: string; ruleContent?: string }[];
      behavior: "allow" | "deny" | "ask";
      destination: PermissionDestination;
    }
  | { type: "setMode"; mode: string; destination: PermissionDestination };

export interface PermissionRequest {
  request_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  permission_suggestions?: PermissionUpdate[];
  description?: string;
  tool_use_id: string;
  timestamp: number;
}

// ─── Thinking Mode ──────────────────────────────────────────────────────────

/**
 * Companion thinking-mode UI labels. Mapped to Claude Code CLI `--effort` flag:
 *   off → low (minimum reasoning, latency-sensitive)
 *   adaptive → omit (model picks per turn)
 *   deep → max (deepest reasoning, Opus 4.7 default = xhigh)
 *
 * The previous `--thinking-budget <n>` flag was removed from Claude Code CLI.
 */
export type ThinkingMode = "adaptive" | "off" | "deep";

/** Claude Code `--effort` level — returned by `thinkingModeToEffort`. */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Map ThinkingMode → Claude Code `--effort` value.
 * `undefined` means omit the flag (use model's configured default).
 */
export function thinkingModeToEffort(
  mode: ThinkingMode | undefined,
): EffortLevel | undefined {
  switch (mode) {
    case "off":
      return "low";
    case "deep":
      return "max";
    case "adaptive":
    default:
      return undefined;
  }
}

/**
 * @deprecated kept for backward compatibility — old callers should migrate
 * to `thinkingModeToEffort`. The CLI no longer accepts `--thinking-budget`.
 */
export function thinkingModeTobudget(mode: ThinkingMode): number | undefined {
  switch (mode) {
    case "off":
      return 0;
    case "deep":
      return 50000;
    case "adaptive":
    default:
      return undefined;
  }
}

/** Models that support extended thinking via --effort. Anthropic docs 2026. */
export function modelSupportsDeepThinking(model: string): boolean {
  if (!model) return false;
  const bare = model.replace(/\[1m\]$/i, "");
  if (bare === "opus" || bare === "sonnet") return true;
  if (bare.includes("opus") && (bare.includes("4-7") || bare.includes("4-6"))) return true;
  if (bare.includes("sonnet") && bare.includes("4-6")) return true;
  return false;
}

/** Available thinking modes for the model's `/effort` support. */
export function getAvailableThinkingModes(model: string): ThinkingMode[] {
  return modelSupportsDeepThinking(model)
    ? ["adaptive", "off", "deep"]
    : ["adaptive", "off"];
}

// ─── Context Mode (200K vs 1M) ──────────────────────────────────────────────

/**
 * Companion context-mode selector. Claude Code CLI default is 200K; user opts
 * into 1M by appending `[1m]` to the model ID (e.g. `claude-opus-4-7[1m]`).
 * Only Opus 4.7 / 4.6 / Sonnet 4.6 support 1M — others silently stay at 200K.
 */
export type ContextMode = "200k" | "1m";

// ─── Auto-Approve Config ─────────────────────────────────────────────────

export interface AutoApproveConfig {
  enabled: boolean;
  timeoutSeconds: number;
  allowBash: boolean;
}

// ─── Project Profile ─────────────────────────────────────────────────────────

export interface ProjectProfile {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
  envVars?: Record<string, string>;
}

// ─── REST API Types ──────────────────────────────────────────────────────────

export interface CreateSessionRequest {
  projectDir: string;
  model?: string;
  permissionMode?: string;
  prompt?: string;
  resume?: boolean;
  /** Bare mode — minimal output, lower cost. Maps to --bare CLI flag. */
  bare?: boolean;
  /** Thinking mode: adaptive (default), off, or deep (→ --effort max) */
  thinkingMode?: ThinkingMode;
  /** Context window: "200k" (default) or "1m" (adds [1m] model suffix). */
  contextMode?: ContextMode;
  /** CLI platform to use (default: "claude") */
  cliPlatform?: import("./cli-adapter").CLIPlatform;
  /** Platform-specific options (approval mode, sandbox, etc.) */
  platformOptions?: Record<string, unknown>;
}

export interface SessionListItem {
  id: string;
  /** Short memorable ID for @mentions (e.g. "fox", "bear") */
  shortId?: string;
  /** User-defined session name */
  name?: string;
  /** CLI platform used for this session */
  cliPlatform?: import("./cli-adapter").CLIPlatform;
  projectSlug?: string;
  model: string;
  status: SessionStatus;
  cwd: string;
  total_cost_usd: number;
  num_turns: number;
  startedAt: number;
  endedAt?: number;
  /** Session tags for filtering/organization */
  tags?: string[];
  /** Expert Mode persona ID (e.g. "tim-cook", "staff-sre") */
  personaId?: string;
  /** Parent session ID (multi-brain workspace) */
  parentId?: string;
  /** Agent role in multi-brain workspace */
  role?: "coordinator" | "specialist" | "researcher" | "reviewer";
}
