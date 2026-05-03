/**
 * Unit tests for companion-ask-merger — extractTerms + rerank.
 */

import { describe, it, expect } from "bun:test";
import { extractTerms, rerank, type AskSource } from "./companion-ask-merger.js";

function src(partial: Partial<AskSource> & Pick<AskSource, "id" | "type" | "title" | "score">): AskSource {
  return {
    snippet: "",
    ...partial,
  };
}

describe("extractTerms", () => {
  it("strips stopwords + short tokens", () => {
    const terms = extractTerms("How does the session lifecycle work?");
    expect(terms).toContain("session");
    expect(terms).toContain("lifecycle");
    expect(terms).toContain("work");
    expect(terms).not.toContain("how");
    expect(terms).not.toContain("the");
  });

  it("returns empty for stopwords-only / empty input", () => {
    expect(extractTerms("the and is are")).toEqual([]);
    expect(extractTerms("")).toEqual([]);
  });

  it("handles snake_case and kebab-case identifiers as one term", () => {
    const terms = extractTerms("explain start_session and ws-bridge flow");
    expect(terms).toContain("start_session");
    expect(terms).toContain("ws-bridge");
    expect(terms).toContain("flow");
  });
});

describe("rerank", () => {
  const baseInput: AskSource[] = [
    src({ type: "wiki", id: "session-lifecycle", title: "Session Lifecycle", score: 0.7, snippet: "How sessions start" }),
    src({ type: "code", id: "1", title: "startSession", score: 0.9, snippet: "" }),
    src({ type: "code", id: "2", title: "killSession", score: 0.4, snippet: "" }),
    src({ type: "wiki", id: "auth-flow", title: "Auth Flow", score: 0.3, snippet: "" }),
  ];

  it("orders by blended score desc", () => {
    const out = rerank(baseInput, { question: "session lifecycle" });
    // Top two must both relate to "session"
    expect(out[0]?.title.toLowerCase()).toContain("session");
    expect(out[1]?.title.toLowerCase()).toContain("session");
    // Result is monotonically descending by blended score
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.score).toBeGreaterThanOrEqual(out[i]!.score);
    }
  });

  it("respects topK cap", () => {
    const many: AskSource[] = Array.from({ length: 20 }, (_, i) =>
      src({ type: "code", id: String(i), title: `sym${i}`, score: 0.5 - i * 0.01 }),
    );
    const out = rerank(many, { question: "anything", topK: 5 });
    expect(out).toHaveLength(5);
  });

  it("dedupes by (type, id)", () => {
    const dup: AskSource[] = [
      src({ type: "wiki", id: "a", title: "First", score: 0.5 }),
      src({ type: "wiki", id: "a", title: "Second copy", score: 0.6 }),
      src({ type: "code", id: "a", title: "Code variant", score: 0.5 }),
    ];
    const out = rerank(dup, { question: "any" });
    // Wiki:a appears once (highest score wins), code:a is separate
    const wikiAs = out.filter((s) => s.type === "wiki" && s.id === "a");
    expect(wikiAs).toHaveLength(1);
    const codeAs = out.filter((s) => s.type === "code" && s.id === "a");
    expect(codeAs).toHaveLength(1);
  });

  it("clamps blended scores to [0,1]", () => {
    const out = rerank(
      [src({ type: "wiki", id: "x", title: "X", score: 1.5 })],
      { question: "x" },
    );
    expect(out[0]!.score).toBeLessThanOrEqual(1);
    expect(out[0]!.score).toBeGreaterThanOrEqual(0);
  });

  it("preserves order when scores are tied via type priority", () => {
    const tied: AskSource[] = [
      src({ type: "code", id: "c", title: "Code C", score: 0.5 }),
      src({ type: "wiki", id: "w", title: "Wiki W", score: 0.5 }),
    ];
    const out = rerank(tied, { question: "" });
    expect(out[0]!.type).toBe("wiki"); // wiki priority 1.0 > code 0.85
  });
});
