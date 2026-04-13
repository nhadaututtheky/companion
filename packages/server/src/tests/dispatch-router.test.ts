/**
 * Unit tests for dispatch-router — routing classifier output to orchestration engines.
 * Lives in src/tests/ to isolate mock.module from other test files.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock dependencies ───────────────────────────────────────────────────────

const mockStartWorkflow = mock(() =>
  Promise.resolve({ channelId: "ch-wf-1", sessionId: "sess-wf-1" }),
);
const mockStartDebate = mock(() =>
  Promise.resolve({
    channelId: "ch-db-1",
    agents: [{ id: "a" }, { id: "b" }],
    status: "active",
  }),
);
const workflowEngineMockFactory = () => ({
  startWorkflow: mockStartWorkflow,
  initWorkflowEngine: mock(() => {}),
  onWorkflowSessionIdle: mock(() => Promise.resolve()),
  cancelWorkflow: mock(() => Promise.resolve(false)),
  getWorkflowStatus: mock(() => null),
  listWorkflows: mock(() => []),
});
mock.module("../services/workflow-engine.js", workflowEngineMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../services/workflow-engine.js"), workflowEngineMockFactory);

const debateEngineMockFactory = () => ({
  startDebate: mockStartDebate,
  getActiveDebate: mock(() => undefined),
  listActiveDebates: mock(() => []),
  concludeDebate: mock(() => Promise.resolve()),
  injectHumanMessage: mock(() => false),
});
mock.module("../services/debate-engine.js", debateEngineMockFactory);

// NOTE: Do NOT mock mention-router.js here — it pollutes mention-router.test.ts
// Instead, mock its dependencies (short-id, session-store) which are already mocked above.
const settingsHelpersMockFactory = () => ({
  getSetting: (key: string) => {
    const settings: Record<string, string> = {
      "orchestration.autoDispatch": "true",
      "orchestration.confidenceThreshold": "0.8",
    };
    return settings[key] ?? null;
  },
  getSettingInt: (_key: string, fallback: number) => fallback,
  getSettingBool: (_key: string, fallback: boolean) => fallback,
});
mock.module("../services/settings-helpers.js", settingsHelpersMockFactory);

const eventBusMockFactory = () => ({
  eventBus: { emit: mock(() => {}), on: mock(() => {}), off: mock(() => {}) },
});
mock.module("../services/event-bus.js", eventBusMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../services/event-bus.js"), eventBusMockFactory);

const aiClientMockFactory = () => ({
  callAI: mock(() => Promise.resolve({ text: "{}", costUsd: 0, inputTokens: 0 })),
  callAIWithModel: mock(() => Promise.resolve({ text: "{}", costUsd: 0, inputTokens: 0 })),
  isAIConfigured: () => false,
  getOpenRouterConfig: mock(() => null),
  translateViToEn: mock(() => Promise.resolve(null)),
});
mock.module("../services/ai-client.js", aiClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../services/ai-client.js"), aiClientMockFactory);

const shortIdMockFactory = () => ({
  resolveShortId: (id: string) => (id === "fox" ? "session-fox-123" : null),
  generateShortId: () => "mock-short-id",
});
mock.module("../services/short-id.js", shortIdMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../services/short-id.js"), shortIdMockFactory);

const sessionStoreMockFactory = () => ({
  getActiveSession: (id: string) => {
    if (id.startsWith("session-")) {
      return { id, state: { status: "running" } };
    }
    return null;
  },
  getAllActiveSessions: mock(() => []),
  removeActiveSession: mock(() => {}),
  createActiveSession: mock(() => ({})),
  pushMessageHistory: mock(() => {}),
  persistSession: mock(() => {}),
  flushAllWriters: mock(() => {}),
  createSessionRecord: mock(() => ({})),
  endSessionRecord: mock(() => {}),
  updateSessionCostWarned: mock(() => {}),
  countActiveSessions: mock(() => 0),
  bulkEndSessions: mock(() => 0),
  listSessions: mock(() => []),
  storeMessage: mock(() => {}),
  getSessionMessages: mock(() => []),
});
mock.module("../services/session-store.js", sessionStoreMockFactory);

import { dispatch, previewDispatchSync } from "../services/dispatch-router.js";
import type { TaskClassification } from "@companion/shared/types";

// ── Test helpers ────────────────────────────────────────────────────────────

function createCtx() {
  const sent: Array<{ sessionId: string; content: string }> = [];
  return {
    ctx: {
      originSessionId: "sess-origin",
      originShortId: "origin",
      projectSlug: "test-project",
      cwd: "/test",
      sendToSession: (sessionId: string, content: string) => {
        sent.push({ sessionId, content });
      },
    },
    sent,
  };
}

function makeClassification(overrides: Partial<TaskClassification>): TaskClassification {
  return {
    intent: "test",
    pattern: "single",
    complexity: "medium",
    relevantFiles: [],
    confidence: 0.9,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("dispatch-router", () => {
  beforeEach(() => {
    mockStartWorkflow.mockClear();
    mockStartDebate.mockClear();
  });

  describe("dispatch", () => {
    it("routes workflow classification to startWorkflow", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "workflow",
        suggestedTemplate: "code-review",
      });

      const result = await dispatch(classification, "review this code", ctx);

      expect(result.dispatched).toBe(true);
      expect(result.pattern).toBe("workflow");
      expect(result.sessionIds).toContain("sess-wf-1");
      expect(result.channelId).toBe("ch-wf-1");
      expect(mockStartWorkflow).toHaveBeenCalledTimes(1);
    });

    it("passes template slug to startWorkflow", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "workflow",
        suggestedTemplate: "pr-review",
      });

      await dispatch(classification, "review PR", ctx);

      const call = (mockStartWorkflow.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(call.templateId).toBe("pr-review");
      expect(call.projectSlug).toBe("test-project");
    });

    it("routes debate classification to startDebate", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "debate",
        suggestedDebateFormat: "pro_con",
      });

      const result = await dispatch(classification, "debate React vs Svelte", ctx);

      expect(result.dispatched).toBe(true);
      expect(result.pattern).toBe("debate");
      expect(result.channelId).toBe("ch-db-1");
      expect(mockStartDebate).toHaveBeenCalledTimes(1);
    });

    it("passes debate format to startDebate", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "debate",
        suggestedDebateFormat: "red_team",
      });

      await dispatch(classification, "red team this", ctx);

      const call = (mockStartDebate.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(call.format).toBe("red_team");
    });

    it("routes mention classification to handleMentions", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({ pattern: "mention" });

      const result = await dispatch(classification, "@fox check this", ctx);

      expect(result.dispatched).toBe(true);
      expect(result.pattern).toBe("mention");
      // handleMentions resolves @fox → session-fox-123 via short-id mock
      expect(result.sessionIds).toContain("session-fox-123");
    });

    it("routes single classification to origin session", async () => {
      const { ctx, sent } = createCtx();
      const classification = makeClassification({ pattern: "single" });

      const result = await dispatch(classification, "fix the bug", ctx);

      expect(result.dispatched).toBe(true);
      expect(result.pattern).toBe("single");
      expect(result.sessionIds).toContain("sess-origin");
      // Single pattern does NOT re-send — caller handles delivery
      expect(sent).toHaveLength(0);
    });

    it("falls back to single on engine error and sends message", async () => {
      mockStartWorkflow.mockImplementationOnce(() => {
        throw new Error("Engine crashed");
      });

      const { ctx, sent } = createCtx();
      const classification = makeClassification({
        pattern: "workflow",
        suggestedTemplate: "code-review",
      });

      const result = await dispatch(classification, "review code", ctx);

      expect(result.dispatched).toBe(false);
      expect(result.pattern).toBe("single");
      expect(result.error).toContain("Engine crashed");
      // Fallback sends message to origin so it's not silently dropped
      expect(sent).toHaveLength(1);
      expect(sent[0]!.sessionId).toBe("sess-origin");
    });

    it("defaults to implement-feature template when none suggested", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "workflow",
        // no suggestedTemplate
      });

      await dispatch(classification, "do something complex", ctx);

      const call = (mockStartWorkflow.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(call.templateId).toBe("implement-feature");
    });

    it("defaults to pro_con debate format when none suggested", async () => {
      const { ctx } = createCtx();
      const classification = makeClassification({
        pattern: "debate",
        // no suggestedDebateFormat
      });

      await dispatch(classification, "compare options", ctx);

      const call = (mockStartDebate.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(call.format).toBe("pro_con");
    });
  });

  describe("previewDispatchSync", () => {
    it("returns classification without dispatching", () => {
      const result = previewDispatchSync("debate React vs Vue");
      expect(result.pattern).toBe("debate");
      expect(result.suggestedDebateFormat).toBe("pro_con");
    });

    it("detects mentions", () => {
      const result = previewDispatchSync("@fox check this");
      expect(result.pattern).toBe("mention");
    });

    it("returns low confidence for unknown intents", () => {
      const result = previewDispatchSync("hello");
      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});
