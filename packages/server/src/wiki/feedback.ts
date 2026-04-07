/**
 * Wiki Feedback Loop — auto-saves session findings as wiki raw material.
 *
 * After a session ends with meaningful results (≥3 turns, non-error),
 * extracts the session summary and saves it to wiki/<domain>/raw/
 * for future compilation into wiki articles.
 */

import { createLogger } from "../logger.js";
import { isFeatureEnabled } from "../services/context-budget.js";
import { getSessionRecord } from "../services/session-store.js";
import { getSessionSummary } from "../services/session-summarizer.js";
import { getWikiConfig, writeRawFile, listDomains } from "./store.js";

const log = createLogger("wiki-feedback");

const MIN_TURNS = 3;
const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 1_000;

/**
 * Wait for the session summary to be generated (with timeout).
 * The summarizer runs async after session end — we need to wait for it.
 */
async function waitForSummary(
  sessionId: string,
  timeoutMs: number = MAX_WAIT_MS,
): Promise<{ summary: string; keyDecisions: string[]; filesModified: string[] } | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = getSessionSummary(sessionId);
    if (result) return result;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return null;
}

/**
 * Attempt to save session findings as wiki raw material.
 * Call this after a session ends — it's fire-and-forget, never throws.
 */
export async function saveSessionFindings(sessionId: string): Promise<void> {
  try {
    if (!isFeatureEnabled("wiki")) return;

    const config = getWikiConfig();
    if (!config.enabled || !config.defaultDomain) return;

    // Verify the domain exists
    const domains = listDomains(config.rootPath);
    if (!domains.some((d) => d.slug === config.defaultDomain)) return;

    const record = getSessionRecord(sessionId);
    if (!record) return;

    // Only save for meaningful sessions
    if (record.numTurns < MIN_TURNS) return;
    if (record.status === "error") return;

    // Wait for the auto-summarizer to finish
    const summary = await waitForSummary(sessionId);
    if (!summary || !summary.summary) return;

    // Build raw material content
    const now = new Date().toISOString();
    const slug = record.projectSlug ?? "general";
    const decisions =
      summary.keyDecisions.length > 0
        ? summary.keyDecisions.map((d) => `- ${d}`).join("\n")
        : "None recorded";
    const files =
      summary.filesModified.length > 0
        ? summary.filesModified.map((f) => `- ${f}`).join("\n")
        : "None";

    const content = `# Session Findings: ${slug}
Date: ${now}
Session: ${sessionId}
Model: ${record.model}
Turns: ${record.numTurns}
Cost: $${record.totalCostUsd.toFixed(4)}

## Summary
${summary.summary}

## Key Decisions
${decisions}

## Files Modified
${files}
`;

    // Write to raw/ with timestamp-based filename to avoid collisions
    const dateSlug = now.slice(0, 10); // YYYY-MM-DD
    const filename = `session-${dateSlug}-${sessionId.slice(0, 8)}.md`;

    writeRawFile(config.defaultDomain, filename, content, config.rootPath);

    log.info("Saved session findings to wiki raw", {
      sessionId,
      domain: config.defaultDomain,
      filename,
    });
  } catch (err) {
    log.error("Failed to save session findings", { sessionId, error: String(err) });
  }
}
