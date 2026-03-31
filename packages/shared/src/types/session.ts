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
  subtype:
    | "success"
    | "error_during_execution"
    | "error_max_turns"
    | "error_max_budget_usd";
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
  | { type: "user_message"; content: string; session_id?: string }
  | {
      type: "permission_response";
      request_id: string;
      behavior: "allow" | "deny";
      updated_permissions?: PermissionUpdate[];
    }
  | { type: "interrupt" }
  | { type: "set_model"; model: string }
  | { type: "set_auto_approve"; config: AutoApproveConfig };

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
  | { type: "user_message"; content: string; timestamp: number }
  | { type: "message_history"; messages: BrowserIncomingMessage[] }
  | { type: "context_update"; contextUsedPercent: number; totalTokens: number; maxTokens: number }
  | { type: "cost_warning"; level: "warning" | "critical"; costUsd: number; budgetUsd: number; message: string }
  | { type: "budget_exceeded"; budget: number; spent: number }
  | { type: "budget_warning"; budget: number; spent: number; percentage: number }
  | { type: "compact_handoff"; stage: "summarizing" | "compacting" | "done"; message: string };

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

export type CompactMode = "manual" | "smart" | "aggressive";

export interface SessionState {
  session_id: string;
  /** Short memorable ID for @mentions (e.g. "fox", "bear") */
  short_id?: string;
  /** User-defined session name (persists after session end) */
  name?: string;
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
}

export interface SessionListItem {
  id: string;
  /** Short memorable ID for @mentions (e.g. "fox", "bear") */
  shortId?: string;
  /** User-defined session name */
  name?: string;
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
}
