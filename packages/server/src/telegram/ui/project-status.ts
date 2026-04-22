/**
 * Project status indicators for Telegram inline buttons.
 *
 * Telegram Bot API has no per-button color, so status is conveyed via
 * leading emoji. The mapping is intentionally small (4 states) so users
 * can glance the menu and know which project has live work without
 * reading the session list.
 *
 * Kept as a pure module so it can be reused by /start, /new, /resume,
 * /fork, template pickers, and future per-IDE menus.
 */

import { getAllActiveSessions, listResumableSessions } from "../../services/session-store.js";
import { getProject } from "../../services/project-profiles.js";
import type { SessionStatus } from "@companion/shared";

/** Visual state for a project in a selection menu. */
export type ProjectState = "active" | "waiting" | "error" | "idle-resumable" | "none";

/** Emoji keyed by project state — single source of truth. */
export const PROJECT_STATE_EMOJI: Record<ProjectState, string> = {
  active: "🟢",
  waiting: "🟡",
  error: "🔴",
  "idle-resumable": "⚪",
  none: "⚫",
};

/** Human-readable label (for tooltips / help text). */
export const PROJECT_STATE_LABEL: Record<ProjectState, string> = {
  active: "Running",
  waiting: "Working",
  error: "Error",
  "idle-resumable": "Resumable",
  none: "No session",
};

/** Map a raw SessionStatus to a user-facing ProjectState. */
export function stateFromStatus(status: SessionStatus): ProjectState {
  switch (status) {
    case "busy":
    case "connected":
    case "plan_mode":
      return "active";
    case "starting":
    case "idle":
    case "compacting":
      return "waiting";
    case "error":
      return "error";
    case "ended":
      return "idle-resumable";
  }
}

/**
 * Compute the visual state for a project slug by aggregating every session
 * tied to that slug. "Worst-live" wins: an active session trumps a waiting
 * one; any error bubbles up so users can see broken sessions immediately.
 *
 * Matching uses `cwd`: SessionState has no projectSlug, so we resolve the
 * project dir once and match session cwd against it.
 */
export function getProjectState(slug: string): ProjectState {
  const project = getProject(slug);
  const dir = project?.dir;

  const active = dir
    ? getAllActiveSessions().filter(
        (s) => s.state.cwd === dir && s.state.status !== "ended",
      )
    : [];

  if (active.length === 0) {
    try {
      const resumable = listResumableSessions({ projectSlug: slug, limit: 1 });
      return resumable.length > 0 ? "idle-resumable" : "none";
    } catch {
      return "none";
    }
  }

  let best: ProjectState = "waiting";
  for (const s of active) {
    const state = stateFromStatus(s.state.status);
    if (state === "error") return "error";
    if (state === "active") best = "active";
  }
  return best;
}

/** Emoji for a project slug — convenience wrapper. */
export function getProjectStatusEmoji(slug: string): string {
  return PROJECT_STATE_EMOJI[getProjectState(slug)];
}

/**
 * Format a project button label with color status.
 * Used by every selection menu so the visual language stays consistent.
 */
export function formatProjectButton(
  project: { slug: string; name: string },
  suffix?: string,
): string {
  const emoji = getProjectStatusEmoji(project.slug);
  return suffix ? `${emoji} ${project.name} ${suffix}` : `${emoji} ${project.name}`;
}
