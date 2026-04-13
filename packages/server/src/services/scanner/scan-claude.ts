/**
 * Claude Code session scanner — reads JSONL files from ~/.claude/projects/
 * and VS Code extension sessions from AppData/Claude/claude-code-sessions/.
 */
import { readdir, stat, open, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ScannedSession, ScannedSessionDetail } from "@companion/shared";

// ─── Path Decoder ────────────────────────────────────────────────────────────

/**
 * Decode a Claude project directory name back to the original absolute path.
 * Claude encodes paths by replacing path separators with '-'.
 *
 * Caveat: paths containing literal hyphens (e.g. "My-Project") are ambiguous
 * and will decode incorrectly. This is a limitation of Claude's encoding scheme.
 */
function decodeClaudeProjectPath(encodedDirName: string): string {
  const windowsMatch = encodedDirName.match(/^([A-Z])--(.*)/);
  if (windowsMatch) {
    const drive = windowsMatch[1]!;
    const rest = windowsMatch[2]!.replace(/-/g, "\\");
    return `${drive}:\\${rest}`;
  }

  if (encodedDirName.startsWith("-")) {
    return "/" + encodedDirName.slice(1).replace(/-/g, "/");
  }

  return encodedDirName;
}

// ─── Text Extraction ─────────────────────────────────────────────────────────

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

// ─── CLI Session Scanner ─────────────────────────────────────────────────────

export async function scanClaudeSessions(): Promise<ScannedSession[]> {
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

    // Read last 8KB for the most recent message
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

// ─── VS Code Extension Scanner ──────────────────────────────────────────────

/**
 * Scan Claude Code VS Code extension sessions.
 * Windows: %APPDATA%/Claude/claude-code-sessions/
 * macOS:   ~/Library/Application Support/Claude/claude-code-sessions/
 * Linux:   ~/.config/Claude/claude-code-sessions/
 */
export async function scanClaudeVSCodeSessions(): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = [];

  let appData: string;
  if (process.platform === "win32") {
    appData = path.join(os.homedir(), "AppData", "Roaming", "Claude", "claude-code-sessions");
  } else if (process.platform === "darwin") {
    appData = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude-code-sessions",
    );
  } else {
    appData = path.join(os.homedir(), ".config", "Claude", "claude-code-sessions");
  }

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
                  turnCount: 0,
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

// ─── Detail Fetcher ──────────────────────────────────────────────────────────

export async function getClaudeSessionDetail(
  sessionId: string,
): Promise<ScannedSessionDetail | null> {
  const sessions = await scanClaudeSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

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
        if (text) messages.push({ role: "user", content: text, timestamp: entry.timestamp });
      }
      if (entry.type === "assistant" || entry.role === "assistant") {
        const text = extractClaudeText(entry);
        if (text) messages.push({ role: "assistant", content: text, timestamp: entry.timestamp });
      }
    } catch {
      // Skip
    }
  }

  return { ...session, messages };
}
