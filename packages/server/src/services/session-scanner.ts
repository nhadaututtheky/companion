/**
 * Session Scanner — discovers AI coding sessions from multiple sources.
 *
 * Delegates to per-platform scanners:
 *  - scan-claude.ts  → Claude Code CLI + VS Code extension
 *  - scan-codex.ts   → Codex rollout JSONL files
 *  - scan-opencode.ts → OpenCode SQLite DB via CLI
 */
import type {
  CLIPlatform,
  ScannedSession,
  ScannedSessionDetail,
  ScanSessionsParams,
  ScanSessionsResponse,
} from "@companion/shared";
import {
  scanClaudeSessions,
  scanClaudeVSCodeSessions,
  getClaudeSessionDetail,
} from "./scanner/scan-claude.js";
import { scanCodexSessions, getCodexSessionDetail } from "./scanner/scan-codex.js";
import {
  scanOpenCodeSessions,
  getOpenCodeSessionDetail,
  resetOpenCodeDetection,
} from "./scanner/scan-opencode.js";

// ─── Cache ────────────────────────────────────────────────────────────────────

interface ScanCache {
  sessions: ScannedSession[];
  projects: string[];
  timestamp: number;
}

const CACHE_TTL = 30_000;
let cache: ScanCache | null = null;

export function clearScanCache(): void {
  cache = null;
  resetOpenCodeDetection();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanSessions(params: ScanSessionsParams): Promise<ScanSessionsResponse> {
  let sessions = await getAllSessions();

  if (params.agentType) {
    sessions = sessions.filter((s) => s.agentType === params.agentType);
  }

  if (params.projectPath) {
    const pp = params.projectPath.toLowerCase();
    sessions = sessions.filter(
      (s) => s.projectPath?.toLowerCase().includes(pp) || s.cwd.toLowerCase().includes(pp),
    );
  }

  if (params.query) {
    const q = params.query.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.firstPrompt.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q),
    );
  }

  sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  const total = sessions.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const projects = getUniqueProjects(sessions);

  return {
    sessions: sessions.slice(offset, offset + limit),
    total,
    projects,
  };
}

export async function getScannedSessionDetail(
  agentType: CLIPlatform,
  sessionId: string,
): Promise<ScannedSessionDetail | null> {
  switch (agentType) {
    case "claude":
      return getClaudeSessionDetail(sessionId);
    case "codex":
      return getCodexSessionDetail(sessionId);
    case "opencode":
      return getOpenCodeSessionDetail(sessionId);
    default:
      return null;
  }
}

export function getResumeCommand(agentType: CLIPlatform, sessionId: string): string {
  switch (agentType) {
    case "claude":
      return `claude --resume ${sessionId}`;
    case "codex":
      return `codex resume ${sessionId}`;
    case "opencode":
      return `opencode --session ${sessionId} --continue`;
    case "gemini":
      return `gemini`;
    default:
      return "";
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function getUniqueProjects(sessions: ScannedSession[]): string[] {
  const projects = new Set<string>();
  for (const s of sessions) {
    const p = s.projectPath || s.cwd;
    const name = p.split(/[\\/]/).pop();
    if (name) projects.add(name);
  }
  return [...projects].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function getAllSessions(): Promise<ScannedSession[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.sessions;
  }

  const results = await Promise.allSettled([
    scanClaudeSessions(),
    scanClaudeVSCodeSessions(),
    scanCodexSessions(),
    scanOpenCodeSessions(),
  ]);

  const sessions: ScannedSession[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      sessions.push(...result.value);
    }
  }

  const projects = getUniqueProjects(sessions);
  cache = { sessions, projects, timestamp: Date.now() };
  return sessions;
}
