/**
 * CLI Adapter Types — Abstraction layer for multi-CLI platform support.
 * Supports Claude Code, Codex, Gemini CLI, OpenCode, and API providers.
 */

// ─── Platform Types ─────────────────────────────────────────────────────────

export type CLIPlatform = "claude" | "codex" | "gemini" | "opencode";

export interface CLICapabilities {
  /** Can resume a previous session? */
  supportsResume: boolean;
  /** Streams partial responses in real-time? */
  supportsStreaming: boolean;
  /** Has file read/write and terminal access? */
  supportsTools: boolean;
  /** Supports Model Context Protocol? */
  supportsMCP: boolean;
  /** Native output format from the CLI */
  outputFormat: "ndjson" | "json" | "text";
  /** How to send user messages to the CLI */
  inputFormat: "ndjson" | "text";
  /** Can specify model via flag? */
  supportsModelFlag: boolean;
  /** Extended thinking/reasoning support? */
  supportsThinking: boolean;
  /** Can run in interactive multi-turn mode (stdin stays open)? */
  supportsInteractive: boolean;
}

// ─── Normalized Message ─────────────────────────────────────────────────────

/**
 * Platform-agnostic message format.
 * All CLI adapters normalize their output into this shape.
 * ws-bridge.ts works with this type instead of raw Claude NDJSON.
 */
export interface NormalizedMessage {
  type:
    | "system_init"
    | "status"
    | "assistant"
    | "tool_use"
    | "tool_result"
    | "progress"
    | "cost"
    | "error"
    | "complete"
    | "control_request"
    | "keep_alive";
  platform: CLIPlatform;

  // ── system_init fields ──
  sessionId?: string;
  cwd?: string;
  tools?: string[];
  model?: string;
  cliVersion?: string;
  permissionMode?: string;

  // ── status fields ──
  status?: "compacting" | "idle" | null;

  // ── assistant fields ──
  content?: string;
  contentBlocks?: ContentBlockNorm[];
  stopReason?: string | null;

  // ── tool_use / tool_result fields ──
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  toolIsError?: boolean;
  elapsedSeconds?: number;

  // ── control_request fields ──
  requestId?: string;
  request?: {
    subtype: string;
    tool_name?: string;
    input?: Record<string, unknown>;
    description?: string;
    tool_use_id?: string;
    permission_suggestions?: unknown[];
  };

  // ── cost / usage fields ──
  costUsd?: number;
  tokenUsage?: {
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  };
  durationMs?: number;
  numTurns?: number;

  // ── result fields ──
  isError?: boolean;
  resultText?: string;
  linesAdded?: number;
  linesRemoved?: number;

  // ── error fields ──
  errorMessage?: string;

  /** Original raw message for platform-specific handling */
  raw?: unknown;
}

/** Normalized content block (subset of Claude's ContentBlock) */
export type ContentBlockNorm =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; thinking: string; budget_tokens?: number };

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface AdapterLaunchOptions {
  sessionId: string;
  cwd: string;
  model?: string;
  prompt?: string;
  resume?: boolean;
  cliSessionId?: string;
  permissionMode?: string;
  /** @deprecated — CLI removed `--thinking-budget`. Use `effort` instead. */
  thinkingBudget?: number;
  /** Claude Code `--effort` value: "low" | "medium" | "high" | "xhigh" | "max". */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Context window mode for Claude — "1m" appends `[1m]` suffix when supported. */
  contextMode?: "200k" | "1m";
  envVars?: Record<string, string>;
  /** Platform-specific options */
  platformOptions?: Record<string, unknown>;
  // ── Claude-specific (passthrough) ──
  hooksUrl?: string;
  hookSecret?: string;
  bare?: boolean;
}

export interface CLIProcess {
  pid: number;
  /** Write a message to the CLI's stdin */
  send: (data: string) => void;
  /** Kill the CLI process */
  kill: () => void;
  /** Promise that resolves when process exits */
  exited: Promise<number>;
  /** Check if the process is still alive */
  isAlive: () => boolean;
  /** Get last N lines from stderr (for error diagnostics) */
  getStderrLines: () => string[];
}

export interface CLIDetectResult {
  available: boolean;
  version?: string;
  path?: string;
}

/**
 * CLIAdapter — Abstract interface for AI coding CLI platforms.
 * Each platform (Claude, Codex, Gemini, OpenCode) implements this.
 */
export interface CLIAdapter {
  readonly platform: CLIPlatform;
  readonly capabilities: CLICapabilities;

  /** Check if this CLI is installed and available on the system */
  detect(): Promise<CLIDetectResult>;

  /**
   * Spawn a new CLI process.
   * @param opts Launch configuration
   * @param onMessage Called for each normalized message from the CLI
   * @param onExit Called when the CLI process exits
   */
  launch(
    opts: AdapterLaunchOptions,
    onMessage: (msg: NormalizedMessage) => void,
    onExit: (code: number) => void,
  ): Promise<CLIProcess>;

  /**
   * Format a user message for this CLI's stdin protocol.
   * e.g., Claude expects NDJSON, others may expect plain text.
   */
  formatUserMessage(content: string): string;
}
