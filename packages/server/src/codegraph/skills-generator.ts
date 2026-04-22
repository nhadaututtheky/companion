/**
 * CodeGraph Skills Generator — auto-generates project-aware context files.
 *
 * Two flavors:
 *   - `.claude/skills/companion-*.md` — consumed by Claude Code's skill loader.
 *   - `AGENTS.md` (project root) — the cross-CLI convention Codex / OpenCode /
 *     Gemini / Cursor all auto-read. Updated idempotently via marker-delimited
 *     block so a user-maintained AGENTS.md is never clobbered.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { createLogger } from "../logger.js";
import { getDb } from "../db/client.js";
import { projects } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getProjectStats, getProjectFilePaths } from "./graph-store.js";
import { getHotFiles } from "./query-engine.js";
import { detectCommunities } from "./analysis.js";

const log = createLogger("codegraph:skills");

// ─── Types ──────────────────────────────────────────────────────────────

export interface GeneratedSkill {
  filename: string;
  content: string;
}

export interface SkillsResult {
  generated: string[];
  skipped: string[];
  dir: string;
}

// ─── Skill Templates ────────────────────────────────────────────────────

function generateExploringSkill(
  projectSlug: string,
  stats: { files: number; nodes: number; edges: number },
  hotFiles: Array<{ filePath: string; incomingEdges: number; outgoingEdges: number }>,
  communities: Array<{ id: string; label: string; files: string[]; nodeCount: number }>,
): GeneratedSkill {
  const hotFileList = hotFiles
    .slice(0, 10)
    .map((f) => `- \`${f.filePath}\` (${f.incomingEdges} deps in, ${f.outgoingEdges} out)`)
    .join("\n");

  const communityList = communities
    .slice(0, 10)
    .map((c) => {
      const topFiles = c.files
        .slice(0, 3)
        .map((f) => `\`${f}\``)
        .join(", ");
      return `- **${c.label}** (${c.nodeCount} symbols): ${topFiles}`;
    })
    .join("\n");

  const content = `# Exploring ${projectSlug}

## Graph Stats
- **${stats.files}** files, **${stats.nodes}** symbols, **${stats.edges}** edges

## Entry Points (highest-coupling files)
${hotFileList || "- No hot files detected yet"}

## Architecture (community clusters)
${communityList || "- No communities detected yet — run a full scan first"}

## MCP Tools Available
- \`companion_codegraph_search\` — find symbols by keyword
- \`companion_codegraph_stats\` — graph statistics
- \`companion_codegraph_impact\` — blast radius of a file
- \`companion_codegraph_diff_impact\` — pre-commit impact analysis
`;

  return { filename: "companion-exploring.md", content };
}

function generateDebuggingSkill(
  hotFiles: Array<{ filePath: string; incomingEdges: number; outgoingEdges: number }>,
  communities: Array<{ id: string; label: string; files: string[]; nodeCount: number }>,
): GeneratedSkill {
  const highCoupling = hotFiles
    .filter((f) => f.incomingEdges + f.outgoingEdges > 5)
    .slice(0, 8)
    .map(
      (f) =>
        `- \`${f.filePath}\` — ${f.incomingEdges + f.outgoingEdges} connections (high coupling)`,
    )
    .join("\n");

  const content = `# Debugging Guide

## High-Coupling Nodes (common failure points)
${highCoupling || "- No high-coupling files detected — codebase is well-decoupled"}

## Debugging Strategy
1. Use \`companion_codegraph_impact\` to check blast radius before fixing
2. Use \`companion_codegraph_search\` to find related symbols
3. Check community boundaries — bugs often hide at module borders

## MCP Tools for Debugging
- \`companion_codegraph_search\` — find error-handling patterns, related code
- \`companion_codegraph_impact\` — what depends on the buggy file?
- \`companion_codegraph_diff_impact\` — verify your fix doesn't break other modules
`;

  return { filename: "companion-debugging.md", content };
}

function generateImpactCheckSkill(): GeneratedSkill {
  const content = `# Impact Check

## Before Committing
Run \`companion_codegraph_diff_impact\` to check blast radius of your changes.

## Usage
\`\`\`
companion_codegraph_diff_impact(projectSlug="<project>")
\`\`\`

This analyzes your git diff and returns:
- **Changed files** with symbol-level changes
- **Affected files** that depend on your changes
- **Risk scores** per file (high coupling = higher risk)
- **Impacted communities** (which architectural modules are affected)
- **Review suggestions** (which files need extra review)

## When to Use
- Before every commit that touches shared code
- After refactoring imports or public APIs
- When modifying files with 5+ dependents
`;

  return { filename: "companion-impact-check.md", content };
}

// ─── AGENTS.md (cross-CLI convention: Codex / OpenCode / Gemini / Cursor) ──

const AGENTS_MARKER_BEGIN = "<!-- companion:begin — auto-generated, edit outside these markers -->";
const AGENTS_MARKER_END = "<!-- companion:end -->";

function buildAgentsBlock(
  projectSlug: string,
  stats: { files: number; nodes: number; edges: number },
  hotFiles: Array<{ filePath: string; incomingEdges: number; outgoingEdges: number }>,
  communities: Array<{ id: string; label: string; files: string[]; nodeCount: number }>,
): string {
  const topHot = hotFiles
    .slice(0, 8)
    .map((f) => `- \`${f.filePath}\` (${f.incomingEdges + f.outgoingEdges} connections)`)
    .join("\n");

  const topCommunities = communities
    .slice(0, 6)
    .map((c) => `- **${c.label}** (${c.nodeCount} symbols)`)
    .join("\n");

  return [
    AGENTS_MARKER_BEGIN,
    `# ${projectSlug} — Agent Guide`,
    "",
    "You're running inside **Companion**, a multi-CLI agent platform. Session",
    "activity, costs, and file changes are captured automatically.",
    "",
    "## Project at a glance",
    `- **${stats.files}** files · **${stats.nodes}** symbols · **${stats.edges}** edges`,
    "",
    "## Entry points (highest coupling)",
    topHot || "- _No hot files detected yet — run a full scan._",
    "",
    "## Architecture clusters",
    topCommunities || "- _No clusters detected yet._",
    "",
    "## MCP tools available",
    "- `companion_codegraph_search` — find symbols by keyword",
    "- `companion_codegraph_impact` — blast radius of a file",
    "- `companion_codegraph_diff_impact` — pre-commit impact analysis",
    "- `companion_wiki_search` / `companion_wiki_note` — project knowledge base",
    "",
    "## Workflow tips",
    "1. Before editing a hot file, run `companion_codegraph_impact` to see dependents.",
    "2. After discovering a non-obvious pattern, save it via `companion_wiki_note`.",
    "3. Before committing, run `companion_codegraph_diff_impact` to catch broad reach.",
    AGENTS_MARKER_END,
  ].join("\n");
}

/** Merge our block into AGENTS.md without touching user-authored sections. */
function writeAgentsMd(
  projectDir: string,
  projectSlug: string,
  stats: { files: number; nodes: number; edges: number },
  hotFiles: Array<{ filePath: string; incomingEdges: number; outgoingEdges: number }>,
  communities: Array<{ id: string; label: string; files: string[]; nodeCount: number }>,
): boolean {
  try {
    const agentsPath = join(projectDir, "AGENTS.md");
    const resolved = resolve(agentsPath);
    if (!resolved.startsWith(resolve(projectDir))) return false;

    const block = buildAgentsBlock(projectSlug, stats, hotFiles, communities);

    let existing = "";
    if (existsSync(agentsPath)) {
      existing = readFileSync(agentsPath, "utf-8");
    }

    const beginIdx = existing.indexOf(AGENTS_MARKER_BEGIN);
    const endIdx = existing.indexOf(AGENTS_MARKER_END, beginIdx >= 0 ? beginIdx : 0);

    let merged: string;
    if (beginIdx >= 0 && endIdx > beginIdx) {
      const before = existing.slice(0, beginIdx).replace(/\s+$/, "");
      const after = existing.slice(endIdx + AGENTS_MARKER_END.length).replace(/^\s+/, "");
      merged = [before, block, after].filter((s) => s.length > 0).join("\n\n");
    } else if (existing.trim().length > 0) {
      merged = `${existing.replace(/\s+$/, "")}\n\n${block}\n`;
    } else {
      merged = `${block}\n`;
    }

    writeFileSync(agentsPath, merged, "utf-8");
    return true;
  } catch (err) {
    log.warn("Failed to write AGENTS.md", { projectSlug, error: String(err) });
    return false;
  }
}

