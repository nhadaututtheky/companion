/**
 * Skills discovery routes.
 * GET /api/skills          — list all skill sources with tree structure
 * GET /api/skills/content  — read a single skill file content (?path=...)
 */

import { Hono } from "hono";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";
import type { ApiResponse } from "@companion/shared";

// ── Types ───────────────────────────────────────────────────────────

interface SkillLeaf {
  name: string;
  description: string;
  filePath: string;
}

interface SkillGroup {
  id: string;
  label: string;
  source: string; // e.g. "~/.claude/skills", "~/.rune/skills"
  skills: SkillLeaf[];
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Parse YAML frontmatter from a skill markdown file */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1]!;
  const result: Record<string, string> = {};

  for (const line of yaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) result[key] = value;
  }

  return result;
}

/** Max file size to read (512 KB) */
const MAX_SKILL_FILE_SIZE = 512 * 1024;

/** Scan a skills directory for subdirectories containing skill.md or SKILL.md */
function scanSkillsDir(dir: string): SkillLeaf[] {
  if (!existsSync(dir)) return [];

  const skills: SkillLeaf[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        // Check for top-level skill files (e.g. SKILL.md, README.md)
        if (entry.name.toLowerCase() === "skill.md") {
          const filePath = join(dir, entry.name);
          try {
            const stat = statSync(filePath);
            if (stat.size > MAX_SKILL_FILE_SIZE) {
              skills.push({ name: "Root Skill", description: "File too large to preview", filePath });
              continue;
            }
            const content = readFileSync(filePath, "utf-8");
            const fm = parseFrontmatter(content);
            skills.push({
              name: fm.name ?? "Root Skill",
              description: fm.description ?? "",
              filePath,
            });
          } catch {
            // Skip unreadable files
          }
        }
        continue;
      }

      // Look for skill.md or SKILL.md inside the subdirectory
      const subDir = join(dir, entry.name);
      const candidates = ["skill.md", "SKILL.md"];
      let found = false;

      for (const candidate of candidates) {
        const filePath = join(subDir, candidate);
        if (existsSync(filePath)) {
          try {
            const stat = statSync(filePath);
            if (stat.size > MAX_SKILL_FILE_SIZE) {
              skills.push({ name: entry.name, description: "File too large to preview", filePath });
              found = true;
              break;
            }
            const content = readFileSync(filePath, "utf-8");
            const fm = parseFrontmatter(content);
            skills.push({
              name: fm.name ?? entry.name,
              description: fm.description ?? "",
              filePath,
            });
            found = true;
          } catch {
            // Skip unreadable files
          }
          break;
        }
      }

      // Fallback: if no skill.md found, check for README.md
      if (!found) {
        const readmePath = join(subDir, "README.md");
        if (existsSync(readmePath)) {
          skills.push({
            name: entry.name,
            description: "",
            filePath: readmePath,
          });
        }
      }
    }
  } catch {
    // Directory not readable — return empty
  }

  return skills;
}

/** Check if resolved path is within an allowed root (with separator boundary) */
function isPathWithinRoots(resolved: string, roots: string[]): boolean {
  return roots.some((root) => resolved === root || resolved.startsWith(root + sep));
}

// ── Route Definitions ───────────────────────────────────────────────

export const skillsRoutes = new Hono();

/** GET /api/skills — list all skill sources */
skillsRoutes.get("/", (c) => {
  const home = homedir();
  const groups: SkillGroup[] = [];

  // Source 1: ~/.claude/skills
  const claudeSkillsDir = join(home, ".claude", "skills");
  const claudeSkills = scanSkillsDir(claudeSkillsDir);
  if (claudeSkills.length > 0) {
    groups.push({
      id: "claude-skills",
      label: "Claude Skills",
      source: "~/.claude/skills",
      skills: claudeSkills,
    });
  }

  // Source 2: ~/.rune/skills (if Rune is installed)
  const runeSkillsDir = join(home, ".rune", "skills");
  const runeSkills = scanSkillsDir(runeSkillsDir);
  if (runeSkills.length > 0) {
    groups.push({
      id: "rune-skills",
      label: "Rune Skills",
      source: "~/.rune/skills",
      skills: runeSkills,
    });
  }

  // Source 3: Project-level .claude/skills (if project header provided)
  const projectDir = c.req.query("projectDir");
  if (projectDir) {
    const resolved = resolve(projectDir);
    const projectClaudeSkills = scanSkillsDir(join(resolved, ".claude", "skills"));
    if (projectClaudeSkills.length > 0) {
      groups.push({
        id: "project-claude-skills",
        label: "Project Skills (.claude)",
        source: `${projectDir}/.claude/skills`,
        skills: projectClaudeSkills,
      });
    }

    const projectRuneSkills = scanSkillsDir(join(resolved, ".rune", "skills"));
    if (projectRuneSkills.length > 0) {
      groups.push({
        id: "project-rune-skills",
        label: "Project Skills (.rune)",
        source: `${projectDir}/.rune/skills`,
        skills: projectRuneSkills,
      });
    }
  }

  return c.json({
    success: true,
    data: groups,
  } satisfies ApiResponse);
});

/** GET /api/skills/content?path=... — read skill file content */
skillsRoutes.get("/content", (c) => {
  const filePath = c.req.query("path");
  if (!filePath) {
    return c.json({ success: false, error: "Missing path parameter" } satisfies ApiResponse, 400);
  }

  // Security: only allow reading .md files within known skill directories
  const resolved = resolve(filePath);
  const home = homedir();
  const allowedRoots = [
    resolve(join(home, ".claude", "skills")),
    resolve(join(home, ".rune", "skills")),
  ];

  // Also allow project-level skill dirs
  const projectDir = c.req.query("projectDir");
  if (projectDir) {
    const projResolved = resolve(projectDir);
    allowedRoots.push(resolve(join(projResolved, ".claude", "skills")));
    allowedRoots.push(resolve(join(projResolved, ".rune", "skills")));
  }

  if (!isPathWithinRoots(resolved, allowedRoots)) {
    return c.json({ success: false, error: "Path not within allowed skill directories" } satisfies ApiResponse, 403);
  }

  if (!resolved.toLowerCase().endsWith(".md")) {
    return c.json({ success: false, error: "Only .md files are allowed" } satisfies ApiResponse, 403);
  }

  try {
    const stat = statSync(resolved);
    if (stat.size > MAX_SKILL_FILE_SIZE) {
      return c.json({ success: false, error: "File too large (max 512KB)" } satisfies ApiResponse, 413);
    }
    const content = readFileSync(resolved, "utf-8");
    return c.json({ success: true, data: { content, path: resolved } } satisfies ApiResponse);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return c.json({ success: false, error: "File not found" } satisfies ApiResponse, 404);
    }
    return c.json({ success: false, error: "Failed to read file" } satisfies ApiResponse, 500);
  }
});
