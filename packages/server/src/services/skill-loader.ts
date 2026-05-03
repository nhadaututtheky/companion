/**
 * Harness skill loader — parses `.claude/skills/*.md` for activation rules.
 *
 * A "harness skill" is a markdown file whose YAML frontmatter contains both
 * `triggers` (array) and `tools` (array). Files without that shape are
 * skipped silently so this loader can coexist with plain Claude skill files
 * in the same directory.
 */

import { readFileSync, readdirSync, existsSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import type {
  HarnessSkill,
  HarnessSkillFrontmatter,
  HarnessSkillSource,
} from "@companion/shared";

const log = createLogger("skill-loader");

const MAX_FILE_SIZE = 64 * 1024;

interface ParseResult {
  fm: HarnessSkillFrontmatter | null;
  errors: string[];
}

/**
 * Parse YAML frontmatter supporting strings, numbers, and string-array fields.
 * Intentionally minimal — covers the subset our skill files use, no anchors,
 * no nested objects, no inline arrays.
 */
function parseHarnessFrontmatter(raw: string): ParseResult {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { fm: null, errors: ["No frontmatter delimiter"] };

  const lines = match[1]!.split(/\r?\n/);
  const obj: Record<string, string | string[]> = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const inline = line.slice(colonIdx + 1).trim();

    if (inline) {
      // Inline array: triggers: ["a", "b"]
      if (inline.startsWith("[") && inline.endsWith("]")) {
        const inner = inline.slice(1, -1).trim();
        if (inner === "") {
          obj[key] = [];
        } else {
          obj[key] = inner
            .split(",")
            .map((s) => stripQuotes(s.trim()))
            .filter((s) => s.length > 0);
        }
      } else {
        obj[key] = stripQuotes(inline);
      }
      i++;
      continue;
    }

    // No inline value → may be a list. Collect "- X" items.
    const arr: string[] = [];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      const t = next.trim();
      if (!t) {
        i++;
        continue;
      }
      if (t.startsWith("- ")) {
        arr.push(stripQuotes(t.slice(2).trim()));
        i++;
        continue;
      }
      // Different top-level key → stop (don't consume).
      break;
    }
    obj[key] = arr;
  }

  return validate(obj);
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function validate(obj: Record<string, string | string[]>): ParseResult {
  const errors: string[] = [];
  const id = obj.id;
  const name = obj.name;
  const description = obj.description;
  const triggers = obj.triggers;
  const tools = obj.tools;
  const priority = obj.priority;

  if (typeof id !== "string" || !id) errors.push("Missing or empty `id`");
  if (typeof name !== "string" || !name) errors.push("Missing or empty `name`");
  if (typeof description !== "string" || !description) errors.push("Missing or empty `description`");
  if (!Array.isArray(triggers) || triggers.length === 0) errors.push("Missing `triggers` (non-empty array)");
  if (!Array.isArray(tools) || tools.length === 0) errors.push("Missing `tools` (non-empty array)");

  if (errors.length > 0) return { fm: null, errors };

  let priorityNum = 5;
  if (typeof priority === "string") {
    const parsed = Number.parseInt(priority, 10);
    if (Number.isFinite(parsed)) priorityNum = parsed;
  }

  return {
    fm: {
      id: id as string,
      name: name as string,
      description: description as string,
      triggers: triggers as string[],
      tools: tools as string[],
      priority: priorityNum,
    },
    errors: [],
  };
}

function tryLoadSkill(filePath: string, source: HarnessSkillSource): HarnessSkill | null {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      log.warn("Skill file too large, skipping", { filePath, size: stat.size });
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    const { fm, errors } = parseHarnessFrontmatter(content);
    if (!fm) {
      // A file with frontmatter but invalid harness shape is almost always a
      // user authoring mistake — surface at warn so they see it in logs.
      // Plain non-harness skill files (no frontmatter) stay silent.
      if (content.startsWith("---")) {
        log.warn("Skipping malformed harness skill file", { filePath, errors });
      }
      return null;
    }

    return { ...fm, filePath, source };
  } catch (err) {
    log.debug("Failed to load skill file", { filePath, error: String(err) });
    return null;
  }
}

function scanDir(dir: string, source: HarnessSkillSource): HarnessSkill[] {
  if (!existsSync(dir)) return [];
  const out: HarnessSkill[] = [];

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch (err) {
    log.debug("Failed to scan skills dir", { dir, error: String(err) });
    return out;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const skill = tryLoadSkill(join(dir, entry.name), source);
      if (skill) out.push(skill);
      continue;
    }
    if (entry.isDirectory()) {
      for (const candidate of ["skill.md", "SKILL.md"]) {
        const filePath = join(dir, entry.name, candidate);
        if (existsSync(filePath)) {
          const skill = tryLoadSkill(filePath, source);
          if (skill) out.push(skill);
          break;
        }
      }
    }
  }

  return out;
}

/**
 * Load all harness skills available for a project. Skills lacking the
 * harness-shaped frontmatter (triggers + tools arrays) are silently
 * filtered out. Result is sorted by priority desc, then id ascending.
 */
export function loadHarnessSkills(projectDir: string): HarnessSkill[] {
  const skills = scanDir(join(projectDir, ".claude", "skills"), "project");

  const seen = new Set<string>();
  const deduped: HarnessSkill[] = [];
  for (const skill of skills) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    deduped.push(skill);
  }

  deduped.sort((a, b) => {
    const pa = a.priority ?? 5;
    const pb = b.priority ?? 5;
    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  });

  return deduped;
}

export const _internals = { parseHarnessFrontmatter, validate };
