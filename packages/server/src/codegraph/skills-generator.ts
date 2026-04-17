/**
 * CodeGraph Skills Generator — auto-generates .claude/skills/ files
 * from code graph data so Claude Code sessions start with project-aware context.
 */

import { existsSync, mkdirSync, writeFileSync, realpathSync } from "fs";
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
      const topFiles = c.files.slice(0, 3).map((f) => `\`${f}\``).join(", ");
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
    .map((f) => `- \`${f.filePath}\` — ${f.incomingEdges + f.outgoingEdges} connections (high coupling)`)
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
 * Generate project-specific Claude Code skills from codegraph data.
 * Writes files to <projectDir>/.claude/skills/.
 * Returns list of generated skill filenames.
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

  // Only generate if .claude/ exists (respect project structure)
  if (!existsSync(claudeDir)) {
    log.info("No .claude/ directory, skipping skills generation", { projectSlug });
    return { generated: [], skipped: ["no .claude/ directory"], dir: skillsDir };
  }

  // Ensure skills/ dir exists
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // Gather data from codegraph
  const stats = getProjectStats(projectSlug);
  const hotFiles = getHotFiles(projectSlug, 15);
  let communities: Array<{ id: string; label: string; files: string[]; nodeCount: number; cohesion: number }> = [];
  try {
    communities = detectCommunities(projectSlug);
  } catch (err) {
    log.debug("Communities unavailable for skills", { error: String(err) });
  }

  // Generate all skills
  const skills: GeneratedSkill[] = [
    generateExploringSkill(projectSlug, stats, hotFiles, communities),
    generateDebuggingSkill(hotFiles, communities),
    generateImpactCheckSkill(),
    generateWikiNoteSkill(),
  ];

  const generated: string[] = [];
  const skipped: string[] = [];

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

  log.info("Skills generated", { projectSlug, generated: generated.length, skipped: skipped.length });
  return { generated, skipped, dir: skillsDir };
}

/**
 * Check if skills should be auto-generated (after first scan, if .claude/ exists).
 */
export function shouldAutoGenerateSkills(projectSlug: string): boolean {
  try {
    const db = getDb();
    const project = db
      .select({ dir: projects.dir })
      .from(projects)
      .where(eq(projects.slug, projectSlug))
      .get();

    if (!project) return false;
    return existsSync(join(project.dir, ".claude"));
  } catch {
    return false;
  }
}
