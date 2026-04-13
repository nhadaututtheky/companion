/**
 * Session Scanner — discovers AI coding sessions from the filesystem.
 *
 * Scans:
 *  - ~/.claude/projects/  (Claude Code JSONL files)
 *  - ~/.codex/sessions/   (Codex rollout JSONL files)
 *  - ~/.codex/history.jsonl (Codex prompt history)
 *
 * Adapted from 1DevTool's ResumeManager pattern.
 */
import { readdir, stat, open, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  CLIPlatform,
  ScannedSession,
  ScannedSessionDetail,
  ScanSessionsParams,
  ScanSessionsResponse,
} from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("session-scanner");

// ─── Cache ────────────────────────────────────────────────────────────────────

interface ScanCache {
  sessions: ScannedSession[];
  projects: string[];
  timestamp: number;
}

const CACHE_TTL = 30_000; // 30s
let cache: ScanCache | null = null;

export function clearScanCache(): void {
  cache = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanSessions(params: ScanSessionsParams): Promise<ScanSessionsResponse> {
  let sessions = await getAllSessions();

  // Filter by agentType
  if (params.agentType) {
    sessions = sessions.filter((s) => s.agentType === params.agentType);
  }

  // Filter by projectPath
  if (params.projectPath) {
    const pp = params.projectPath.toLowerCase();
    sessions = sessions.filter(
      (s) => s.projectPath?.toLowerCase().includes(pp) || s.cwd.toLowerCase().includes(pp),
    );
  }

  // Filter by query (search in firstPrompt, id, cwd)
  if (params.query) {
    const q = params.query.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.firstPrompt.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q),
    );
  }

  // Sort by most recent first
  sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  const total = sessions.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;

  // Extract unique projects
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

// ─── Claude Code ──────────────────────────────────────────────────────────────

/**
 * Decode a Claude project directory name back to the original absolute path.
 * Claude encodes paths by replacing path separators with '-'.
 * On Windows: D:\Project\Companion → D--Project-Companion
 */
function decodeClaudeProjectPath(encodedDirName: string): string {
  // Windows-style: "D--Project-Companion" → "D:\Project\Companion"
  const windowsMatch = encodedDirName.match(/^([A-Z])--(.*)/);
  if (windowsMatch) {
    const drive = windowsMatch[1]!;
    const rest = windowsMatch[2]!.replace(/-/g, "\\");
    return `${drive}:\\${rest}`;
  }

  // Unix-style: "-home-user-project" → "/home/user/project"
  if (encodedDirName.startsWith("-")) {
    return "/" + encodedDirName.slice(1).replace(/-/g, "/");
  }

  return encodedDirName;
}

