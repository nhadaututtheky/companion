/**
 * Session Auto-Summarizer — generates summaries when sessions end.
 * Uses Claude Haiku API for cheap, fast summarization.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { sessionSummaries } from "../db/schema.js";
import { getSessionRecord, getSessionMessages } from "./session-store.js";
import { createLogger } from "../logger.js";
import { randomUUID } from "crypto";

const log = createLogger("summarizer");

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MIN_TURNS_FOR_SUMMARY = 3;
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
    const existing = db.select().from(sessionSummaries).where(eq(sessionSummaries.sessionId, sessionId)).get();
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

    // Call Anthropic API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log.debug("Skip summary: ANTHROPIC_API_KEY not set");
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `${SUMMARY_PROMPT}\n\n--- Session Context ---\n${contextHeader}\n\n--- Conversation ---\n${conversationText}`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.error("Haiku API error", { sessionId, status: response.status, error: errText });
      return;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content?.[0]?.text ?? "";
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
        filesModified: parsed.filesModified.length > 0
          ? parsed.filesModified
          : (record.filesModified as string[]) ?? [],
        createdAt: new Date(),
      })
      .run();

    log.info("Session summary generated", {
      sessionId,
      summaryLength: parsed.summary.length,
      decisions: parsed.keyDecisions.length,
      files: parsed.filesModified.length,
    });
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
): Array<{ sessionId: string; summary: string; keyDecisions: string[]; filesModified: string[]; createdAt: Date | null }> {
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
  const row = db.select().from(sessionSummaries).where(eq(sessionSummaries.sessionId, sessionId)).get();
  if (!row) return null;

  return {
    summary: row.summary,
    keyDecisions: (row.keyDecisions ?? []) as string[],
    filesModified: (row.filesModified ?? []) as string[],
    createdAt: row.createdAt,
  };
}
