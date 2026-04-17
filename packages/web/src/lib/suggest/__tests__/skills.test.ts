import { describe, it, expect, beforeEach } from "bun:test";
import { matchKeywords } from "../intent.js";
import { useRegistryStore } from "../registry-store.js";
import { skillsProvider } from "../providers/skills.provider.js";
import type { Suggestion, SuggestionContext } from "../types.js";
import type { RegistrySkill } from "../registry-store.js";

function makeCtx(prompt: string): SuggestionContext {
  return { prompt, cursorPosition: prompt.length };
}

// ── matchKeywords tests ──────────────────────────────────────────────────────

describe("matchKeywords", () => {
  it("returns matched=true for a keyword present in the prompt", () => {
    const { matched, keyword } = matchKeywords("ship this feature", ["ship", "deploy"]);
    expect(matched).toBe(true);
    expect(keyword).toBe("ship");
  });

  it("returns matched=false when no keyword is present", () => {
    const { matched, keyword } = matchKeywords("fix the bug", ["ship", "deploy", "release"]);
    expect(matched).toBe(false);
    expect(keyword).toBeNull();
  });

  it("is case-insensitive", () => {
    const { matched } = matchKeywords("SHIP IT", ["ship"]);
    expect(matched).toBe(true);
  });

  it("returns the first matching keyword", () => {
    const { keyword } = matchKeywords("deploy and release", ["release", "deploy"]);
    // "release" is the first pattern in array — but "deploy" appears first in prompt.
    // Implementation iterates patterns in order, so first pattern to match wins.
    expect(keyword).toBe("release");
  });

  it("handles empty patterns array", () => {
    const { matched } = matchKeywords("anything", []);
    expect(matched).toBe(false);
  });
});

// ── skillsProvider tests ─────────────────────────────────────────────────────

function seedSkills(skills: RegistrySkill[]) {
  useRegistryStore.setState({ skills, loading: false, lastFetchedAt: Date.now() });
}

describe("skillsProvider", () => {
  beforeEach(() => {
    useRegistryStore.setState({ skills: [], loading: false, lastFetchedAt: 0 });
  });

  it("returns empty array when no skills are loaded", () => {
    const results = skillsProvider.suggest(makeCtx("ship this feature")) as Suggestion[];
    expect(results).toHaveLength(0);
  });

  it("returns a suggestion when prompt matches skill name", () => {
    seedSkills([
      { name: "ship", description: "Full ship pipeline", suggestTriggers: null, source: "user" },
    ]);
    const results = skillsProvider.suggest(makeCtx("I want to ship the feature")) as Suggestion[];
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("ship");
    expect(results[0]!.source).toBe("skills");
  });

  it("uses suggestTriggers when provided", () => {
    seedSkills([
      {
        name: "ship",
        description: "Deploy pipeline",
        suggestTriggers: ["deploy", "release", "ship"],
        source: "user",
      },
    ]);
    const results = skillsProvider.suggest(makeCtx("let's deploy to production")) as Suggestion[];
    expect(results.some((r) => r.id === "ship")).toBe(true);
  });

  it("returns insert-text action with /skillname payload", () => {
    seedSkills([{ name: "ship", description: "Ship it", suggestTriggers: null, source: "user" }]);
    const results = skillsProvider.suggest(makeCtx("ship")) as Suggestion[];
    expect(results[0]!.action.type).toBe("insert-text");
    expect(results[0]!.action.payload).toBe("/ship ");
  });

  it("does not return suggestion when prompt does not match any trigger", () => {
    seedSkills([
      { name: "ship", description: "Ship it", suggestTriggers: ["deploy"], source: "user" },
    ]);
    const results = skillsProvider.suggest(makeCtx("explain this code")) as Suggestion[];
    expect(results).toHaveLength(0);
  });

  it("assigns score 0.8 for word-boundary keyword match", () => {
    seedSkills([{ name: "ship", description: "", suggestTriggers: ["ship"], source: "user" }]);
    const results = skillsProvider.suggest(makeCtx("ship this")) as Suggestion[];
    expect(results[0]!.score).toBe(0.8);
  });

  it("assigns score 0.5 for substring-only keyword match (not whole word)", () => {
    seedSkills([{ name: "ship", description: "", suggestTriggers: ["ship"], source: "user" }]);
    // "airship" contains "ship" as a substring but not as a whole word
    const results = skillsProvider.suggest(makeCtx("airship design")) as Suggestion[];
    expect(results[0]!.score).toBe(0.5);
  });

  it("returns label as /skillname", () => {
    seedSkills([
      { name: "review", description: "Code review", suggestTriggers: null, source: "user" },
    ]);
    const results = skillsProvider.suggest(makeCtx("review my code")) as Suggestion[];
    expect(results[0]!.label).toBe("/review");
  });
});