async function scanClaudeSessions(): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = [];
  const claudeDir = path.join(os.homedir(), ".claude", "projects");

  try {
    const projectDirs = await readdir(claudeDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(claudeDir, dir.name);
      const decodedPath = decodeClaudeProjectPath(dir.name);

      try {
        const files = await readdir(projectDir);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

        for (const file of jsonlFiles) {
          try {
            const filePath = path.join(projectDir, file);
            const session = await parseClaudeSessionFile(filePath, decodedPath);
            if (session) sessions.push(session);
          } catch {
            // Skip unparseable files
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  } catch {
    // Claude directory doesn't exist
  }

  return sessions;
}

async function parseClaudeSessionFile(
  filePath: string,
  projectPath: string,
): Promise<ScannedSession | null> {
  const fileStat = await stat(filePath);
  const handle = await open(filePath, "r");

  try {
    // Read first 16KB to extract metadata efficiently
    const buffer = Buffer.alloc(16384);
    const { bytesRead } = await handle.read(buffer, 0, 16384, 0);
    const chunk = buffer.toString("utf8", 0, bytesRead);
    const lines = chunk.split("\n").filter((l) => l.trim());

    let sessionId = "";
    let firstPrompt = "";
    let lastAssistantMsg = "";
    let startedAt = 0;
    let messageCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === "summary") {
          sessionId = entry.sessionId || "";
          continue;
        }

        // Extract sessionId from any entry
        if (!sessionId && entry.sessionId) {
          sessionId = entry.sessionId;
        }

        if (entry.type === "user" || entry.role === "user") {
          messageCount++;
          if (!firstPrompt) {
            firstPrompt = extractClaudeText(entry);
            if (!startedAt && entry.timestamp) {
              startedAt = new Date(entry.timestamp).getTime();
            }
          }
        }

        if (entry.type === "assistant" || entry.role === "assistant") {
          messageCount++;
          const text = extractClaudeText(entry);
          if (text) lastAssistantMsg = text;
        }
      } catch {
        // Skip unparseable lines
      }
    }

    // Also read the last 8KB for the most recent message
    const fileSize = fileStat.size;
    if (fileSize > 16384) {
      const tailBuffer = Buffer.alloc(8192);
      const tailOffset = Math.max(0, fileSize - 8192);
      const { bytesRead: tailRead } = await handle.read(tailBuffer, 0, 8192, tailOffset);
      const tailChunk = tailBuffer.toString("utf8", 0, tailRead);
      const tailLines = tailChunk.split("\n").filter((l) => l.trim());

      for (const line of tailLines) {
        try {
          const entry = JSON.parse(line);
          // Only update lastAssistantMsg from tail — don't re-count messages (head already counted)
          if (entry.type === "assistant" || entry.role === "assistant") {
            const text = extractClaudeText(entry);
            if (text) lastAssistantMsg = text;
          }
        } catch {
          // Partial line at boundary — skip
        }
      }
    }

    if (!sessionId) {
      sessionId = path.basename(filePath, ".jsonl");
    }

    if (!firstPrompt && !sessionId) return null;

    return {
      id: sessionId,
      agentType: "claude",
      cwd: projectPath,
      projectPath,
      startedAt: startedAt || fileStat.birthtimeMs,
      lastActivityAt: fileStat.mtimeMs,
      firstPrompt: (firstPrompt || lastAssistantMsg).slice(0, 300),
      turnCount: Math.ceil(messageCount / 2),
      isActive: false,
      isTracked: false,
    };
  } finally {
    await handle.close();
  }
}

function extractClaudeText(entry: Record<string, unknown>): string {
  if (typeof entry.message === "string") return entry.message;

  const msg = entry.message as Record<string, unknown> | undefined;
  if (msg?.content) {
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      const textBlock = (msg.content as Array<Record<string, unknown>>).find(
        (b) => b.type === "text",
      );
      return (textBlock?.text as string) || "";
    }
  }

  if (typeof entry.content === "string") return entry.content;
  if (Array.isArray(entry.content)) {
    const textBlock = (entry.content as Array<Record<string, unknown>>).find(
      (b) => b.type === "text",
    );
    return (textBlock?.text as string) || "";
  }

  return "";
}

async function getClaudeSessionDetail(sessionId: string): Promise<ScannedSessionDetail | null> {
  const sessions = await scanClaudeSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  // We stored filePath internally but don't expose it — reconstruct
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  let filePath = "";

  try {
    const projectDirs = await readdir(claudeDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(claudeDir, dir.name, `${sessionId}.jsonl`);
      try {
        await stat(candidate);
        filePath = candidate;
        break;
      } catch {
        // Not in this directory
      }
    }
  } catch {
    return null;
  }

  if (!filePath) return null;

  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: ScannedSessionDetail["messages"] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === "user" || entry.role === "user") {
        const text = extractClaudeText(entry);
        if (text)
          messages.push({
            role: "user",
            content: text,
            timestamp: entry.timestamp,
          });
      }
      if (entry.type === "assistant" || entry.role === "assistant") {
        const text = extractClaudeText(entry);
        if (text)
          messages.push({
            role: "assistant",
            content: text,
            timestamp: entry.timestamp,
          });
      }
    } catch {
      // Skip
    }
  }

  return { ...session, messages };
}

// ─── Claude Code VS Code Extension ────────────────────────────────────────────

