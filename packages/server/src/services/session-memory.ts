/**
 * Session Memory — Cross-session learning from patterns, mistakes, and preferences.
 *
 * Post-mortem: extracts insights when sessions end.
 * Injection: provides relevant insights when new sessions start.
 */

import { eq, desc, and, sql } from "drizzle-orm";
import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { sessionInsights } from "../db/schema.js";
import { callAI, isAIConfigured } from "./ai-client.js";
import type { InsightType, SessionInsight, TaskClassification } from "@companion/shared/types";

const log = createLogger("session-memory");

// ── Validation ─────────────────────────────────────────────────────────────

const VALID_INSIGHT_TYPES = new Set<InsightType>(["pattern", "mistake", "preference", "hotspot"]);

/** Escape XML special characters to prevent prompt injection */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Content hashing for dedup ───────────────────────────────────────────────

function hashContent(content: string): string {
  // Simple hash for dedup — Bun.hash is fast
  const hash = Bun.hash(content.toLowerCase().trim());
  return hash.toString(36);
}

// ── Extract insights from completed session ─────────────────────────────────

const EXTRACTION_PROMPT = `You extract reusable insights from an AI coding session summary.

Extract 0-3 insights. Each insight must be:
- 1-2 sentences MAX
- Actionable in future sessions
- Not obvious from the code itself

Types:
- "pattern": Technique that worked well (e.g., "Used createTestDb() to avoid mock pollution")
- "mistake": Error that required backtracking (e.g., "Forgot to regenerate embedded-migrations after adding SQL")
- "preference": User rejected or strongly preferred an approach (e.g., "User prefers single bundled PR over many small ones")

Skip if:
- The session was trivial (<5 turns)
- Nothing surprising or reusable happened
- The insight is already obvious from code/commit history

Respond with ONLY a JSON array (no markdown):
[{"type": "pattern|mistake|preference", "content": "...", "files": ["relevant/file.ts"]}]

Return [] if no insights worth saving.`;

export interface SessionSummaryInput {
  sessionId: string;
  projectSlug: string;
  summary: string;
  filesModified: string[];
  toolsUsed: string[];
  turnCount: number;
  permissionsDenied: string[];
}

/**
 * Extract insights from a completed session.
 * Called by session-summarizer after generating the summary.
 */
