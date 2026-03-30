/**
 * SessionContext — Generates contextual information injected into CLI sessions.
 * Helps Claude Code understand the Companion environment it's running in.
 */

import { getProject } from "./project-profiles.js";

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

  return "\n\n" + lines.join("\n");
}
