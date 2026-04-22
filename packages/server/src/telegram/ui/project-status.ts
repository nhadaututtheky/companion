/**
 * Project status indicators for Telegram inline buttons.
 *
 * Bot API 9.4 (Feb 2026) added `style` to InlineKeyboardButton with values
 * `"primary" | "success" | "danger"` (plus the default, no style). grammY
 * exposes these as `.primary()`, `.success()`, `.danger()` chainable on
 * the last added button.
 *
 * We map session state to button color so the user can glance a project
 * list and see which ones have live work — no emoji clutter needed.
 *
 * Kept as a pure module so /start, /new, /resume, /fork, and template
 * pickers all get the same visual language.
 */

import type { InlineKeyboard } from "grammy";
import { getAllActiveSessions, listResumableSessions } from "../../services/session-store.js";
import { getProject } from "../../services/project-profiles.js";
import type { SessionStatus } from "@companion/shared";

/** Visual state for a project in a selection menu. */
export type ProjectState = "active" | "waiting" | "error" | "idle-resumable" | "none";

/** Button style per project state — Bot API 9.4 values. undefined = default gray. */
export type ButtonStyle = "primary" | "success" | "danger" | undefined;

export const PROJECT_STATE_STYLE: Record<ProjectState, ButtonStyle> = {
  active: "success", // green — someone's working
  waiting: "primary", // blue — alive and ready
  error: "danger", // red — broken session
  "idle-resumable": undefined, // default gray — resumable but quiet
  none: undefined, // default gray — no history
};

/** Human-readable label (for legend text in message bodies). */
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

/** Style for a project slug — convenience wrapper for raw button objects. */
export function getProjectButtonStyle(slug: string): ButtonStyle {
  return PROJECT_STATE_STYLE[getProjectState(slug)];
}

/**
 * Add a styled project button to an InlineKeyboard. Encapsulates the
 * chain `keyboard.text(name, cb).danger()/.success()/.primary()` so every
 * call site stays a one-liner and style logic lives here.
 */
export function addProjectButton(
  keyboard: InlineKeyboard,
  project: { slug: string; name: string },
  callbackData: string,
  suffix?: string,
): InlineKeyboard {
  const label = suffix ? `${project.name} ${suffix}` : project.name;
  keyboard.text(label, callbackData);
  const style = getProjectButtonStyle(project.slug);
  if (style) applyStyle(keyboard, style);
  return keyboard;
}

function applyStyle(keyboard: InlineKeyboard, style: NonNullable<ButtonStyle>): void {
  if (style === "primary") keyboard.primary();
  else if (style === "success") keyboard.success();
  else if (style === "danger") keyboard.danger();
}

/**
 * Build a raw `InlineKeyboardButton` for project pickers that construct
 * their keyboard as a plain 2-D array (see /start regular flow).
 * Returns `{ text, callback_data, style? }` — the `style` field is the
 * same one grammY's chain helpers set.
 */
export function buildProjectButton(
  project: { slug: string; name: string },
  callbackData: string,
): { text: string; callback_data: string; style?: "primary" | "success" | "danger" } {
  const style = getProjectButtonStyle(project.slug);
  return style
    ? { text: project.name, callback_data: callbackData, style }
    : { text: project.name, callback_data: callbackData };
}
