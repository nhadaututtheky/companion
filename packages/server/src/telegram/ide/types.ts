/**
 * IdePack — per-IDE metadata the Telegram layer needs to render pickers,
 * gate commands, and pick sensible defaults.
 *
 * Each IDE ships exactly one pack file (`claude.ts`, `codex.ts`, ...).
 * The registry aggregates them; every Telegram surface (commands, pickers,
 * help text) routes through the registry so there are no Claude hardcodes.
 *
 * Adding a new IDE = copy one file, register it in `registry.ts`. No
 * edits to commands required.
 */

import type { CLIPlatform } from "@companion/shared";

export interface IdeModel {
  /** Value sent to the adapter (e.g. "claude-sonnet-4-6"). */
  value: string;
  /** Human label for picker buttons (e.g. "Sonnet 4.6"). */
  label: string;
}

export interface IdeApprovalMode {
  value: string;
  label: string;
  desc: string;
}

export interface IdeSupport {
  /** Claude's --effort / thinking modes. */
  thinking: boolean;
  /** Claude's context compaction. */
  compact: boolean;
  /** Claude/Gemini 1M context. */
  context1M: boolean;
  /** Adapter supports resume via its native protocol. */
  resume: boolean;
  /** Has approval-mode selector (Codex). */
  approval: boolean;
  /** Has sandbox toggle (Gemini). */
  sandbox: boolean;
  /** Has YOLO toggle (Gemini). */
  yolo: boolean;
}

export interface IdePack {
  /** Canonical platform key — matches CLIPlatform union. */
  platform: CLIPlatform;
  /** Display name in pickers and help text. */
  label: string;
  /** Short emoji shown in the IDE picker row (leading icon only here). */
  emoji: string;
  /** Inline button style for the IDE picker row. */
  style: "primary" | "success" | "danger" | undefined;
  /** Models offered to /model — first entry is the default. */
  models: IdeModel[];
  /** Approval modes offered to /approval. Empty when not supported. */
  approvalModes: IdeApprovalMode[];
  /** Capability flags. Commands use these to self-gate. */
  supports: IdeSupport;
  /** Short one-line tagline for /help pages. */
  tagline: string;
}

/** Default model for a pack — first entry wins. */
export function defaultModel(pack: IdePack): string {
  return pack.models[0]?.value ?? "";
}

/** Default approval mode for a pack — first entry or empty. */
export function defaultApproval(pack: IdePack): string {
  return pack.approvalModes[0]?.value ?? "";
}
