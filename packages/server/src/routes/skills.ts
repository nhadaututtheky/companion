/**
 * Skills discovery + harness toggle routes.
 * GET  /api/skills                 — list all skill sources with tree structure
 * GET  /api/skills/content         — read a single skill file content (?path=...)
 * GET  /api/skills/harness         — list harness skills with toggle states
 * POST /api/skills/harness/toggle  — flip the per-project enabled flag
 */

import { Hono } from "hono";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";
import type { ApiResponse } from "@companion/shared";
import { getActiveSkillStatesWithStatus, setSkillToggle, clearSkillToggle } from "../services/skill-router.js";

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
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && value) result[key] = value;
  }

  return result;
}

/** Max file size to read (512 KB) */
const MAX_SKILL_FILE_SIZE = 512 * 1024;

/** Skill file candidates in priority order */
const SKILL_FILE_CANDIDATES = ["skill.md", "SKILL.md", "README.md"];

/** Try to read a skill definition from a markdown file */
function tryReadSkillFile(filePath: string, fallbackName: string): SkillLeaf | null {
  try {
    const stat = statSync(filePath);
    if (stat.size > MAX_SKILL_FILE_SIZE) {
      return { name: fallbackName, description: "File too large to preview", filePath };
    }
    const content = readFileSync(filePath, "utf-8");
    const fm = parseFrontmatter(content);
    return {
      name: fm.name ?? fallbackName,
      description: fm.description ?? "",
      filePath,
    };
  } catch {
    return null;
  }
}

/**
 * Scan a skills directory recursively for skill definitions.
 * Looks for skill.md, SKILL.md, or README.md in each subdirectory.
 * Recurses into nested subdirs (e.g. vercel-deploy/vercel-deploy-claimable/).
 */
function scanSkillsDir(dir: string, maxDepth = 3): SkillLeaf[] {
  if (!existsSync(dir)) return [];

  const skills: SkillLeaf[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check for a skill file at current level (top-level skill.md)
    if (depth > 0) {
      for (const candidate of SKILL_FILE_CANDIDATES) {
        const filePath = join(currentDir, candidate);
        if (existsSync(filePath)) {
          const dirName = currentDir.split(sep).pop() ?? "Skill";
          const skill = tryReadSkillFile(filePath, dirName);
          if (skill) skills.push(skill);
          return; // Found skill definition — don't recurse deeper
        }
      }
    } else {
      // At root level, check for a root skill.md
      const rootSkillPath = join(currentDir, "skill.md");
      const rootSkillPathUpper = join(currentDir, "SKILL.md");
      for (const p of [rootSkillPath, rootSkillPathUpper]) {
        if (existsSync(p)) {
          const skill = tryReadSkillFile(p, "Root Skill");
          if (skill) skills.push(skill);
          break;
        }
      }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip hidden directories and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      walk(join(currentDir, entry.name), depth + 1);
    }
  }

  walk(dir, 0);
  return skills;
}

