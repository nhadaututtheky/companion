import type { CLIPlatform } from "./cli-adapter";

/** A session discovered by scanning the filesystem (~/.claude, ~/.codex, etc.) */
export interface ScannedSession {
  /** Session UUID (from JSONL or filename) */
  id: string;
  /** Agent type that created this session */
  agentType: CLIPlatform;
  /** Working directory of the session */
  cwd: string;
  /** Project path decoded from directory name */
  projectPath?: string;
  /** Timestamp when session started (ms) */
  startedAt: number;
  /** Timestamp of last file modification (ms) */
  lastActivityAt: number;
  /** First user message (truncated to 300 chars) */
  firstPrompt: string;
  /** Approximate conversation turn count */
  turnCount: number;
  /** Whether session is currently active */
  isActive: boolean;
  /** Whether this session is also tracked in Companion DB */
  isTracked: boolean;
}

export interface ScannedSessionDetail extends ScannedSession {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
}

export interface ScanSessionsParams {
  agentType?: CLIPlatform;
  projectPath?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ScanSessionsResponse {
  sessions: ScannedSession[];
  total: number;
  projects: string[];
}
