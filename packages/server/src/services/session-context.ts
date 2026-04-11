/**
 * SessionContext — Generates contextual information injected into CLI sessions.
 * Helps Claude Code understand the Companion environment it's running in.
 */

import { getProject } from "./project-profiles.js";
import {
  getRelevantInsights,
  formatInsightsForContext,
  recordInsightUsed,
} from "./session-memory.js";

interface SessionContextOpts {
  sessionId: string;
  shortId: string;
  projectSlug?: string;
  model: string;
  permissionMode: string;
  cwd: string;
  source: string;
}

/**
 * Build a context block that gets prepended to the first user message.
 * Gives Claude Code awareness of the Companion session it's running in.
 */
export function buildSessionContext(opts: SessionContextOpts): string {
  const project = opts.projectSlug ? getProject(opts.projectSlug) : null;

  const lines: string[] = [
    "<companion-context>",
    `Session: ${opts.shortId} (${opts.sessionId.slice(0, 8)})`,
    `Model: ${opts.model}`,
    `CWD: ${opts.cwd}`,
    `Permission: ${opts.permissionMode}`,
    `Source: ${opts.source}`,
  ];

  if (project) {
    lines.push(`Project: ${project.name} (${project.slug})`);
  }

  lines.push(
    "",
    "You are running inside Companion — an autonomous agent platform.",
    "Your output is streamed to a web dashboard and optionally to Telegram.",
    "Session activity, costs, and file changes are tracked automatically.",
    "</companion-context>",
  );

  // Inject session-memory insights if available
  let insightsBlock = "";
  if (opts.projectSlug) {
    try {
      const insights = getRelevantInsights(opts.projectSlug, undefined, 5);
      const formatted = formatInsightsForContext(insights);
      if (formatted) {
        insightsBlock = formatted;
        // Record usage for relevance tracking
        for (const insight of insights) {
          recordInsightUsed(insight.id);
        }
      }
    } catch {
      /* non-critical */
    }
  }

  return "\n\n" + lines.join("\n") + insightsBlock;
}
