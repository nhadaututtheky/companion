/**
 * Unit tests for skill-router — toggle resolution + activation hint render.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;
let insertProject: ((slug: string, name?: string) => void) | null = null;

const dbMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbMockFactory);

// Import AFTER mock
import {
  getActiveSkillStates,
  getEnabledSkills,
  renderActivationHints,
  setSkillToggle,
  clearSkillToggle,
  getTriggerSuffixForTool,
} from "./skill-router.js";
import type { HarnessSkill } from "@companion/shared";

let tmp: string;

const SKILL_IMPACT = `---
id: companion-impact
name: Impact Analysis
description: desc
priority: 8
triggers:
  - "impact of changing"
  - "what depends on"
tools:
  - companion_codegraph_impact
---
`;

const SKILL_KNOWLEDGE = `---
id: companion-knowledge
name: Project Knowledge
description: desc
priority: 7
triggers:
  - "how does"
tools:
  - companion_wiki_search
---
`;

const SKILL_CUSTOM_OFF = `---
id: my-custom-skill
name: Custom
description: not in defaults
priority: 5
triggers:
  - "my-trigger"
tools:
  - companion_wiki_note
---
`;

beforeEach(() => {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  insertProject = result.insertProject;

  tmp = mkdtempSync(join(tmpdir(), "harness-router-test-"));
  // Sentinel so seedDefaultHarnessSkills accepts the dir as a project
  writeFileSync(join(tmp, "package.json"), "{}");
  mkdirSync(join(tmp, ".claude", "skills"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "skills", "companion-impact.md"), SKILL_IMPACT);
  writeFileSync(join(tmp, ".claude", "skills", "companion-knowledge.md"), SKILL_KNOWLEDGE);
  writeFileSync(join(tmp, ".claude", "skills", "my-custom-skill.md"), SKILL_CUSTOM_OFF);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("getActiveSkillStates", () => {
  it("default-on for skills in HARNESS_DEFAULT_ENABLED_SKILL_IDS", () => {
    insertProject!("test-proj");
    const states = getActiveSkillStates(tmp, "test-proj");
    const impact = states.find((s) => s.skill.id === "companion-impact");
    const knowledge = states.find((s) => s.skill.id === "companion-knowledge");
    const custom = states.find((s) => s.skill.id === "my-custom-skill");
    expect(impact?.enabled).toBe(true);
    expect(impact?.explicit).toBe(false);
    expect(knowledge?.enabled).toBe(true);
    expect(custom?.enabled).toBe(false);
    expect(custom?.explicit).toBe(false);
  });

  it("respects an explicit DB toggle (off)", () => {
    insertProject!("p1");
    setSkillToggle("p1", "companion-impact", false);
    const states = getActiveSkillStates(tmp, "p1");
    const impact = states.find((s) => s.skill.id === "companion-impact");
    expect(impact?.enabled).toBe(false);
    expect(impact?.explicit).toBe(true);
  });

  it("respects an explicit DB toggle (on for non-default)", () => {
    insertProject!("p1");
    setSkillToggle("p1", "my-custom-skill", true);
    const states = getActiveSkillStates(tmp, "p1");
    const custom = states.find((s) => s.skill.id === "my-custom-skill");
    expect(custom?.enabled).toBe(true);
    expect(custom?.explicit).toBe(true);
  });

  it("clearSkillToggle reverts to default behaviour", () => {
    insertProject!("p1");
    setSkillToggle("p1", "companion-impact", false);
    clearSkillToggle("p1", "companion-impact");
    const states = getActiveSkillStates(tmp, "p1");
    const impact = states.find((s) => s.skill.id === "companion-impact");
    expect(impact?.enabled).toBe(true);
    expect(impact?.explicit).toBe(false);
  });
});

describe("getEnabledSkills", () => {
  it("returns only currently-enabled skills, sorted by priority", () => {
    insertProject!("p1");
    const enabled = getEnabledSkills(tmp, "p1");
    const ids = enabled.map((s) => s.id);
    // Default-on starter skills are auto-seeded into tmp on first call,
    // so we expect impact > knowledge > explore (priority 8/7/6).
    // my-custom-skill (priority 5) is OFF by default → excluded.
    expect(ids).toContain("companion-impact");
    expect(ids).toContain("companion-knowledge");
    expect(ids).toContain("companion-explore");
    expect(ids).toContain("companion-ask");
    expect(ids).not.toContain("my-custom-skill");
    // companion-ask (priority 9) beats companion-impact (8) > knowledge (7) > explore (6)
    expect(ids[0]).toBe("companion-ask");
  });
});

describe("renderActivationHints", () => {
  it("returns empty string for empty input", () => {
    expect(renderActivationHints([], 1500)).toBe("");
  });

  it("renders header + one line per skill with trigger phrases + tools", () => {
    const skills: HarnessSkill[] = [
      {
        id: "x",
        name: "X",
        description: "d",
        triggers: ["alpha", "beta"],
        tools: ["tool_x"],
        priority: 5,
        filePath: "/tmp/x.md",
        source: "project",
      },
    ];
    const out = renderActivationHints(skills, 1500);
    expect(out).toContain("## Companion Harness");
    expect(out).toContain('"alpha"');
    expect(out).toContain('"beta"');
    expect(out).toContain("`tool_x`");
  });

  it("respects token budget by dropping later skills", () => {
    // Force tiny budget to verify we drop, not crash.
    const skills: HarnessSkill[] = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `Skill ${i}`,
      description: "d",
      triggers: ["a really long trigger phrase that adds up tokens"],
      tools: ["x_tool_with_a_long_name"],
      priority: 5,
      filePath: "/tmp/x.md",
      source: "project" as const,
    }));
    const out = renderActivationHints(skills, 80);
    // Should not include all 10, but should still produce something or empty.
    const lineCount = out.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(lineCount).toBeLessThan(skills.length);
  });
});

describe("getTriggerSuffixForTool", () => {
  it("returns empty string when no skill points at the tool", () => {
    const skills: HarnessSkill[] = [];
    expect(getTriggerSuffixForTool("companion_wiki_search", skills)).toBe("");
  });

  it("aggregates triggers from every skill listing the tool", () => {
    const skills: HarnessSkill[] = [
      {
        id: "a",
        name: "A",
        description: "d",
        triggers: ["alpha"],
        tools: ["companion_wiki_search"],
        priority: 5,
        filePath: "/tmp/a.md",
        source: "project",
      },
      {
        id: "b",
        name: "B",
        description: "d",
        triggers: ["beta"],
        tools: ["companion_wiki_search"],
        priority: 5,
        filePath: "/tmp/b.md",
        source: "project",
      },
    ];
    const suffix = getTriggerSuffixForTool("companion_wiki_search", skills);
    expect(suffix).toContain('"alpha"');
    expect(suffix).toContain('"beta"');
    expect(suffix).toContain("Use when user mentions");
  });
});
