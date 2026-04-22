/**
 * Unit tests for wiki/telemetry.ts — counter increment, per-domain rollup,
 * hit-rate computation, token aggregation, reset behavior.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { recordWikiOp, getWikiStats, resetWikiStats } from "./telemetry.js";

describe("wiki telemetry", () => {
  beforeEach(() => {
    resetWikiStats();
  });

  it("starts with zeroed counters", () => {
    const stats = getWikiStats();
    expect(stats.totals.search).toBe(0);
    expect(stats.totals.note).toBe(0);
    expect(stats.totals.l0_inject).toBe(0);
    expect(stats.tokens.deliveredToAgents).toBe(0);
    expect(stats.tokens.returnedBySearchRead).toBe(0);
    expect(stats.hitRate.search).toBeNull();
    expect(stats.hitRate.read).toBeNull();
    expect(stats.perDomain).toEqual([]);
  });

  it("increments totals for recorded events", () => {
    recordWikiOp({ type: "search", domain: "companion" });
    recordWikiOp({ type: "search_hit", domain: "companion" });
    recordWikiOp({ type: "search", domain: "companion" });
    recordWikiOp({ type: "search_miss", domain: "companion" });
    recordWikiOp({ type: "note", domain: "companion" });

    const stats = getWikiStats();
    expect(stats.totals.search).toBe(2);
    expect(stats.totals.search_hit).toBe(1);
    expect(stats.totals.search_miss).toBe(1);
    expect(stats.totals.note).toBe(1);
  });

  it("computes hit rate correctly", () => {
    // 3 searches: 2 hits, 1 miss
    recordWikiOp({ type: "search" });
    recordWikiOp({ type: "search_hit" });
    recordWikiOp({ type: "search" });
    recordWikiOp({ type: "search_hit" });
    recordWikiOp({ type: "search" });
    recordWikiOp({ type: "search_miss" });

    const stats = getWikiStats();
    expect(stats.hitRate.search).toBeCloseTo(2 / 3, 5);
  });

  it("sums tokens separately for agent delivery vs search/read return", () => {
    recordWikiOp({ type: "l0_inject", tokens: 1500 });
    recordWikiOp({ type: "l0_inject", tokens: 500 });
    recordWikiOp({ type: "search", tokens: 300 });
    recordWikiOp({ type: "read", tokens: 200 });
    // Events without tokens should not contribute
    recordWikiOp({ type: "note" });
    recordWikiOp({ type: "compile_run" });

    const stats = getWikiStats();
    expect(stats.tokens.deliveredToAgents).toBe(2000);
    expect(stats.tokens.returnedBySearchRead).toBe(500);
  });

  it("rolls up per-domain counts and sorts by activity", () => {
    // companion: 4 events
    recordWikiOp({ type: "search", domain: "companion" });
    recordWikiOp({ type: "search_hit", domain: "companion" });
    recordWikiOp({ type: "note", domain: "companion" });
    recordWikiOp({ type: "read", domain: "companion" });

    // research: 2 events
    recordWikiOp({ type: "search", domain: "research" });
    recordWikiOp({ type: "search_miss", domain: "research" });

    // untagged event — should appear in totals but NOT in any perDomain row
    recordWikiOp({ type: "l0_skip" });

    const stats = getWikiStats();
    expect(stats.perDomain.length).toBe(2);
    expect(stats.perDomain[0]!.domain).toBe("companion");
    expect(stats.perDomain[1]!.domain).toBe("research");
    expect(stats.perDomain[0]!.counts.search).toBe(1);
    expect(stats.perDomain[0]!.counts.note).toBe(1);
    expect(stats.perDomain[1]!.counts.search_miss).toBe(1);
    expect(stats.totals.l0_skip).toBe(1);
  });

  it("resetWikiStats clears all counters and updates firstSeenAt", () => {
    recordWikiOp({ type: "search", domain: "companion" });
    recordWikiOp({ type: "note", domain: "companion", tokens: 100 });

    const before = getWikiStats();
    expect(before.totals.search).toBe(1);
    expect(before.tokens.returnedBySearchRead).toBe(0);
    const firstSeen = before.firstSeenAt;

    // Small delay so firstSeenAt timestamp changes
    const now = Date.now();
    while (Date.now() === now) {
      // busy wait 1ms
    }

    resetWikiStats();

    const after = getWikiStats();
    expect(after.totals.search).toBe(0);
    expect(after.totals.note).toBe(0);
    expect(after.perDomain).toEqual([]);
    expect(after.lastSeenAt).toBeNull();
    expect(after.firstSeenAt).not.toBe(firstSeen);
  });

  it("never throws — bad/missing fields are tolerated", () => {
    expect(() => recordWikiOp({ type: "search" })).not.toThrow();
    expect(() => recordWikiOp({ type: "l0_inject", tokens: 0 })).not.toThrow();
    expect(() => recordWikiOp({ type: "note", tokens: -5 })).not.toThrow();

    // Negative tokens should NOT be added
    const stats = getWikiStats();
    expect(stats.tokens.deliveredToAgents).toBe(0);
    expect(stats.tokens.returnedBySearchRead).toBe(0);
  });
});
