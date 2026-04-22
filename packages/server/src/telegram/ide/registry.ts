/**
 * IDE registry — the only place that knows about every IDE pack.
 *
 * Commands and pickers query this module; nothing inside `commands/` or
 * `telegram-bridge.ts` imports individual pack files directly. That keeps
 * the per-IDE surface small: add `foo.ts`, add it to the array below,
 * done — no command edits required.
 */

import type { CLIPlatform } from "@companion/shared";
import type { IdePack } from "./types.js";
import { CLAUDE_PACK } from "./claude.js";
import { CODEX_PACK } from "./codex.js";
import { GEMINI_PACK } from "./gemini.js";
import { OPENCODE_PACK } from "./opencode.js";
import { detectAllPlatforms } from "../../services/adapters/adapter-registry.js";

/** All known IDE packs. Order is the picker order. */
export const ALL_PACKS: readonly IdePack[] = [
  CLAUDE_PACK,
  CODEX_PACK,
  GEMINI_PACK,
  OPENCODE_PACK,
];

const BY_PLATFORM: Record<CLIPlatform, IdePack> = {
  claude: CLAUDE_PACK,
  codex: CODEX_PACK,
  gemini: GEMINI_PACK,
  opencode: OPENCODE_PACK,
};

/** Resolve a pack by platform key. Falls back to Claude if unknown. */
export function getPack(platform: CLIPlatform | undefined): IdePack {
  if (!platform) return CLAUDE_PACK;
  return BY_PLATFORM[platform] ?? CLAUDE_PACK;
}

/**
 * Return packs whose CLI binaries are installed on this system.
 * Reuses the adapter-registry detection cache so we don't re-spawn
 * `--version` subprocesses on every Telegram interaction.
 */
export async function listAvailablePacks(): Promise<IdePack[]> {
  const detections = await detectAllPlatforms();
  const available = new Set(
    detections.filter((d) => d.detection.available).map((d) => d.platform),
  );
  return ALL_PACKS.filter((p) => available.has(p.platform));
}

/**
 * Pick the default pack for a new session: first available in ALL_PACKS
 * order. Used when the bot is not role-pinned and only one IDE is
 * installed (so we can skip the picker entirely).
 */
export async function resolveDefaultPack(): Promise<IdePack> {
  const available = await listAvailablePacks();
  return available[0] ?? CLAUDE_PACK;
}

/**
 * True when the IDE picker row is worth showing: the user has >1 IDE
 * installed AND the bot is not pinned to a specific role.
 */
export async function shouldShowIdePicker(
  botRole: "claude" | "codex" | "gemini" | "opencode" | "general",
): Promise<boolean> {
  if (botRole !== "general") return false;
  const available = await listAvailablePacks();
  return available.length > 1;
}
