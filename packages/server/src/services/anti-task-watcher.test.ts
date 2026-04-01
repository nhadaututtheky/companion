/**
 * Unit tests for anti-task-watcher — computeDelta, buildProgressBar.
 * Pure functions, no DB or mocks needed.
 */

import { describe, it, expect, mock } from "bun:test";

// Mock DB client to prevent import errors (task-watcher imports settings-helpers)
mock.module("../db/client.js", () => ({
  getDb: () => {
    throw new Error("Not available in test");
  },
  getSqlite: () => null,
  closeDb: () => {},
}));

import { computeDelta, buildProgressBar } from "./anti-task-watcher.js";

describe("computeDelta", () => {
  it("detects newly added tasks", () => {
    const prev = [{ text: "task1", checked: false }];
    const curr = [
      { text: "task1", checked: false },
      { text: "task2", checked: false },
    ];
    const delta = computeDelta(prev, curr);
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0]!.text).toBe("task2");
    expect(delta.completed).toHaveLength(0);
  });

  it("detects completed tasks", () => {
    const prev = [
      { text: "task1", checked: false },
      { text: "task2", checked: false },
    ];
    const curr = [
      { text: "task1", checked: true },
      { text: "task2", checked: false },
    ];
    const delta = computeDelta(prev, curr);
    expect(delta.completed).toHaveLength(1);
    expect(delta.completed[0]!.text).toBe("task1");
    expect(delta.added).toHaveLength(0);
  });

  it("returns empty for no changes", () => {
    const tasks = [
      { text: "task1", checked: false },
      { text: "task2", checked: true },
    ];
    const delta = computeDelta(tasks, tasks);
    expect(delta.added).toHaveLength(0);
    expect(delta.completed).toHaveLength(0);
  });

  it("handles empty previous (all tasks are new)", () => {
    const curr = [
      { text: "task1", checked: false },
      { text: "task2", checked: true },
    ];
    const delta = computeDelta([], curr);
    expect(delta.added).toHaveLength(2);
    expect(delta.completed).toHaveLength(0);
  });

  it("does not count already-checked tasks as newly completed", () => {
    const prev = [{ text: "task1", checked: true }];
    const curr = [{ text: "task1", checked: true }];
    const delta = computeDelta(prev, curr);
    expect(delta.completed).toHaveLength(0);
  });
});

describe("buildProgressBar", () => {
  it("shows empty bar for 0/0", () => {
    expect(buildProgressBar(0, 0)).toBe("[░░░░░░░░░░] 0/0");
  });

  it("shows full bar for all done", () => {
    const bar = buildProgressBar(5, 5);
    expect(bar).toContain("██████████");
    expect(bar).toContain("100%");
  });

  it("shows half bar for 50%", () => {
    const bar = buildProgressBar(5, 10);
    expect(bar).toContain("█████░░░░░");
    expect(bar).toContain("50%");
  });

  it("shows correct ratio", () => {
    const bar = buildProgressBar(3, 10);
    expect(bar).toContain("3/10");
    expect(bar).toContain("30%");
  });
});