/**
 * Scan Claude Code VS Code extension sessions.
 * Location: %APPDATA%/Claude/claude-code-sessions/ (Windows)
 *           ~/Library/Application Support/Claude/claude-code-sessions/ (macOS)
 * Format: workspace-id/profile-id/session.json — each file is a single JSON object
 */
async function scanClaudeVSCodeSessions(): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = [];

  // Resolve session directory per platform
  const appData =
    process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming", "Claude", "claude-code-sessions")
      : path.join(os.homedir(), "Library", "Application Support", "Claude", "claude-code-sessions");

  try {
    const workspaceDirs = await readdir(appData, { withFileTypes: true });

    for (const wsDir of workspaceDirs) {
      if (!wsDir.isDirectory()) continue;
      const wsPath = path.join(appData, wsDir.name);

      try {
        const profileDirs = await readdir(wsPath, { withFileTypes: true });

        for (const profDir of profileDirs) {
          if (!profDir.isDirectory()) continue;
          const profPath = path.join(wsPath, profDir.name);

          try {
            const files = await readdir(profPath);
            for (const file of files) {
              if (!file.endsWith(".json")) continue;
              try {
                const filePath = path.join(profPath, file);
                const content = await readFile(filePath, "utf8");
                const data = JSON.parse(content);

                if (!data.sessionId) continue;

                sessions.push({
                  id: data.cliSessionId || data.sessionId,
                  agentType: "claude",
                  cwd: data.originCwd || data.cwd || "",
                  projectPath: data.originCwd || data.cwd || undefined,
                  startedAt: data.createdAt || 0,
                  lastActivityAt: data.lastActivityAt || data.createdAt || 0,
                  firstPrompt: data.title || "(VS Code session)",
                  turnCount: 0, // VS Code metadata doesn't include turn count
                  isActive: false,
                  isTracked: false,
                });
              } catch {
                // Skip unparseable files
              }
            }
          } catch {
            // Skip unreadable profile dirs
          }
        }
      } catch {
        // Skip unreadable workspace dirs
      }
    }
  } catch {
    // VS Code Claude directory doesn't exist
  }

  return sessions;
}

// ─── Codex (OpenAI) ───────────────────────────────────────────────────────────

async function scanCodexSessions(): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = [];
  const codexBase = path.join(os.homedir(), ".codex");

  // 1) Scan rollout files in ~/.codex/sessions/YYYY/MM/DD/*.jsonl
  const sessionsDir = path.join(codexBase, "sessions");
  try {
    await walkCodexDir(sessionsDir, sessions);
  } catch {
    // sessions directory doesn't exist
  }

  // 2) Scan ~/.codex/history.jsonl
  const historyFile = path.join(codexBase, "history.jsonl");
  try {
    await parseCodexHistoryFile(historyFile, sessions);
  } catch {
    // history file doesn't exist
  }

  return sessions;
}

async function walkCodexDir(dir: string, sessions: ScannedSession[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkCodexDir(fullPath, sessions);
      } else if (entry.name.endsWith(".jsonl")) {
        try {
          const session = await parseCodexRolloutFile(fullPath);
          if (session) sessions.push(session);
        } catch {
          // Skip unparseable files
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

async function parseCodexRolloutFile(filePath: string): Promise<ScannedSession | null> {
  const fileStat = await stat(filePath);
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(32768);
    const { bytesRead } = await handle.read(buffer, 0, 32768, 0);
    const chunk = buffer.toString("utf8", 0, bytesRead);
    const lines = chunk.split("\n").filter((l) => l.trim());

    let sessionId = "";
    let cwd = "";
    let firstPrompt = "";
    let startedAt = 0;
    let messageCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type === "session_meta" && entry.payload) {
          sessionId = entry.payload.id || "";
          cwd = entry.payload.cwd || "";
          if (entry.payload.timestamp) {
            startedAt = new Date(entry.payload.timestamp).getTime();
          }
          continue;
        }

        if (entry.type === "response_item" && entry.payload) {
          const role = entry.payload.role;
          if (role === "developer") continue;

          if (role === "user") {
            const text = extractCodexText(entry.payload.content);
            if (text && !isCodexPreamble(text)) {
              messageCount++;
              if (!firstPrompt) firstPrompt = text;
            }
          } else if (role === "assistant") {
            const text = extractCodexText(entry.payload.content);
            if (text) messageCount++;
          }
        }
      } catch {
        // Skip
      }
    }

    if (!sessionId) {
      const basename = path.basename(filePath, ".jsonl");
      const match = basename.match(/rollout-[\dT-]+-(.+)/);
      sessionId = match?.[1] ?? basename;
    }

    if (!firstPrompt && !sessionId) return null;

    return {
      id: sessionId,
      agentType: "codex",
      cwd: cwd || "",
      projectPath: cwd || undefined,
      startedAt: startedAt || fileStat.birthtimeMs,
      lastActivityAt: fileStat.mtimeMs,
      firstPrompt: firstPrompt.slice(0, 300),
      turnCount: Math.ceil(messageCount / 2),
      isActive: false,
      isTracked: false,
    };
  } finally {
    await handle.close();
  }
}

