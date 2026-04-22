/**
 * IDE picker + per-IDE project picker rendering.
 *
 * These are the two keyboards rendered during /start when the bot has
 * `role: "general"` and more than one CLI is detected. Kept in its own
 * module so session.ts stays focused on the flow and layout edits don't
 * drag in registry lookups.
 */

import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import type { IdePack } from "../ide/types.js";
import { listAvailablePacks } from "../ide/registry.js";
import { addProjectButton } from "./project-status.js";
import { listProjects } from "../../services/project-profiles.js";

/** Apply the pack's style hint to the last button added to the keyboard. */
function applyPackStyle(keyboard: InlineKeyboard, pack: IdePack): void {
  if (pack.style === "primary") keyboard.primary();
  else if (pack.style === "success") keyboard.success();
  else if (pack.style === "danger") keyboard.danger();
}

/**
 * Render the first-step IDE picker. Returns `false` if there aren't
 * enough IDEs installed to warrant a choice — caller should fall through
 * to the project picker directly.
 */
export async function renderIdePicker(ctx: Context): Promise<boolean> {
  const packs = await listAvailablePacks();
  if (packs.length < 2) return false;

  const keyboard = new InlineKeyboard();
  for (const pack of packs) {
    keyboard.text(`${pack.emoji} ${pack.label}`, `ide:${pack.platform}`);
    applyPackStyle(keyboard, pack);
  }
  keyboard.row().text("⚡ Quick Session (no project)", "quick:session").primary();

  await ctx.reply(
    [
      "Pick an IDE to start with:",
      "",
      packs.map((p) => `${p.emoji} <b>${p.label}</b> — ${p.tagline}`).join("\n"),
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: keyboard },
  );
  return true;
}

/**
 * Render the per-IDE project picker. Called after a user taps an IDE in
 * the first-step picker — edits the same message in place so there's only
 * one active menu at a time.
 *
 * Callbacks use `new:<platform>:<slug>` so the platform choice survives
 * the round-trip through Telegram without any bot-side state.
 */
export async function renderProjectPickerForIde(
  ctx: Context,
  pack: IdePack,
): Promise<void> {
  const projects = listProjects();
  if (projects.length === 0) {
    await ctx.editMessageText("No projects configured. Use the web UI to add one.").catch(() => {});
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const p of projects) {
    addProjectButton(keyboard, p, `new:${pack.platform}:${p.slug}`);
    keyboard.row();
  }

  await ctx
    .editMessageText(`${pack.emoji} <b>${pack.label}</b> — pick a project:`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    })
    .catch(() => {});
}