/** Scan a commands directory (flat .md files, each is a command) */
function scanCommandsDir(dir: string): SkillLeaf[] {
  if (!existsSync(dir)) return [];

  const commands: SkillLeaf[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check for command.md or index.md inside
        for (const candidate of ["command.md", "index.md", "README.md"]) {
          const filePath = join(dir, entry.name, candidate);
          if (existsSync(filePath)) {
            const cmd = tryReadSkillFile(filePath, entry.name);
            if (cmd) commands.push(cmd);
            break;
          }
        }
      } else if (entry.name.endsWith(".md")) {
        const filePath = join(dir, entry.name);
        const cmd = tryReadSkillFile(filePath, entry.name.replace(/\.md$/, ""));
        if (cmd) commands.push(cmd);
      }
    }
  } catch {
    // Directory not readable
  }
  return commands;
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

  // Source 2: ~/.claude/commands (custom slash commands)
  const claudeCommandsDir = join(home, ".claude", "commands");
  const claudeCommands = scanCommandsDir(claudeCommandsDir);
  if (claudeCommands.length > 0) {
    groups.push({
      id: "claude-commands",
      label: "Custom Commands",
      source: "~/.claude/commands",
      skills: claudeCommands,
    });
  }

  // Source 3: ~/.rune/skills (if Rune is installed)
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

  // Source 4: Project-level skills (if project header provided)
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

    // Project-level commands
    const projectCommands = scanCommandsDir(join(resolved, ".claude", "commands"));
    if (projectCommands.length > 0) {
      groups.push({
        id: "project-commands",
        label: "Project Commands",
        source: `${projectDir}/.claude/commands`,
        skills: projectCommands,
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
    resolve(join(home, ".claude", "commands")),
    resolve(join(home, ".rune", "skills")),
  ];

  // Also allow project-level skill dirs
  const projectDir = c.req.query("projectDir");
  if (projectDir) {
    const projResolved = resolve(projectDir);
    allowedRoots.push(resolve(join(projResolved, ".claude", "skills")));
    allowedRoots.push(resolve(join(projResolved, ".claude", "commands")));
    allowedRoots.push(resolve(join(projResolved, ".rune", "skills")));
  }

  if (!isPathWithinRoots(resolved, allowedRoots)) {
    return c.json(
      { success: false, error: "Path not within allowed skill directories" } satisfies ApiResponse,
      403,
    );
  }

  if (!resolved.toLowerCase().endsWith(".md")) {
    return c.json(
      { success: false, error: "Only .md files are allowed" } satisfies ApiResponse,
      403,
    );
  }

  try {
    const stat = statSync(resolved);
    if (stat.size > MAX_SKILL_FILE_SIZE) {
      return c.json(
        { success: false, error: "File too large (max 512KB)" } satisfies ApiResponse,
        413,
      );
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

// ── Harness Skills (Phase 1: activation rules) ──────────────────────

/**
 * GET /api/skills/harness?projectDir=&projectSlug=
 *
 * List harness skills (.md with triggers + tools frontmatter) and their
 * resolved enabled state for the given project.
 */
skillsRoutes.get("/harness", (c) => {
  const projectDir = c.req.query("projectDir");
  const projectSlug = c.req.query("projectSlug");
  if (!projectDir) {
    return c.json(
      { success: false, error: "Missing projectDir query parameter" } satisfies ApiResponse,
      400,
    );
  }

  try {
    const { states, togglesError } = getActiveSkillStatesWithStatus(
      resolve(projectDir),
      projectSlug,
    );
    return c.json({
      success: true,
      data: {
        skills: states.map((s) => ({
          id: s.skill.id,
          name: s.skill.name,
          description: s.skill.description,
          triggers: s.skill.triggers,
          tools: s.skill.tools,
          priority: s.skill.priority ?? 5,
          filePath: s.skill.filePath,
          enabled: s.enabled,
          explicit: s.explicit,
        })),
        // Non-null when per-project toggle row read failed. UI shows a
        // banner so the user knows the displayed enabled flags are
        // defaults, not their actual saved choices.
        togglesError,
      },
    } satisfies ApiResponse);
  } catch (err) {
    return c.json(
      { success: false, error: `Failed to load harness skills: ${String(err)}` } satisfies ApiResponse,
      500,
    );
  }
});

/**
 * POST /api/skills/harness/toggle
 * Body: { projectSlug: string, skillId: string, enabled: boolean | null }
 *
 * Set or clear the per-project toggle. `enabled: null` removes the row
 * (revert to default behaviour).
 */
skillsRoutes.post("/harness/toggle", async (c) => {
  let body: { projectSlug?: string; skillId?: string; enabled?: boolean | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" } satisfies ApiResponse, 400);
  }

  const projectSlug = body.projectSlug?.trim();
  const skillId = body.skillId?.trim();
  if (!projectSlug || !skillId) {
    return c.json(
      { success: false, error: "projectSlug and skillId are required" } satisfies ApiResponse,
      400,
    );
  }
  // Charset + length guard so attackers can't seed huge / weird rows.
  // skill_id has no FK so we enforce shape here, not at the DB.
  const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
  if (!SAFE_ID.test(projectSlug)) {
    return c.json(
      { success: false, error: "Invalid projectSlug shape" } satisfies ApiResponse,
      400,
    );
  }
  if (!SAFE_ID.test(skillId)) {
    return c.json(
      { success: false, error: "Invalid skillId shape (alphanumeric/_/- up to 128 chars)" } satisfies ApiResponse,
      400,
    );
  }

  const ok =
    body.enabled === null
      ? clearSkillToggle(projectSlug, skillId)
      : setSkillToggle(projectSlug, skillId, Boolean(body.enabled));

  if (!ok) {
    return c.json({ success: false, error: "Failed to persist toggle" } satisfies ApiResponse, 500);
  }
  return c.json({ success: true, data: { projectSlug, skillId, enabled: body.enabled } } satisfies ApiResponse);
});