async function parseCodexHistoryFile(
  filePath: string,
  existingSessions: ScannedSession[],
): Promise<void> {
  const fileStat = await stat(filePath);
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());

  const sessionMap = new Map<string, Array<{ ts: number; text: string }>>();
  const existingIds = new Set(existingSessions.map((s) => s.id));

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.session_id || !entry.text) continue;
      if (existingIds.has(entry.session_id)) continue;

      if (!sessionMap.has(entry.session_id)) {
        sessionMap.set(entry.session_id, []);
      }
      sessionMap.get(entry.session_id)!.push({
        ts: (entry.ts || 0) * 1000,
        text: entry.text,
      });
    } catch {
      // Skip
    }
  }

  for (const [sid, prompts] of sessionMap) {
    if (prompts.length === 0) continue;
    prompts.sort((a, b) => a.ts - b.ts);

    existingSessions.push({
      id: sid,
      agentType: "codex",
      cwd: "",
      startedAt: prompts[0]!.ts || fileStat.birthtimeMs,
      lastActivityAt: prompts[prompts.length - 1]!.ts || fileStat.mtimeMs,
      firstPrompt: prompts[0]!.text.slice(0, 300),
      turnCount: prompts.length,
      isActive: false,
      isTracked: false,
    });
  }
}

function extractCodexText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "input_text" || c.type === "output_text" || c.type === "text")
      .map((c) => (c.text as string) || "")
      .join("\n")
      .trim();
  }
  return "";
}

function isCodexPreamble(text: string): boolean {
  const t = text.slice(0, 200);
  return (
    t.includes("# AGENTS.md instructions") ||
    t.includes("<environment_context>") ||
    t.includes("<permissions instructions>") ||
    t.includes("<collaboration_mode>") ||
    t.includes("sandbox_mode")
  );
}

async function getCodexSessionDetail(sessionId: string): Promise<ScannedSessionDetail | null> {
  const sessions = await scanCodexSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  // Reconstruct file path from scan
  const codexBase = path.join(os.homedir(), ".codex");
  const allFiles: string[] = [];

  async function collectFiles(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) await collectFiles(fullPath);
        else if (entry.name.endsWith(".jsonl")) allFiles.push(fullPath);
      }
    } catch {
      // Skip
    }
  }

  await collectFiles(path.join(codexBase, "sessions"));

  // Find file containing this session
  let filePath = "";
  for (const f of allFiles) {
    if (f.includes(sessionId)) {
      filePath = f;
      break;
    }
  }

  if (!filePath) return null;

  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const messages: ScannedSessionDetail["messages"] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "response_item" || !entry.payload) continue;
      const role = entry.payload.role;
      if (role === "developer") continue;

      if (role === "user") {
        const text = extractCodexText(entry.payload.content);
        if (text && !isCodexPreamble(text)) messages.push({ role: "user", content: text });
      } else if (role === "assistant") {
        const text = extractCodexText(entry.payload.content);
        if (text) messages.push({ role: "assistant", content: text });
      }
    } catch {
      // Skip
    }
  }

  return { ...session, messages };
}
