/**
 * Unit tests for SessionStore — pure Zustand logic, no DOM/React needed.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { useSessionStore } from "../../lib/stores/session-store.js";

// Minimal valid session fixture
function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectSlug: "test-project",
    projectName: "Test Project",
    model: "claude-sonnet",
    status: "idle",
    state: "idle" as const,
    createdAt: Date.now(),
    ...overrides,
  };
}

function reset() {
  useSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    expandedSessionId: null,
    gridOrder: [],
    closedIds: new Set(),
  });
}

// ── setSession ────────────────────────────────────────────────────────────────

describe("SessionStore — setSession", () => {
  beforeEach(reset);

  it("creates a new session when the id is not yet present", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    expect(useSessionStore.getState().sessions["s1"]).toBeDefined();
  });

  it("stores all provided fields", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1", { model: "claude-opus" }));
    expect(useSessionStore.getState().sessions["s1"]!.model).toBe("claude-opus");
  });

  it("merges partial updates into an existing session", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1", { status: "idle" }));
    useSessionStore.getState().setSession("s1", { status: "running" });
    const s = useSessionStore.getState().sessions["s1"]!;
    expect(s.status).toBe("running");
    // Previously set fields survive
    expect(s.model).toBe("claude-sonnet");
  });

  it("does not affect other sessions", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().setSession("s2", makeSession("s2"));
    useSessionStore.getState().setSession("s1", { status: "running" });
    expect(useSessionStore.getState().sessions["s2"]!.status).toBe("idle");
  });

  it("can update contextUsedPercent", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().setSession("s1", { contextUsedPercent: 42 });
    expect(useSessionStore.getState().sessions["s1"]!.contextUsedPercent).toBe(42);
  });
});

// ── removeSession ─────────────────────────────────────────────────────────────

describe("SessionStore — removeSession", () => {
  beforeEach(reset);

  it("deletes the session from the map", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().removeSession("s1");
    expect(useSessionStore.getState().sessions["s1"]).toBeUndefined();
  });

  it("adds the id to closedIds", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().removeSession("s1");
    expect(useSessionStore.getState().closedIds.has("s1")).toBe(true);
  });

  it("removes id from gridOrder", () => {
    useSessionStore.getState().addToGrid("s1");
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().removeSession("s1");
    expect(useSessionStore.getState().gridOrder.includes("s1")).toBe(false);
  });

  it("clears activeSessionId when the active session is removed", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().setActiveSession("s1");
    useSessionStore.getState().removeSession("s1");
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });

  it("does not clear activeSessionId when a different session is removed", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().setSession("s2", makeSession("s2"));
    useSessionStore.getState().setActiveSession("s1");
    useSessionStore.getState().removeSession("s2");
    expect(useSessionStore.getState().activeSessionId).toBe("s1");
  });

  it("clears expandedSessionId when the expanded session is removed", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().setExpandedSession("s1");
    useSessionStore.getState().removeSession("s1");
    expect(useSessionStore.getState().expandedSessionId).toBeNull();
  });

  it("is a no-op for non-existent ids", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().removeSession("nonexistent");
    expect(Object.keys(useSessionStore.getState().sessions)).toHaveLength(1);
  });
});

// ── getSession / getActiveSessions ────────────────────────────────────────────

describe("SessionStore — getSession", () => {
  beforeEach(reset);

  it("returns the session by id", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    const s = useSessionStore.getState().getSession("s1");
    expect(s).toBeDefined();
    expect(s!.id).toBe("s1");
  });

  it("returns undefined for unknown id", () => {
    expect(useSessionStore.getState().getSession("ghost")).toBeUndefined();
  });
});

describe("SessionStore — getActiveSessions", () => {
  beforeEach(reset);

  it("returns sessions with running/waiting/idle status", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1", { status: "running" }));
    useSessionStore.getState().setSession("s2", makeSession("s2", { status: "waiting" }));
    useSessionStore.getState().setSession("s3", makeSession("s3", { status: "idle" }));
    useSessionStore.getState().setSession("s4", makeSession("s4", { status: "completed" }));
    const active = useSessionStore.getState().getActiveSessions();
    expect(active).toHaveLength(3);
    expect(active.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("returns empty array when no active sessions exist", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1", { status: "completed" }));
    expect(useSessionStore.getState().getActiveSessions()).toHaveLength(0);
  });
});

// ── grid operations ───────────────────────────────────────────────────────────

describe("SessionStore — grid operations", () => {
  beforeEach(reset);

  it("addToGrid appends the id when not already present", () => {
    useSessionStore.getState().addToGrid("s1");
    expect(useSessionStore.getState().gridOrder).toEqual(["s1"]);
  });

  it("addToGrid is idempotent", () => {
    useSessionStore.getState().addToGrid("s1");
    useSessionStore.getState().addToGrid("s1");
    expect(useSessionStore.getState().gridOrder).toHaveLength(1);
  });

  it("addToGrid removes the id from closedIds", () => {
    // Simulate a session that was previously closed
    useSessionStore.setState({ closedIds: new Set(["s1"]) });
    useSessionStore.getState().addToGrid("s1");
    expect(useSessionStore.getState().closedIds.has("s1")).toBe(false);
  });

  it("removeFromGrid removes the id and adds to closedIds", () => {
    useSessionStore.getState().addToGrid("s1");
    useSessionStore.getState().removeFromGrid("s1");
    expect(useSessionStore.getState().gridOrder.includes("s1")).toBe(false);
    expect(useSessionStore.getState().closedIds.has("s1")).toBe(true);
  });

  it("reorderGrid replaces the entire grid order", () => {
    useSessionStore.getState().addToGrid("s1");
    useSessionStore.getState().addToGrid("s2");
    useSessionStore.getState().reorderGrid(["s2", "s1"]);
    expect(useSessionStore.getState().gridOrder).toEqual(["s2", "s1"]);
  });
});

// ── cycleNotifyMode ───────────────────────────────────────────────────────────

describe("SessionStore — cycleNotifyMode", () => {
  beforeEach(reset);

  it("cycles visual → toast → off → visual", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1", { notifyMode: "visual" }));
    useSessionStore.getState().cycleNotifyMode("s1");
    expect(useSessionStore.getState().sessions["s1"]!.notifyMode).toBe("toast");
    useSessionStore.getState().cycleNotifyMode("s1");
    expect(useSessionStore.getState().sessions["s1"]!.notifyMode).toBe("off");
    useSessionStore.getState().cycleNotifyMode("s1");
    expect(useSessionStore.getState().sessions["s1"]!.notifyMode).toBe("visual");
  });

  it("treats undefined notifyMode as visual and cycles to toast", () => {
    useSessionStore.getState().setSession("s1", makeSession("s1"));
    useSessionStore.getState().cycleNotifyMode("s1");
    expect(useSessionStore.getState().sessions["s1"]!.notifyMode).toBe("toast");
  });

  it("is a no-op for non-existent session id", () => {
    const before = { ...useSessionStore.getState().sessions };
    useSessionStore.getState().cycleNotifyMode("ghost");
    expect(useSessionStore.getState().sessions).toEqual(before);
  });
});

// ── child session tracking ────────────────────────────────────────────────────

describe("SessionStore — child sessions", () => {
  beforeEach(reset);

  it("addChildSession links a child id to the parent", () => {
    useSessionStore.getState().setSession("parent", makeSession("parent"));
    useSessionStore.getState().addChildSession("parent", "child1");
    expect(useSessionStore.getState().sessions["parent"]!.childSessionIds).toContain("child1");
  });

  it("addChildSession is idempotent", () => {
    useSessionStore.getState().setSession("parent", makeSession("parent"));
    useSessionStore.getState().addChildSession("parent", "child1");
    useSessionStore.getState().addChildSession("parent", "child1");
    expect(useSessionStore.getState().sessions["parent"]!.childSessionIds).toHaveLength(1);
  });

  it("removeChildSession unlinks the child id", () => {
    useSessionStore.getState().setSession("parent", makeSession("parent"));
    useSessionStore.getState().addChildSession("parent", "child1");
    useSessionStore.getState().removeChildSession("parent", "child1");
    expect(useSessionStore.getState().sessions["parent"]!.childSessionIds).not.toContain("child1");
  });

  it("getChildSessions returns matching child session objects", () => {
    useSessionStore.getState().setSession("parent", makeSession("parent"));
    useSessionStore.getState().setSession("child1", makeSession("child1"));
    useSessionStore.getState().addChildSession("parent", "child1");
    const children = useSessionStore.getState().getChildSessions("parent");
    expect(children).toHaveLength(1);
    expect(children[0]!.id).toBe("child1");
  });

  it("getChildSessions returns empty array for unknown parent", () => {
    expect(useSessionStore.getState().getChildSessions("ghost")).toHaveLength(0);
  });

  it("getChildSessions skips child ids that have no session object", () => {
    useSessionStore.getState().setSession("parent", makeSession("parent"));
    useSessionStore.getState().addChildSession("parent", "missing-child");
    const children = useSessionStore.getState().getChildSessions("parent");
    expect(children).toHaveLength(0);
  });
});
