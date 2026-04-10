/**
 * Unit tests for task-classifier — regex fallback rules + classification logic.
 * AI path is not tested here (requires mocking ai-client).
 */

import { describe, it, expect } from "bun:test";
import { classifyByRules } from "./task-classifier.js";

describe("task-classifier", () => {
  describe("classifyByRules", () => {
    // ── Mentions ──────────────────────────────────────────────────────────

    it("detects @mentions as mention pattern", () => {
      const result = classifyByRules("@fox check this file");
      expect(result.pattern).toBe("mention");
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("detects multiple @mentions", () => {
      const result = classifyByRules("@fox @bear review this PR");
      expect(result.pattern).toBe("mention");
    });

    // ── Debate patterns ─────────────────────────────────────────────────

    it("detects debate/compare intent as pro_con", () => {
      const result = classifyByRules("debate pros and cons of React vs Svelte");
      expect(result.pattern).toBe("debate");
      expect(result.suggestedDebateFormat).toBe("pro_con");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("detects 'vs' comparison as debate", () => {
      const result = classifyByRules("Next.js vs Remix for this project");
      expect(result.pattern).toBe("debate");
      expect(result.suggestedDebateFormat).toBe("pro_con");
    });

    it("detects red team intent", () => {
      const result = classifyByRules("red team this architecture proposal");
      expect(result.pattern).toBe("debate");
      expect(result.suggestedDebateFormat).toBe("red_team");
    });

    it("detects brainstorm intent", () => {
      const result = classifyByRules("brainstorm ideas for the new landing page");
      expect(result.pattern).toBe("debate");
      expect(result.suggestedDebateFormat).toBe("brainstorm");
    });

    // ── Workflow patterns ───────────────────────────────────────────────

    it("detects review-then-fix as workflow", () => {
      const result = classifyByRules("review this code then fix the issues");
      expect(result.pattern).toBe("workflow");
      expect(result.intent).toBe("review_then_fix");
      expect(result.suggestedTemplate).toBe("review-and-test");
    });

    it("detects Vietnamese review-then-fix", () => {
      const result = classifyByRules("review PR rồi fix bugs");
      expect(result.pattern).toBe("workflow");
      expect(result.intent).toBe("review_then_fix");
    });

    it("detects implement feature as workflow", () => {
      const result = classifyByRules("implement a new authentication feature");
      expect(result.pattern).toBe("workflow");
      expect(result.suggestedTemplate).toBe("implement-feature");
      expect(result.complexity).toBe("complex");
    });

    it("detects write tests as workflow", () => {
      const result = classifyByRules("write tests for the auth module");
      expect(result.pattern).toBe("workflow");
      expect(result.suggestedTemplate).toBe("write-tests");
    });

    it("detects PR review as workflow", () => {
      const result = classifyByRules("review this PR");
      expect(result.pattern).toBe("workflow");
      expect(result.suggestedTemplate).toBe("pr-review");
    });

    it("detects code review as workflow", () => {
      const result = classifyByRules("code review the auth module");
      expect(result.pattern).toBe("workflow");
      expect(result.suggestedTemplate).toBe("code-review");
    });

    // ── Single session patterns ─────────────────────────────────────────

    it("detects architecture as complex single", () => {
      const result = classifyByRules("plan the architecture for the new system");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("complex");
      expect(result.suggestedModel).toBe("opus");
    });

    it("detects fix bug as medium single", () => {
      const result = classifyByRules("fix the bug in auth.ts");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("medium");
      expect(result.suggestedModel).toBe("sonnet");
    });

    it("detects explain as simple single", () => {
      const result = classifyByRules("explain how the session store works");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("simple");
      expect(result.suggestedModel).toBe("haiku");
    });

    it("detects search as simple single", () => {
      const result = classifyByRules("find where the rate limiter is configured");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("simple");
      expect(result.suggestedModel).toBe("haiku");
    });

    it("detects refactor as complex single", () => {
      const result = classifyByRules("refactor the ws-bridge module");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("complex");
    });

    // ── File extraction ─────────────────────────────────────────────────

    it("extracts file paths from message", () => {
      const result = classifyByRules("fix the bug in src/services/auth.ts");
      expect(result.relevantFiles).toContain("src/services/auth.ts");
    });

    it("extracts multiple file paths", () => {
      const result = classifyByRules(
        "review packages/server/src/index.ts and packages/web/src/app/page.tsx",
      );
      expect(result.relevantFiles).toHaveLength(2);
    });

    it("deduplicates file paths", () => {
      const result = classifyByRules("check src/auth.ts then fix src/auth.ts");
      expect(result.relevantFiles).toHaveLength(1);
    });

    // ── Fallback ────────────────────────────────────────────────────────

    it("falls back to general single session for unknown intent", () => {
      const result = classifyByRules("hello world");
      expect(result.pattern).toBe("single");
      expect(result.complexity).toBe("medium");
      expect(result.confidence).toBeLessThan(0.5);
    });

    // ── Priority ordering ───────────────────────────────────────────────

    it("prioritizes mentions over other patterns", () => {
      const result = classifyByRules("@fox debate this topic");
      expect(result.pattern).toBe("mention");
    });

    it("prioritizes debate over workflow keywords", () => {
      const result = classifyByRules("debate the pros and cons then review");
      expect(result.pattern).toBe("debate");
    });
  });
});
