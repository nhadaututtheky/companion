/**
 * Registry routes — serve parsed skill/agent metadata to the web client.
 * GET /api/registry/skills — list all skills from user + project sources
 */

import { Hono } from "hono";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { listProjects } from "../services/project-profiles.js";
import type { ApiResponse } from "@companion/shared";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RegistrySkill {
  name: string;
  description: string;
  suggestTriggers: string[] | null;
  source: "user" | "project";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Parse YAML frontmatter from a markdown file */
function parseFrontmatter(content: string): Record<string, string | string[]> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1]!;
  const result: Record<string, string | string[]> = {};

  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    // Handle inline YAML arrays: [a, b, c]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      result[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return result;
}

const MAX_FILE_SIZE = 512 * 1024;
const SKILL_FILE_CANDIDATES = ["skill.md", "SKILL.md", "README.md"];

/** Try to parse a skill from a markdown file */
function tryParseSkillFile(
  filePath: string,
  fallbackName: string,
  source: "user" | "project",
): RegistrySkill | null {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return null;
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    const name = typeof fm["name"] === "string" ? fm["name"] : fallbackName;
    const description = typeof fm["description"] === "string" ? fm["description"] : "";
    const rawTriggers = fm["suggest_triggers"];
    const suggestTriggers = Array.isArray(rawTriggers)
      ? rawTriggers
      : typeof rawTriggers === "string"
        ? [rawTriggers]
        : null;
    return { name, description, suggestTriggers, source };
  } catch {
    return null;
  }
}

/** Scan a skills directory for skill definitions (non-recursive for flat layouts) */
function scanSkillsDir(dir: string, source: "user" | "project"): RegistrySkill[] {
  if (!existsSync(dir)) return [];

  const skills: RegistrySkill[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    if (entry.isDirectory()) {
      // Look for skill.md inside the subdir
      const subdir = join(dir, entry.name);
      for (const candidate of SKILL_FILE_CANDIDATES) {
        const filePath = join(subdir, candidate);
        if (existsSync(filePath)) {
          const skill = tryParseSkillFile(filePath, entry.name, source);
          if (skill) skills.push(skill);
          break;
        }
      }
    } else if (entry.name.endsWith(".md")) {
      // Flat .md files
      const filePath = join(dir, entry.name);
      const name = entry.name.replace(/\.md$/, "");
      const skill = tryParseSkillFile(filePath, name, source);
      if (skill) skills.push(skill);
    }
  }

  return skills;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const registryRoutes = new Hono();

/**
 * GET /api/registry/skills
 * Returns all skills from:
 *  - ~/.claude/skills (user)
 *  - [projectDir]/.claude/skills (project, if projectDir query param provided)
 * De-dups by name; project takes precedence over user.
 */
registryRoutes.get("/skills", (c) => {
  const home = homedir();

  // User-level skills
  const userSkillsDir = join(home, ".claude", "skills");
  const userSkills = scanSkillsDir(userSkillsDir, "user");

  // Also scan ~/.rune/skills if exists
  const runeSkillsDir = join(home, ".rune", "skills");
  const runeSkills = scanSkillsDir(runeSkillsDir, "user");

  // Project-level skills
  const projectDir = c.req.query("projectDir");
  let projectSkills: RegistrySkill[] = [];
  if (projectDir) {
    // Security: validate projectDir against the registered projects allowlist.
    // Prevents path traversal (e.g. projectDir=../../../../etc) by an attacker
    // with an API key from reading arbitrary .md files on the server.
    const resolvedDir = resolve(projectDir);
    const knownProjects = listProjects();
    const isRegistered = knownProjects.some((p) => resolve(p.dir) === resolvedDir);
    if (!isRegistered) {
      return c.json(
        { success: false, error: "projectDir must be a registered project" } satisfies ApiResponse,
        400,
      );
    }
    const projectClaudeSkills = scanSkillsDir(join(resolvedDir, ".claude", "skills"), "project");
    projectSkills = projectClaudeSkills;
  }

  // Merge: build map by name. Project overrides user.
  const skillMap = new Map<string, RegistrySkill>();

  for (const skill of [...userSkills, ...runeSkills]) {
    if (!skillMap.has(skill.name)) {
      skillMap.set(skill.name, skill);
    }
  }
  // Project takes precedence — overwrite any user entry with same name
  for (const skill of projectSkills) {
    skillMap.set(skill.name, skill);
  }

  const skills = Array.from(skillMap.values());

  return c.json({ success: true, skills } satisfies ApiResponse & { skills: RegistrySkill[] });
});
