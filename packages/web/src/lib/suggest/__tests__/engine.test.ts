import { describe, it, expect, beforeEach } from "bun:test";
import { SuggestionEngine } from "../engine";
import type { Suggestion, SuggestionContext, SuggestionProvider } from "../types";

function makeCtx(prompt: string): SuggestionContext {
  return { prompt, cursorPosition: prompt.length };
}

function makeSuggestion(id: string, source: string, score: number): Suggestion {
  return {
    id,
    source,
    label: `/${id}`,
    score,
    action: { type: "insert-text", payload: `/${id} ` },
  };
}

describe("SuggestionEngine — suggest", () => {
  let engine: SuggestionEngine;

  beforeEach(() => {
    engine = new SuggestionEngine();
  });

  it("returns suggestions from registered provider", async () => {
    const provider: SuggestionProvider = {
      id: "test",
      suggest: () => [makeSuggestion("ship", "test", 0.8)],
    };
    engine.registerProvider(provider);
    const results = await engine.suggest(makeCtx("ship this feature"));
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("ship");
  });

  it("dedupes by source:id when multiple providers return same suggestion", async () => {
    const p1: SuggestionProvider = {
      id: "a",
      suggest: () => [makeSuggestion("ship", "shared", 0.8)],
    };
    const p2: SuggestionProvider = {
      id: "b",
      suggest: () => [makeSuggestion("ship", "shared", 0.6)],
    };
    engine.registerProvider(p1);
    engine.registerProvider(p2);
    const results = await engine.suggest(makeCtx("ship"));
    // Both return source="shared", id="ship" → dedupe → only first seen kept
    expect(results.filter((r) => r.id === "ship" && r.source === "shared")).toHaveLength(1);
  });

  it("sorts by score descending", async () => {
    const provider: SuggestionProvider = {
      id: "test",
      suggest: () => [
        makeSuggestion("low", "test", 0.3),
        makeSuggestion("high", "test", 0.9),
        makeSuggestion("mid", "test", 0.6),
      ],
    };
    engine.registerProvider(provider);
    const results = await engine.suggest(makeCtx("anything"));
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    expect(results[1]!.score).toBeGreaterThanOrEqual(results[2]!.score);
  });

  it("caps results at 3", async () => {
    const provider: SuggestionProvider = {
      id: "test",
      suggest: () => [
        makeSuggestion("a", "test", 0.9),
        makeSuggestion("b", "test", 0.8),
        makeSuggestion("c", "test", 0.7),
        makeSuggestion("d", "test", 0.6),
        makeSuggestion("e", "test", 0.5),
      ],
    };
    engine.registerProvider(provider);
    const results = await engine.suggest(makeCtx("anything"));
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("does not break when one provider throws", async () => {
    const good: SuggestionProvider = {
      id: "good",
      suggest: () => [makeSuggestion("ship", "good", 0.8)],
    };
    const bad: SuggestionProvider = {
      id: "bad",
      suggest: () => {
        throw new Error("provider exploded");
      },
    };
    engine.registerProvider(good);
    engine.registerProvider(bad);
    const results = await engine.suggest(makeCtx("ship"));
    // Should still return the good provider's result
    expect(results.some((r) => r.id === "ship")).toBe(true);
  });

  it("unregisters a provider correctly", async () => {
    const provider: SuggestionProvider = {
      id: "test",
      suggest: () => [makeSuggestion("ship", "test", 0.8)],
    };
    engine.registerProvider(provider);
    engine.unregisterProvider("test");
    const results = await engine.suggest(makeCtx("ship"));
    expect(results).toHaveLength(0);
  });
});
