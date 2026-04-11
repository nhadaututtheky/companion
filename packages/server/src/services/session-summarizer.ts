/**
 * Session Auto-Summarizer — generates summaries when sessions end.
 * Uses Claude Haiku API for cheap, fast summarization.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessionSummaries, settings } from "../db/schema.js";
import { getSessionRecord, getSessionMessages } from "./session-store.js";
import { callAI, isAIConfigured } from "./ai-client.js";
import { extractInsights } from "./session-memory.js";
import { createLogger } from "../logger.js";
import { randomUUID } from "crypto";

const log = createLogger("summarizer");

const MIN_TURNS_FOR_SUMMARY = 3;

/** Check if auto-summary is enabled (default: true if AI is configured) */
function isAutoSummaryEnabled(): boolean {
  try {
    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, "ai.autoSummary")).get();
    if (row) return row.value !== "false";
  } catch {
    /* fall through */
  }
  return true; // default on
}
const MAX_MESSAGES_FOR_CONTEXT = 50;

const SUMMARY_PROMPT = `You are summarizing a Claude Code session. Analyze the conversation and produce a JSON response with:
1. "summary": A concise 150-200 word summary of what was accomplished
2. "keyDecisions": Array of 2-5 key decisions or choices made
3. "filesModified": Array of file paths that were created or modified

Respond ONLY with valid JSON, no markdown fences.`;

interface SummaryResult {
  summary: string;
  keyDecisions: string[];
  filesModified: string[];
}

/**
 * Generate and store a summary for a completed session.
 * Non-blocking — errors are logged but never thrown.
 */
export async function summarizeSession(sessionId: string): Promise<void> {
  try {
    // Check on/off toggle
    if (!isAutoSummaryEnabled()) {
      log.debug("Skip summary: auto-summary disabled", { sessionId });
      return;
    }

    const record = getSessionRecord(sessionId);
    if (!record) {
      log.debug("Skip summary: session not found", { sessionId });
      return;
    }

    // Skip short sessions
    if (record.numTurns < MIN_TURNS_FOR_SUMMARY) {
      log.debug("Skip summary: too few turns", { sessionId, turns: record.numTurns });
      return;
    }

    // Skip if already summarized
    const db = getDb();
    const existing = db
      .select()
      .from(sessionSummaries)
      .where(eq(sessionSummaries.sessionId, sessionId))
      .get();
    if (existing) {
      log.debug("Skip summary: already exists", { sessionId });
      return;
    }

    // Collect messages
    const { items: messages } = getSessionMessages(sessionId, { limit: MAX_MESSAGES_FOR_CONTEXT });
    if (messages.length === 0) {
      log.debug("Skip summary: no messages", { sessionId });
      return;
    }

    // Build conversation text
    const conversationText = messages
      .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join("\n\n");

    const projectInfo = record.projectSlug ? `Project: ${record.projectSlug}` : "Quick session";
    const contextHeader = `${projectInfo} | Model: ${record.model} | Turns: ${record.numTurns} | Cost: $${record.totalCostUsd.toFixed(4)}`;

    // Call AI provider
    if (!isAIConfigured()) {
      log.debug("Skip summary: no AI provider configured");
      return;
    }

    const aiResponse = await callAI({
      systemPrompt: SUMMARY_PROMPT,
      messages: [
        {
          role: "user",
          content: `--- Session Context ---\n${contextHeader}\n\n--- Conversation ---\n${conversationText}`,
        },
      ],
      tier: "fast",
      maxTokens: 500,
    });

    const text = aiResponse.text;
    let parsed: SummaryResult;

    try {
      parsed = JSON.parse(text) as SummaryResult;
    } catch {
      // Fallback: use raw text as summary
      parsed = {
        summary: text.slice(0, 500),
        keyDecisions: [],
        filesModified: (record.filesModified as string[]) ?? [],
      };
    }

    // Store summary
    db.insert(sessionSummaries)
      .values({
        id: randomUUID(),
        sessionId,
        summary: parsed.summary,
        keyDecisions: parsed.keyDecisions,
        filesModified:
          parsed.filesModified.length > 0
            ? parsed.filesModified
            : ((record.filesModified as string[]) ?? []),
        createdAt: new Date(),
      })
      .run();

    log.info("Session summary generated", {
      sessionId,
      summaryLength: parsed.summary.length,
      decisions: parsed.keyDecisions.length,
      files: parsed.filesModified.length,
    });

    // Extract cross-session insights from this summary (non-blocking)
    if (record.projectSlug) {
      const filesModified =
        parsed.filesModified.length > 0
          ? parsed.filesModified
          : ((record.filesModified as string[]) ?? []);

      void extractInsights({
        sessionId,
        projectSlug: record.projectSlug,
        summary: parsed.summary,
        filesModified,
        toolsUsed: [], // Not tracked per-session yet
        turnCount: record.numTurns,
        permissionsDenied: [],
      }).catch((err) => {
        log.warn("Failed to extract insights", { sessionId, error: String(err) });
      });
    }
  } catch (err) {
    log.error("Failed to generate summary", { sessionId, error: String(err) });
  }
}

/**
 * Get summaries for a project (most recent first).
 */
export function getProjectSummaries(
  projectSlug: string,
  limit = 3,
): Array<{
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  filesModified: string[];
  createdAt: Date | null;
}> {
  const db = getDb();

  // Join session_summaries with sessions to filter by project
  const rows = db
    .select({
      sessionId: sessionSummaries.sessionId,
      summary: sessionSummaries.summary,
      keyDecisions: sessionSummaries.keyDecisions,
      filesModified: sessionSummaries.filesModified,
      createdAt: sessionSummaries.createdAt,
    })
    .from(sessionSummaries)
    .all();

  // Filter by project (need to check session record)
  const filtered = rows.filter((row) => {
    const session = getSessionRecord(row.sessionId);
    return session?.projectSlug === projectSlug;
  });

  return filtered
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((row) => ({
      sessionId: row.sessionId,
      summary: row.summary,
      keyDecisions: (row.keyDecisions ?? []) as string[],
      filesModified: (row.filesModified ?? []) as string[],
      createdAt: row.createdAt,
    }));
}

/**
 * Get summary for a specific session.
 */
export function getSessionSummary(sessionId: string): {
  summary: string;
  keyDecisions: string[];
  filesModified: string[];
  createdAt: Date | null;
} | null {
  const db = getDb();
  const row = db
    .select()
    .from(sessionSummaries)
    .where(eq(sessionSummaries.sessionId, sessionId))
    .get();
  if (!row) return null;

  return {
    summary: row.summary,
    keyDecisions: (row.keyDecisions ?? []) as string[],
    filesModified: (row.filesModified ?? []) as string[],
    createdAt: row.createdAt,
  };
}

/**
 * Build context injection text from previous session summaries.
 * Returns empty string if disabled or no summaries exist.
 */
export function buildSummaryInjection(projectSlug: string | undefined): string {
  if (!projectSlug) return "";

  // Check on/off toggle
  try {
    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, "ai.autoInjectSummaries")).get();
    if (row?.value === "false") return "";
  } catch {
    /* fall through — default on */
  }

  const summaries = getProjectSummaries(projectSlug, 3);
  if (summaries.length === 0) return "";

  const lines = summaries.map((s, i) => {
    const files = s.filesModified.length > 0 ? ` | Files: ${s.filesModified.join(", ")}` : "";
    return `[Session ${i + 1}] ${s.summary}${files}`;
  });

  return `\n\n--- Previous Session Context ---\n${lines.join("\n\n")}`;
}
