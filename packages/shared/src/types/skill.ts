/**
 * Harness skill types — activation rules consumed by skill-router on the server.
 *
 * A "harness skill" is a markdown file in `.claude/skills/` whose frontmatter
 * lists trigger phrases and the MCP tools that should fire when the user's
 * intent matches. The skill-router renders a compact section into the adapter
 * context prefix (non-Claude CLIs) and amends MCP tool descriptions
 * (cross-CLI) so agents know when to call which tool.
 */

/** Raw frontmatter shape parsed from the skill .md file. */
export interface HarnessSkillFrontmatter {
  id: string;
  name: string;
  description: string;
  /** User-facing trigger phrases in natural language. */
  triggers: string[];
  /** MCP tool names this skill points at (e.g. "companion_codegraph_impact"). */
  tools: string[];
  /** Higher = injected first when budget tight. Default 5. */
  priority?: number;
}

/** Loaded skill (frontmatter + provenance). */
export interface HarnessSkill extends HarnessSkillFrontmatter {
  /** Absolute filesystem path the skill was loaded from. */
  filePath: string;
  /** Where the skill came from (project / user / system). */
  source: HarnessSkillSource;
}

export type HarnessSkillSource = "project" | "user" | "system";

/** DB toggle row shape — composite key (projectSlug, skillId). */
export interface HarnessSkillToggle {
  projectSlug: string;
  skillId: string;
  enabled: boolean;
  updatedAt: number;
}

/** Active skill state returned by skill-router for a given project. */
export interface ActiveSkillState {
  skill: HarnessSkill;
  enabled: boolean;
  /** True when the toggle was an explicit user choice (DB row exists). */
  explicit: boolean;
}

/** Default-on starter skills — enabled when no toggle row exists. */
export const HARNESS_DEFAULT_ENABLED_SKILL_IDS: ReadonlyArray<string> = [
  "companion-impact",
  "companion-knowledge",
  "companion-explore",
  "companion-ask",
];