export async function extractInsights(
  input: SessionSummaryInput,
): Promise<SessionInsight[]> {
  // Skip trivial sessions
  if (input.turnCount < 5) return [];
  if (!isAIConfigured()) return [];

  try {
    const userContent = [
      `Session summary: ${input.summary}`,
      `Files modified: ${input.filesModified.join(", ") || "none"}`,
      `Tools used: ${input.toolsUsed.join(", ") || "none"}`,
      input.permissionsDenied.length > 0
        ? `Permissions denied: ${input.permissionsDenied.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await callAI({
      systemPrompt: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: userContent }],
      tier: "fast",
      maxTokens: 512,
    });

    const parsed = JSON.parse(result.text);
    if (!Array.isArray(parsed)) return [];

    const db = getDb();
    const insights: SessionInsight[] = [];

    for (const item of parsed) {
      if (!item.type || !item.content) continue;
      if (!VALID_INSIGHT_TYPES.has(item.type)) continue; // Reject unknown types
      if (typeof item.content !== "string") continue;
      if (item.content.length > 500) continue; // Reject wall-of-text

      const hash = hashContent(item.content);

      // Check for duplicates
      const existing = db
        .select()
        .from(sessionInsights)
        .where(
          and(
            eq(sessionInsights.projectSlug, input.projectSlug),
            eq(sessionInsights.contentHash, hash),
          ),
        )
        .get();

      if (existing) {
        // Bump hit count on existing insight
        db.update(sessionInsights)
          .set({
            hitCount: existing.hitCount + 1,
            lastUsedAt: new Date().toISOString(),
          })
          .where(eq(sessionInsights.id, existing.id))
          .run();
        continue;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const files: string[] = Array.isArray(item.files)
        ? item.files.filter((f: unknown) => typeof f === "string")
        : [];

      db.insert(sessionInsights)
        .values({
          id,
          projectSlug: input.projectSlug,
          type: item.type as InsightType,
          content: item.content,
          sourceSessionId: input.sessionId,
          sourceFiles: files,
          relevanceScore: 0.7, // Start at 0.7 — decays over time
          hitCount: 1,
          contentHash: hash,
          createdAt: now,
          lastUsedAt: now,
        })
        .run();

      insights.push({
        id,
        projectSlug: input.projectSlug,
        type: item.type,
        content: item.content,
        sourceSessionId: input.sessionId,
        sourceFiles: files,
        relevanceScore: 0.7,
        hitCount: 1,
        createdAt: now,
        lastUsedAt: now,
      });
    }

    log.info("Extracted insights", {
      sessionId: input.sessionId,
      count: insights.length,
    });

    return insights;
  } catch (err) {
    log.warn("Failed to extract insights", { error: String(err) });
    return [];
  }
}

// ── Get relevant insights for new session ───────────────────────────────────

/**
 * Get top relevant insights for a new session.
 * Scores by: file overlap, type match, recency, hit count.
 */
export function getRelevantInsights(
  projectSlug: string,
  classification?: TaskClassification,
  maxResults: number = 5,
): SessionInsight[] {
  try {
    const db = getDb();

    const rows = db
      .select()
      .from(sessionInsights)
      .where(eq(sessionInsights.projectSlug, projectSlug))
      .orderBy(desc(sessionInsights.relevanceScore))
      .limit(50) // Fetch more, score locally
      .all();

    if (rows.length === 0) return [];

    const mentionedFiles = new Set(classification?.relevantFiles ?? []);
    const now = Date.now();

    // Score each insight
    const scored = rows.map((row) => {
      let score = row.relevanceScore;

      // File overlap: +0.3 if any source files match mentioned files
      const sourceFiles: string[] = (row.sourceFiles as string[]) ?? [];
      if (mentionedFiles.size > 0 && sourceFiles.some((f) => mentionedFiles.has(f))) {
        score += 0.3;
      }

      // Type match: preferences always relevant, patterns for implement tasks
      if (row.type === "preference") score += 0.2;
      if (row.type === "mistake") score += 0.15;

      // Recency: decay over 30 days
      const ageMs = now - new Date(row.lastUsedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > 30) score *= 0.5;
      else if (ageDays > 14) score *= 0.8;

      // Hit count: frequently relevant insights score higher
      score += Math.min(0.2, row.hitCount * 0.04);

      return { ...row, computedScore: score };
    });

    return scored
      .sort((a, b) => b.computedScore - a.computedScore)
      .slice(0, maxResults)
      .map((row) => ({
        id: row.id,
        projectSlug: row.projectSlug,
        type: row.type as InsightType,
        content: row.content,
        sourceSessionId: row.sourceSessionId,
        sourceFiles: (row.sourceFiles as string[]) ?? [],
        relevanceScore: row.computedScore,
        hitCount: row.hitCount,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      }));
  } catch (err) {
    log.warn("Failed to get insights", { error: String(err) });
    return [];
  }
}

// ── Format insights for context injection ───────────────────────────────────

/**
 * Format insights as XML block for injection into session context.
 * Max ~500 tokens.
 */
export function formatInsightsForContext(insights: SessionInsight[]): string | null {
  if (insights.length === 0) return null;

  const lines = ["<session-memory>", "Past insights for this project:"];

  for (const insight of insights) {
    lines.push(`- [${escapeXml(insight.type)}] ${escapeXml(insight.content)}`);
  }

  lines.push("</session-memory>");
  return "\n\n" + lines.join("\n");
}

// ── Record insight usage ────────────────────────────────────────────────────

/** Bump hit_count when an insight was included in a session */
export function recordInsightUsed(insightId: string): void {
  try {
    getDb()
      .update(sessionInsights)
      .set({
        hitCount: sql`${sessionInsights.hitCount} + 1`,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(sessionInsights.id, insightId))
      .run();
  } catch {
    /* non-critical */
  }
}

// ── Prune stale insights ────────────────────────────────────────────────────

/** Remove insights older than N days that haven't been used */
export function pruneStaleInsights(olderThanDays: number = 60): number {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const before = db.select({ count: sql<number>`count(*)` }).from(sessionInsights).get();
    db.delete(sessionInsights)
      .where(
        and(
          sql`${sessionInsights.lastUsedAt} < ${cutoff}`,
          sql`${sessionInsights.hitCount} <= 1`,
        ),
      )
      .run();
    const after = db.select({ count: sql<number>`count(*)` }).from(sessionInsights).get();
    return (before?.count ?? 0) - (after?.count ?? 0);
  } catch {
    return 0;
  }
}

// ── List / delete for UI ────────────────────────────────────────────────────

export function listInsights(projectSlug: string): SessionInsight[] {
  const rows = getDb()
    .select()
    .from(sessionInsights)
    .where(eq(sessionInsights.projectSlug, projectSlug))
    .orderBy(desc(sessionInsights.lastUsedAt))
    .all();

  return rows.map((row) => ({
    id: row.id,
    projectSlug: row.projectSlug,
    type: row.type as InsightType,
    content: row.content,
    sourceSessionId: row.sourceSessionId,
    sourceFiles: (row.sourceFiles as string[]) ?? [],
    relevanceScore: row.relevanceScore,
    hitCount: row.hitCount,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }));
}

export function deleteInsight(id: string): boolean {
  const db = getDb();
  const exists = db.select({ id: sessionInsights.id }).from(sessionInsights).where(eq(sessionInsights.id, id)).get();
  if (!exists) return false;
  db.delete(sessionInsights).where(eq(sessionInsights.id, id)).run();
  return true;
}

export function clearInsights(projectSlug: string): number {
  const db = getDb();
  const before = db.select({ count: sql<number>`count(*)` }).from(sessionInsights)
    .where(eq(sessionInsights.projectSlug, projectSlug)).get();
  db.delete(sessionInsights).where(eq(sessionInsights.projectSlug, projectSlug)).run();
  return before?.count ?? 0;
}