function generateWikiNoteSkill(): GeneratedSkill {
  const content = `# Wiki Notes

## After Discovering Patterns
Save knowledge to the project wiki for future sessions:

\`\`\`
companion_wiki_note(domain="architecture", content="Pattern X is used because Y")
\`\`\`

## Good Wiki Notes
- Architecture decisions and their rationale
- Non-obvious patterns in the codebase
- Common pitfalls and how to avoid them
- Module boundaries and ownership

## MCP Tool
- \`companion_wiki_note\` — save a note to the project wiki
- \`companion_wiki_search\` — search existing wiki entries
`;

  return { filename: "companion-wiki-note.md", content };
}

// ─── Main Generator ─────────────────────────────────────────────────────

/**
 * Generate project-specific context files from codegraph data.
 *
 * Writes two flavors:
 *   - `.claude/skills/companion-*.md` (only when `.claude/` exists — skipped
 *     on non-Claude-only projects to stay out of the way).
 *   - `AGENTS.md` at project root — always updated so Codex / OpenCode /
 *     Gemini pick up the same context. Managed region is marker-delimited.
 */
export function generateSkills(projectSlug: string): SkillsResult {
  const db = getDb();
  const project = db
    .select({ dir: projects.dir })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .get();

  if (!project) {
    throw new Error(`Project not found: ${projectSlug}`);
  }

  const projectDir = resolve(project.dir);
  const claudeDir = join(projectDir, ".claude");
  const skillsDir = join(claudeDir, "skills");

  // Path traversal guard: ensure skills dir stays inside project dir
  const resolvedSkillsDir = resolve(skillsDir);
  if (!resolvedSkillsDir.startsWith(projectDir)) {
    throw new Error("Path traversal detected in project directory");
  }

  // Gather data from codegraph (needed by both output flavors)
  const stats = getProjectStats(projectSlug);
  const hotFiles = getHotFiles(projectSlug, 15);
  let communities: Array<{
    id: string;
    label: string;
    files: string[];
    nodeCount: number;
    cohesion: number;
  }> = [];
  try {
    communities = detectCommunities(projectSlug);
  } catch (err) {
    log.debug("Communities unavailable for skills", { error: String(err) });
  }

  const generated: string[] = [];
  const skipped: string[] = [];

  // AGENTS.md — always write (serves Codex / OpenCode / Gemini / Cursor)
  if (writeAgentsMd(projectDir, projectSlug, stats, hotFiles, communities)) {
    generated.push("AGENTS.md");
  } else {
    skipped.push("AGENTS.md");
  }

  // .claude/skills/ — only when .claude/ exists (Claude-only, opt-in via dir)
  if (!existsSync(claudeDir)) {
    log.info("No .claude/ directory, skipping Claude skills", { projectSlug });
    return {
      generated,
      skipped: [...skipped, "no .claude/ directory for Claude skills"],
      dir: skillsDir,
    };
  }

  // Ensure skills/ dir exists
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // Generate all skills
  const skills: GeneratedSkill[] = [
    generateExploringSkill(projectSlug, stats, hotFiles, communities),
    generateDebuggingSkill(hotFiles, communities),
    generateImpactCheckSkill(),
    generateWikiNoteSkill(),
  ];

  for (const skill of skills) {
    try {
      const filePath = join(skillsDir, skill.filename);
      writeFileSync(filePath, skill.content, "utf-8");
      generated.push(skill.filename);
    } catch (err) {
      log.warn("Failed to write skill", { filename: skill.filename, error: String(err) });
      skipped.push(skill.filename);
    }
  }

  log.info("Skills generated", {
    projectSlug,
    generated: generated.length,
    skipped: skipped.length,
  });
  return { generated, skipped, dir: skillsDir };
}

/**
 * Check if context files should be auto-generated after a scan. AGENTS.md is
 * cheap and helpful for every CLI, so we return true whenever the project has
 * a resolvable directory — the `.claude/skills/` branch still no-ops when the
 * user has no .claude/ dir.
 */
export function shouldAutoGenerateSkills(projectSlug: string): boolean {
  try {
    const db = getDb();
    const project = db
      .select({ dir: projects.dir })
      .from(projects)
      .where(eq(projects.slug, projectSlug))
      .get();

    return !!project?.dir && existsSync(project.dir);
  } catch {
    return false;
  }
}
