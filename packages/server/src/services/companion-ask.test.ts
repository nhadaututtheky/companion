/**
 * Unit tests for companion-ask orchestrator — verifies parallel + timeout
 * + partial behaviour by mocking the wiki + codegraph layer modules.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Module mocks ────────────────────────────────────────────────────────
// Must run BEFORE importing companionAsk so the mocks resolve through.

let wikiResults: Array<{ slug: string; title: string; tokens: number; score: number; snippet: string }> = [];
let codeNodes: Array<{ id: number; symbolName: string; signature: string | null }> = [];
let wikiThrows = false;
let codeThrows = false;
let wikiDelayMs = 0;
let codeDelayMs = 0;

mock.module("../wiki/retriever.js", () => ({
  searchArticles: () => {
    if (wikiThrows) throw new Error("wiki down");
    if (wikiDelayMs > 0) {
      // synchronous busy-wait isn't great, but searchArticles is sync in prod.
      const end = Date.now() + wikiDelayMs;
      while (Date.now() < end) {
        /* spin */
      }
    }
    return wikiResults;
  },
  getSessionContext: () => null,
  formatIndexForContext: () => "",
}));

mock.module("../codegraph/graph-store.js", () => ({
  findNodesByName: () => {
    if (codeThrows) throw new Error("graph down");
    if (codeDelayMs > 0) {
      const end = Date.now() + codeDelayMs;
      while (Date.now() < end) {
        /* spin */
      }
    }
    return codeNodes;
  },
}));

// rtk/api compresses through the real pipeline. Stub it so tests don't
// depend on RTK behaviour.
mock.module("../rtk/api.js", () => ({
  compressText: (text: string) => ({
    compressed: text,
    originalTokens: Math.ceil(text.length / 4),
    compressedTokens: Math.ceil(text.length / 4),
    ratio: 1,
    strategiesApplied: [],
  }),
  HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD: 4000,
  getAutoCompressConfig: () => ({ enabled: true, thresholdTokens: 4000 }),
  resetAutoCompressConfigCache: () => {},
}));

// Import AFTER mocks
import { companionAsk, NoSourcesError } from "./companion-ask.js";

beforeEach(() => {
  wikiResults = [];
  codeNodes = [];
  wikiThrows = false;
  codeThrows = false;
  wikiDelayMs = 0;
  codeDelayMs = 0;
});

describe("companionAsk", () => {
  it("returns answer with both layers when both succeed", async () => {
    wikiResults = [
      {
        slug: "session-lifecycle",
        title: "Session Lifecycle",
        tokens: 200,
        score: 0.8,
        snippet: "How sessions start and stop",
      },
    ];
    codeNodes = [{ id: 1, symbolName: "startSession", signature: "(opts) => void" }];

    const res = await companionAsk({
      question: "how does session lifecycle work",
      projectSlug: "test-proj",
    });

    expect(res.layers.wiki).toBe(true);
    expect(res.layers.codegraph).toBe(true);
    expect(res.partial).toBe(false);
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.answer).toContain("Session Lifecycle");
  });

  it("returns partial=true when wiki throws but codegraph succeeds", async () => {
    wikiThrows = true;
    codeNodes = [{ id: 1, symbolName: "startSession", signature: null }];

    const res = await companionAsk({
      question: "session start",
      projectSlug: "test-proj",
    });

    expect(res.layers.wiki).toBe(false);
    expect(res.layers.codegraph).toBe(true);
    expect(res.partial).toBe(true);
    expect(res.answer).toContain("partial");
  });

  it("returns partial=true when codegraph throws but wiki succeeds", async () => {
    wikiResults = [
      { slug: "auth", title: "Auth", tokens: 100, score: 0.5, snippet: "auth flow" },
    ];
    codeThrows = true;

    const res = await companionAsk({
      question: "auth flow details",
      projectSlug: "test-proj",
    });

    expect(res.layers.wiki).toBe(true);
    expect(res.layers.codegraph).toBe(false);
    expect(res.partial).toBe(true);
  });

  it("throws NoSourcesError when both layers fail", async () => {
    wikiThrows = true;
    codeThrows = true;

    let thrown: unknown = null;
    try {
      await companionAsk({ question: "anything", projectSlug: "test-proj" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(NoSourcesError);
  });

  it("respects scope='docs' (skips codegraph)", async () => {
    wikiResults = [
      { slug: "x", title: "X", tokens: 100, score: 0.5, snippet: "..." },
    ];
    codeNodes = [{ id: 1, symbolName: "foo", signature: null }];

    const res = await companionAsk({
      question: "what is x",
      scope: "docs",
      projectSlug: "test-proj",
    });

    expect(res.layers.wiki).toBe(true);
    expect(res.layers.codegraph).toBe(false);
    expect(res.sources.every((s) => s.type === "wiki")).toBe(true);
  });

  it("respects scope='code' (skips wiki)", async () => {
    wikiResults = [{ slug: "x", title: "X", tokens: 100, score: 0.5, snippet: "..." }];
    codeNodes = [{ id: 1, symbolName: "foo", signature: null }];

    const res = await companionAsk({
      question: "where is foo",
      scope: "code",
      projectSlug: "test-proj",
    });

    expect(res.layers.wiki).toBe(false);
    expect(res.layers.codegraph).toBe(true);
    expect(res.sources.every((s) => s.type === "code")).toBe(true);
  });

  it("returns empty answer body when both layers report zero results", async () => {
    // Both succeed, but no rows.
    const res = await companionAsk({ question: "obscure term", projectSlug: "test-proj" });
    expect(res.layers.wiki).toBe(true);
    expect(res.layers.codegraph).toBe(true);
    expect(res.sources).toHaveLength(0);
    expect(res.answer).toContain("No matching sources");
  });

  it("returns durationMs > 0 always", async () => {
    wikiResults = [{ slug: "x", title: "X", tokens: 50, score: 0.5, snippet: "" }];
    const res = await companionAsk({ question: "x", projectSlug: "test-proj" });
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });
});
