/**
 * AdapterContextBuilder — builds the initial-prompt prefix for non-Claude CLIs.
 *
 * Claude Code receives session meta, prior-session summaries, and the CodeGraph
 * project map via stdin NDJSON after launch (see ws-session-lifecycle.ts). For
 * Codex / Gemini / OpenCode the prompt is passed as a CLI arg so we have to
 * pre-enrich it before spawning the process. This module centralizes that
 * enrichment so every non-Claude adapter gets the same context guarantees.
 *
 * The returned string is meant to be PREPENDED to the user prompt. Callers
 * receive an empty string when no context is available.
 */

import { createLogger } from "../logger.js";
import { buildSessionContext } from "./session-context.js";
import { buildSummaryInjection } from "./session-summarizer.js";
import { buildProjectMap, getCodeGraphConfig } from "../codegraph/agent-context-provider.js";
import { isGraphReady } from "../codegraph/index.js";
import { getSessionMessages } from "./session-store.js";
import type { CLIPlatform } from "@companion/shared";

const log = createLogger("adapter-context");

/** How many recent turns to replay when resuming a non-Claude session. */
const HISTORY_REPLAY_LIMIT = 20;
/** Soft cap on individual message bodies in the replay transcript. */
const HISTORY_MESSAGE_CHAR_CAP = 2000;

export interface AdapterContextOpts {
  sessionId: string;
  shortId: string;
  projectSlug?: string;
  cwd: string;
  model: string;
  permissionMode?: string;
  source?: string;
  cliPlatform: CLIPlatform;
  /** If resuming, the prior sessionId whose transcript should be replayed. */
  resumeFromSessionId?: string;
  /** Plan-mode hint (Codex) — preamble instructing the model not to execute. */
  planMode?: boolean;
}

/**
 * Build a prompt prefix to prepend to the user's initial message when starting
 * a non-Claude CLI session. Returns an empty string if nothing to inject.
 */
export function buildAdapterContextPrefix(opts: AdapterContextOpts): string {
  const parts: string[] = [];

  if (opts.planMode) {
    parts.push(buildPlanModePreamble());
  }

  parts.push(
    buildSessionContext({
      sessionId: opts.sessionId,
      shortId: opts.shortId,
      projectSlug: opts.projectSlug,
      model: opts.model,
      permissionMode: opts.permissionMode ?? "suggest",
      cwd: opts.cwd,
      source: opts.source ?? "cli",
    }),
  );

  const summary = buildSummaryInjection(opts.projectSlug);
  if (summary) parts.push(summary);

  if (opts.projectSlug && isGraphReady(opts.projectSlug)) {
    try {
      const cfg = getCodeGraphConfig(opts.projectSlug);
      if (cfg.injectionEnabled && cfg.projectMapEnabled) {
        const map = buildProjectMap(opts.projectSlug) ?? "";
        if (map) parts.push(map);
      }
    } catch (err) {
      log.debug("CodeGraph project map unavailable", { error: String(err) });
    }
  }

  // OpenCode resumes natively via `--continue` / `--session`, so replaying the
  // transcript would duplicate history. Codex and Gemini have no resume, so
  // the transcript is the only way to give them continuity.
  if (opts.resumeFromSessionId && opts.cliPlatform !== "opencode") {
    const transcript = buildReplayTranscript(opts.resumeFromSessionId);
    if (transcript) parts.push(transcript);
  }

  const block = parts.join("").trim();
  return block ? `${block}\n\n---\n\n` : "";
}

function buildPlanModePreamble(): string {
  return [
    "<plan-mode>",
    "PLAN MODE — produce a numbered plan only.",
    "Do NOT execute shell commands, edit files, or apply patches.",
    "End with: 'Ready to execute? Confirm and I will run the plan.'",
    "</plan-mode>",
    "",
  ].join("\n");
}

/**
 * Format prior-session messages as a compact transcript the model can read.
 * Omits tool calls/results — they're too noisy for a free-form prompt replay.
 * Returns empty string on any failure so callers can treat it as optional.
 */
function buildReplayTranscript(prevSessionId: string): string {
  try {
    const { items } = getSessionMessages(prevSessionId, { limit: HISTORY_REPLAY_LIMIT });
    if (items.length === 0) return "";

    const lines: string[] = ["<previous-conversation>"];
    for (const msg of items) {
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      const body = truncate(msg.content.trim(), HISTORY_MESSAGE_CHAR_CAP);
      if (!body) continue;
      const tag = msg.role === "user" ? "User" : "Assistant";
      lines.push(`${tag}: ${body}`);
    }
    lines.push("</previous-conversation>");

    return lines.length > 2 ? `\n\n${lines.join("\n\n")}` : "";
  } catch (err) {
    log.debug("Failed to build replay transcript", { prevSessionId, error: String(err) });
    return "";
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated]`;
}
