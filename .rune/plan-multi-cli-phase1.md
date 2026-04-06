# Phase 1: CLI Adapter Interface

## Goal
Extract the Claude-specific spawn logic from `cli-launcher.ts` into an adapter pattern, creating a shared `CLIAdapter` interface that any CLI platform can implement.

## Tasks
- [ ] Define `CLIAdapter` interface in `packages/shared/src/types/cli-adapter.ts`
- [ ] Define `NormalizedMessage` type (superset of all CLI output formats)
- [ ] Define `CLICapabilities` type (what each CLI supports: resume, tools, streaming, etc.)
- [ ] Create `packages/server/src/services/adapters/` directory
- [ ] Extract Claude-specific logic → `adapters/claude-adapter.ts`
- [ ] Create `adapters/adapter-registry.ts` — maps CLI platform ID → adapter factory
- [ ] Refactor `cli-launcher.ts` to use adapter registry instead of hardcoded Claude spawn
- [ ] Refactor `ws-bridge.ts` message handlers to work with `NormalizedMessage`
- [ ] Add `cliPlatform` field to session DB schema + `SessionState` type
- [ ] Verify all existing Claude sessions work identically after refactor

## Key Types
```typescript
// packages/shared/src/types/cli-adapter.ts

export type CLIPlatform = "claude" | "codex" | "opencode";

export interface CLICapabilities {
  supportsResume: boolean;      // Can resume previous session?
  supportsStreaming: boolean;    // Streams partial responses?
  supportsTools: boolean;       // File read/write, terminal, etc.
  supportsMCP: boolean;         // Model Context Protocol?
  outputFormat: "ndjson" | "json" | "text"; // Native output format
  inputFormat: "ndjson" | "text";           // How to send user messages
  supportsModel: boolean;       // Can specify model via flag?
  supportsThinking: boolean;    // Extended thinking support?
}

export interface NormalizedMessage {
  type: "system_init" | "assistant" | "tool_use" | "tool_result" 
      | "progress" | "cost" | "error" | "complete";
  platform: CLIPlatform;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: string;
  costUsd?: number;
  tokenUsage?: { input: number; output: number };
  raw?: unknown; // Original message for platform-specific handling
}

export interface CLIAdapter {
  platform: CLIPlatform;
  capabilities: CLICapabilities;
  
  /** Check if this CLI is installed and available */
  detect(): Promise<{ available: boolean; version?: string; path?: string }>;
  
  /** Spawn a new CLI process */
  launch(opts: AdapterLaunchOptions): Promise<CLIProcess>;
  
  /** Parse a raw output line into NormalizedMessage */
  parseOutput(line: string): NormalizedMessage | null;
  
  /** Format a user message for this CLI's stdin */
  formatInput(message: string): string;
}

export interface CLIProcess {
  pid: number;
  send(message: string): void;
  kill(signal?: string): void;
  isAlive(): boolean;
  onMessage: (cb: (msg: NormalizedMessage) => void) => void;
  onExit: (cb: (code: number) => void) => void;
  exited: Promise<number>;
}

export interface AdapterLaunchOptions {
  sessionId: string;
  cwd: string;
  model?: string;
  prompt?: string;
  resume?: boolean;
  permissionMode?: string;
  thinkingBudget?: number;
  env?: Record<string, string>; // Extra env vars (API keys, etc.)
}
```

## Acceptance Criteria
- [ ] All existing Claude sessions pass through the new adapter layer transparently
- [ ] `CLIAdapter` interface is generic enough for Codex/OpenCode (no Claude-specific leaks)
- [ ] Session DB tracks which platform was used
- [ ] `ws-bridge.ts` works with `NormalizedMessage`, not raw Claude NDJSON
- [ ] adapter-registry returns available adapters with `detect()` results

## Files Touched
- `packages/shared/src/types/cli-adapter.ts` — new
- `packages/server/src/services/adapters/claude-adapter.ts` — new (extracted from cli-launcher)
- `packages/server/src/services/adapters/adapter-registry.ts` — new
- `packages/server/src/services/cli-launcher.ts` — heavy refactor
- `packages/server/src/services/ws-bridge.ts` — modify message handlers
- `packages/shared/src/types/session.ts` — add `cliPlatform` to SessionState
- DB migration — add `cli_platform` column to sessions table

## Dependencies
- None (foundation phase)
