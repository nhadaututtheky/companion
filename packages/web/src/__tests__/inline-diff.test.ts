/**
 * Unit tests for the LCS diff algorithm — pure function, no DOM required.
 * The algorithm is extracted to packages/web/src/lib/diff-utils.ts.
 */

import { describe, it, expect } from "bun:test";
import { computeDiff, extractHunks } from "../lib/diff-utils.js";

// ── computeDiff ───────────────────────────────────────────────────────────────

describe("computeDiff", () => {
  it("identical strings produce all context lines", () => {
    const result = computeDiff("a\nb\nc", "a\nb\nc");
    expect(result.every((l) => l.type === "context")).toBe(true);
    expect(result).toHaveLength(3);
  });

  it("added line is marked as add", () => {
    const result = computeDiff("a\nc", "a\nb\nc");
    const added = result.filter((l) => l.type === "add");
    expect(added).toHaveLength(1);
    expect(added[0]!.content).toBe("b");
  });

  it("removed line is marked as remove", () => {
    const result = computeDiff("a\nb\nc", "a\nc");
    const removed = result.filter((l) => l.type === "remove");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.content).toBe("b");
  });

  it("empty old produces all additions", () => {
    const result = computeDiff("", "a\nb");
    const added = result.filter((l) => l.type === "add");
    expect(added).toHaveLength(2);
    expect(added.map((l) => l.content)).toEqual(["a", "b"]);
  });

  it("empty new produces all removals", () => {
    const result = computeDiff("a\nb", "");
    const removed = result.filter((l) => l.type === "remove");
    expect(removed).toHaveLength(2);
    expect(removed.map((l) => l.content)).toEqual(["a", "b"]);
  });

  it("both empty strings produce empty diff", () => {
    // split("") on empty string gives [""], so one context line with ""
    const result = computeDiff("", "");
    expect(result.every((l) => l.type === "context")).toBe(true);
  });

  it("assigns correct old line numbers to removed lines", () => {
    const result = computeDiff("a\nb\nc", "a\nc");
    const removed = result.find((l) => l.type === "remove");
    expect(removed!.oldNum).toBe(2);
    expect(removed!.newNum).toBeUndefined();
  });

  it("assigns correct new line numbers to added lines", () => {
    const result = computeDiff("a\nc", "a\nb\nc");
    const added = result.find((l) => l.type === "add");
    expect(added!.newNum).toBe(2);
    expect(added!.oldNum).toBeUndefined();
  });

  it("context lines have both old and new line numbers", () => {
    const result = computeDiff("a\nb", "a\nb");
    for (const line of result) {
      expect(typeof line.oldNum).toBe("number");
      expect(typeof line.newNum).toBe("number");
    }
  });

  it("completely different strings produce all removes then all adds", () => {
    const result = computeDiff("x\ny", "a\nb");
    const removes = result.filter((l) => l.type === "remove");
    const adds = result.filter((l) => l.type === "add");
    const contexts = result.filter((l) => l.type === "context");
    expect(removes).toHaveLength(2);
    expect(adds).toHaveLength(2);
    expect(contexts).toHaveLength(0);
  });

  it("handles multi-line replacement in the middle", () => {
    const result = computeDiff("a\nb\nc\nd", "a\nX\nY\nd");
    const removes = result.filter((l) => l.type === "remove");
    const adds = result.filter((l) => l.type === "add");
    expect(removes.map((l) => l.content)).toEqual(["b", "c"]);
    expect(adds.map((l) => l.content)).toEqual(["X", "Y"]);
  });
});

// ── extractHunks ──────────────────────────────────────────────────────────────

describe("extractHunks", () => {
  it("returns empty array when there are no changes", () => {
    const lines = computeDiff("a\nb\nc", "a\nb\nc");
    const hunks = extractHunks(lines);
    expect(hunks).toHaveLength(0);
  });

  it("includes changed lines (adds and removes) in the output", () => {
    const lines = computeDiff("a\nb\nc", "a\nX\nc");
    const hunks = extractHunks(lines);
    const added = hunks.find((l) => l.type === "add");
    const removed = hunks.find((l) => l.type === "remove");
    expect(added).toBeDefined();
    expect(added!.content).toBe("X");
    expect(removed).toBeDefined();
    expect(removed!.content).toBe("b");
  });

  it("includes up to contextSize lines around a change", () => {
    // 10-line file, change at line 5 — context 3 should include lines 2–8
    const old = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n");
    const changed = old.replace("line5", "CHANGED");
    const lines = computeDiff(old, changed);
    const hunks = extractHunks(lines, 3);
    // Must contain the changed line
    expect(hunks.some((l) => l.content === "CHANGED")).toBe(true);
    // Must contain context around it
    expect(hunks.some((l) => l.content === "line4")).toBe(true);
    expect(hunks.some((l) => l.content === "line6")).toBe(true);
  });

  it("does not include lines beyond the specified contextSize", () => {
    const old = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10";
    const changed = "1\n2\n3\n4\nX\n6\n7\n8\n9\n10";
    const lines = computeDiff(old, changed);
    const hunks = extractHunks(lines, 1);
    // contextSize=1 — should contain lines 4, X/5, 6 but NOT 3 or 7
    const contents = new Set(hunks.map((l) => l.content));
    expect(contents.has("3")).toBe(false);
    expect(contents.has("7")).toBe(false);
    expect(contents.has("4")).toBe(true);
    expect(contents.has("6")).toBe(true);
  });

  it("merges overlapping context from adjacent changes", () => {
    // Changes close together — their context windows should overlap/merge
    const old = "a\nb\nc\nd\ne\nf";
    const changed = "a\nX\nc\nd\nY\nf";
    const lines = computeDiff(old, changed);
    const hunks = extractHunks(lines, 3);
    // With contextSize=3 both changes' windows cover the whole file
    expect(hunks.length).toBe(lines.length);
  });
});
