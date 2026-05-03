/**
 * Harness skill router — combines loaded skill files with per-project
 * toggle state, exposes:
 *
 *   - getActiveSkills(projectDir, projectSlug)   → resolved enabled skills
 *   - renderActivationHints(skills, budget)      → markdown for adapter prefix
 *   - getTriggerSuffixForTool(tool, skills)      → 1-line hint per MCP tool
 *   - toggle(projectSlug, skillId, enabled)      → upsert toggle row
 *
 * Defaults: if no toggle row exists, skills in HARNESS_DEFAULT_ENABLED_SKILL_IDS
 * are treated as enabled (opt-out). All other skills default off (opt-in).
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { harnessSkillToggles } from "../db/schema.js";
import { createLogger } from "../logger.js";
import { loadHarnessSkills } from "./skill-loader.js";
import { seedDefaultHarnessSkills } from "./skill-seed.js";
import {
  HARNESS_DEFAULT_ENABLED_SKILL_IDS,
  type ActiveSkillState,
  type HarnessSkill,
} from "@companion/shared";

/** Track per-project seeding so we don't hit the filesystem on every request. */
const seededProjects = new Set<string>();

const log = createLogger("skill-router");

/** Approximate tokens-per-character ratio for English markdown. */
const CHARS_PER_TOKEN = 4;

/** Cap a single trigger phrase length (chars) before render. */
const TRIGGER_MAX_CHARS = 80;
/** Strip control chars, backticks, backslashes; multi-char sequences handled below. */
const TRIGGER_BAD_CHARS = /[\x00-\x1F\x7F`\\]/g;
const TRIGGER_BAD_SEQUENCES = /'''|"""|```/g;

function sanitizeTrigger(raw: string): string | null {
  const cleaned = raw
    .replace(TRIGGER_BAD_CHARS, "")
    .replace(TRIGGER_BAD_SEQUENCES, "")
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > TRIGGER_MAX_CHARS) return cleaned.slice(0, TRIGGER_MAX_CHARS);
  return cleaned;
}

/**
 * Resolve which skills are active for a project. Each result entry is
 * tagged with `enabled` (effective) and `explicit` (user toggled).
 */
export function getActiveSkillStates(
  projectDir: string,
  projectSlug: string | undefined,
): ActiveSkillState[] {
  if (!seededProjects.has(projectDir)) {
    seedDefaultHarnessSkills(projectDir);
    seededProjects.add(projectDir);
  }

  const skills = loadHarnessSkills(projectDir);
  if (skills.length === 0) return [];

  const toggles = projectSlug ? readTogglesFor(projectSlug) : new Map<string, boolean>();

  return skills.map((skill) => {
    const explicit = toggles.has(skill.id);
    const enabled = explicit
      ? toggles.get(skill.id) === true
      : HARNESS_DEFAULT_ENABLED_SKILL_IDS.includes(skill.id);
    return { skill, enabled, explicit };
  });
}

/** Filtered view: only the skills currently enabled. */
export function getEnabledSkills(
  projectDir: string,
  projectSlug: string | undefined,
): HarnessSkill[] {
  return getActiveSkillStates(projectDir, projectSlug)
    .filter((s) => s.enabled)
    .map((s) => s.skill);
}

/**
 * Render a compact activation-hint section for prepending to an adapter
 * context prefix. Honors a token budget — drops lower-priority skills if
 * required.
 *
 * Output shape:
 *   ## Companion Harness — When to Use Tools
 *   - When user mentions "X", "Y" → call `tool_a`, `tool_b`
 *   - ...
 *
 * Returns an empty string when no skills are enabled.
 */
export function renderActivationHints(
  skills: HarnessSkill[],
  maxTokens: number = 1500,
): string {
  if (skills.length === 0) return "";

  const header = "## Companion Harness — When to Use Tools\n";
  const lines: string[] = [];
  let budget = maxTokens - estimateTokens(header) - 8; // 8-token safety margin

  // Already sorted by priority desc by loader.
  for (const skill of skills) {
    const line = renderSkillLine(skill);
    const cost = estimateTokens(line) + 1;
    if (cost > budget) {
      // Always emit the top-priority skill even if it overshoots — better
      // than returning empty hints. Subsequent oversized skills are skipped.
      if (lines.length === 0) {
        lines.push(line);
      } else {
        log.debug("Activation hints budget exhausted", {
          skipped: skill.id,
          included: lines.length,
        });
      }
      break;
    }
    lines.push(line);
    budget -= cost;
  }

  if (lines.length === 0) return "";
  return `${header}${lines.join("\n")}\n`;
}

function renderSkillLine(skill: HarnessSkill): string {
  const phrases = skill.triggers
    .map(sanitizeTrigger)
    .filter((t): t is string => t !== null)
    .slice(0, 4)
    .map((t) => `"${t}"`)
    .join(", ");
  const tools = skill.tools.map((t) => `\`${t}\``).join(", ");
  // If every trigger was rejected by sanitizer, omit the "mentions" clause.
  return phrases
    ? `- When user mentions ${phrases} → call ${tools}`
    : `- For ${skill.name}: call ${tools}`;
}

/**
 * Build a 1-line trigger suffix to append to a single MCP tool's
 * description. Combines triggers from every enabled skill that lists
 * this tool. Empty string if no skill points at the tool.
 */
export function getTriggerSuffixForTool(toolName: string, skills: HarnessSkill[]): string {
  const phrases = new Set<string>();
  for (const skill of skills) {
    if (!skill.tools.includes(toolName)) continue;
    for (const trigger of skill.triggers) {
      const cleaned = sanitizeTrigger(trigger);
      if (cleaned) phrases.add(cleaned);
    }
  }
  if (phrases.size === 0) return "";

  const top = Array.from(phrases).slice(0, 6).map((t) => `"${t}"`).join(", ");
  return ` Use when user mentions ${top}.`;
}

/** Read all toggle rows for a project into a map<skillId, enabled>. */
function readTogglesFor(projectSlug: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  try {
    const db = getDb();
    const rows = db
      .select()
      .from(harnessSkillToggles)
      .where(eq(harnessSkillToggles.projectSlug, projectSlug))
      .all();
    for (const row of rows) {
      out.set(row.skillId, row.enabled);
    }
  } catch (err) {
    log.debug("Failed to read toggles", { projectSlug, error: String(err) });
  }
  return out;
}

/**
 * Set the enabled flag for a (project, skill) pair. Upserts the row;
 * never throws — DB unavailability falls through to "no-op".
 */
export function setSkillToggle(
  projectSlug: string,
  skillId: string,
  enabled: boolean,
): boolean {
  try {
    const db = getDb();
    const now = new Date();
    db.insert(harnessSkillToggles)
      .values({ projectSlug, skillId, enabled, updatedAt: now })
      .onConflictDoUpdate({
        target: [harnessSkillToggles.projectSlug, harnessSkillToggles.skillId],
        set: { enabled, updatedAt: now },
      })
      .run();
    return true;
  } catch (err) {
    log.warn("Failed to set toggle", { projectSlug, skillId, error: String(err) });
    return false;
  }
}

/** Drop a toggle row, reverting the skill to default behaviour. */
export function clearSkillToggle(projectSlug: string, skillId: string): boolean {
  try {
    const db = getDb();
    db.delete(harnessSkillToggles)
      .where(
        and(
          eq(harnessSkillToggles.projectSlug, projectSlug),
          eq(harnessSkillToggles.skillId, skillId),
        ),
      )
      .run();
    return true;
  } catch (err) {
    log.warn("Failed to clear toggle", { projectSlug, skillId, error: String(err) });
    return false;
  }
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}
