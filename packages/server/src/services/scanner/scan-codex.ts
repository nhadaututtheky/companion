/**
 * Codex session scanner — reads rollout JSONL files from ~/.codex/sessions/
 * and prompt history from ~/.codex/history.jsonl.
 */
import { readdir, stat, open, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ScannedSession, ScannedSessionDetail } from "@companion/shared";

// ─── Text Extraction ─────────────────────────────────────────────────────────

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

// ─── Scanner ─────────────────────────────────────────────────────────────────

export async function scanCodexSessions(): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = [];
  const codexBase = path.join(os.homedir(), ".codex");

  const sessionsDir = path.join(codexBase, "sessions");
  try {
    await walkCodexDir(sessionsDir, sessions);
  } catch {
    // sessions directory doesn't exist
  }

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

// ─── Detail Fetcher ──────────────────────────────────────────────────────────

export async function getCodexSessionDetail(
  sessionId: string,
): Promise<ScannedSessionDetail | null> {
  const sessions = await scanCodexSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

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
