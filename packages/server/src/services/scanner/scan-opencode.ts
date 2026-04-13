/**
 * OpenCode session scanner — queries SQLite DB via `opencode db` CLI.
 * Much more reliable than filesystem parsing since OpenCode stores everything in DB.
 */
import type { CLIPlatform, ScannedSession, ScannedSessionDetail } from "@companion/shared";
import { createLogger } from "../../logger.js";

const log = createLogger("scan-opencode");

/** Strict allowlist for session IDs — prevents SQL injection */
const OPENCODE_SESSION_ID_RE = /^ses_[a-zA-Z0-9]{20,40}$/;

/** Max time to wait for `opencode db` subprocess (ms) */
const DB_TIMEOUT_MS = 5_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run `opencode db` with a timeout. Returns parsed JSON or null on failure.
 */
async function queryOpenCodeDb<T>(sql: string): Promise<T | null> {
  try {
    const proc = Bun.spawn(["opencode", "db", sql, "--format", "json"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error("opencode db query timed out"));
      }, DB_TIMEOUT_MS);
    });

    const output = await Promise.race([new Response(proc.stdout).text(), timeout]);
    const code = await proc.exited;
    if (code !== 0) return null;

    return JSON.parse(output) as T;
  } catch (err) {
    log.warn("opencode db query failed", { error: String(err), sql: sql.slice(0, 80) });
    return null;
  }
}

/** Check if opencode CLI is available (cached per scan cycle) */
let openCodeAvailable: boolean | null = null;

async function isOpenCodeInstalled(): Promise<boolean> {
  if (openCodeAvailable !== null) return openCodeAvailable;

  try {
    const proc = Bun.spawn(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    openCodeAvailable = code === 0;
  } catch {
    openCodeAvailable = false;
  }
  return openCodeAvailable;
}

/** Reset CLI availability cache (called when scan cache is cleared) */
export function resetOpenCodeDetection(): void {
  openCodeAvailable = null;
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

interface OpenCodeSessionRow {
  id: string;
  title: string;
  directory: string;
  slug: string;
  parent_id: string | null;
  time_created: number;
  time_updated: number;
  worktree: string;
}

export async function scanOpenCodeSessions(): Promise<ScannedSession[]> {
  if (!(await isOpenCodeInstalled())) return [];

  const rows = await queryOpenCodeDb<OpenCodeSessionRow[]>(
    "SELECT s.id, s.title, s.directory, s.slug, s.parent_id, s.time_created, s.time_updated, p.worktree FROM session s JOIN project p ON s.project_id = p.id ORDER BY s.time_updated DESC LIMIT 200",
  );

  if (!rows) return [];

  return rows.map((row) => ({
    id: row.id,
    agentType: "opencode" as CLIPlatform,
    cwd: row.directory,
    projectPath: row.worktree,
    startedAt: row.time_created,
    lastActivityAt: row.time_updated,
    firstPrompt: row.title || `(${row.slug})`,
    turnCount: 0,
    isActive: false,
    isTracked: false,
  }));
}

// ─── Detail Fetcher ──────────────────────────────────────────────────────────

interface OpenCodeMessageRow {
  id: string;
  msg_data: string;
  part_data: string | null;
}

export async function getOpenCodeSessionDetail(
  sessionId: string,
): Promise<ScannedSessionDetail | null> {
  // C1 fix: strict allowlist validation prevents SQL injection
  if (!OPENCODE_SESSION_ID_RE.test(sessionId)) {
    log.warn("Rejected invalid OpenCode sessionId", { sessionId: sessionId.slice(0, 50) });
    return null;
  }

  if (!(await isOpenCodeInstalled())) return null;

  // Query session metadata directly (H3 fix: no redundant full rescan)
  const sessionRows = await queryOpenCodeDb<OpenCodeSessionRow[]>(
    `SELECT s.id, s.title, s.directory, s.slug, s.parent_id, s.time_created, s.time_updated, p.worktree FROM session s JOIN project p ON s.project_id = p.id WHERE s.id = '${sessionId}'`,
  );

  if (!sessionRows?.length) return null;

  const row = sessionRows[0]!;
  const session: ScannedSession = {
    id: row.id,
    agentType: "opencode",
    cwd: row.directory,
    projectPath: row.worktree,
    startedAt: row.time_created,
    lastActivityAt: row.time_updated,
    firstPrompt: row.title || `(${row.slug})`,
    turnCount: 0,
    isActive: false,
    isTracked: false,
  };

  // Query messages with parts
  const msgRows = await queryOpenCodeDb<OpenCodeMessageRow[]>(
    `SELECT m.id, m.data as msg_data, p.data as part_data FROM message m LEFT JOIN part p ON p.message_id = m.id WHERE m.session_id = '${sessionId}' ORDER BY m.time_created ASC, p.time_created ASC`,
  );

  if (!msgRows) return { ...session, messages: [] };

  const messages: ScannedSessionDetail["messages"] = [];
  const seenKeys = new Set<string>();

  for (const msgRow of msgRows) {
    const msgData = JSON.parse(msgRow.msg_data) as { role: string };

    if (msgRow.part_data) {
      const partData = JSON.parse(msgRow.part_data) as { type: string; text?: string };
      if (partData.type === "text" && partData.text) {
        const dedupeKey = msgRow.id + partData.text.slice(0, 50);
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          messages.push({
            role: msgData.role === "user" ? "user" : "assistant",
            content: partData.text,
          });
        }
      }
    }
  }

  return { ...session, messages };
}
