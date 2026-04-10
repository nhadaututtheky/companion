/**
 * Unit tests for ws-context-tracker — token tracking, context updates, cost budget, context injection.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock dependencies
const mockBroadcastToAll = mock(() => {});
mock.module("./ws-broadcast.js", () => ({
  broadcastToAll: mockBroadcastToAll,
}));
mock.module("./pulse-estimator.js", () => ({
  getOrCreatePulse: () => ({
    recordContextUpdate: () => {},
    recordThinking: () => {},
  }),
}));
mock.module("./compact-manager.js", () => ({
  checkSmartCompact: mock(() => {}),
  clearCompactTimers: mock(() => {}),
}));
mock.module("./session-store.js", () => ({
  updateSessionCostWarned: mock(() => {}),
}));

import {
  broadcastContextUpdate,
  handleControlResponse,
  emitContextInjection,
  checkCostBudget,
  getPrevTokens,
  clearPrevTokens,
} from "./ws-context-tracker.js";
import type { ActiveSession } from "./session-store.js";

function createMockSession(overrides: Partial<ActiveSession["state"]> = {}): ActiveSession {
  return {
    id: "test-session",
    state: {
      session_id: "test-session",
      model: "claude-sonnet-4-6",
      status: "running",
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      cost_budget_usd: 0,
      cost_warned: 0,
      ...overrides,
    } as unknown as ActiveSession["state"],
    cliSend: null,
    browserSockets: new Set(),
    subscribers: new Map(),
    pendingPermissions: new Map(),
    autoApproveTimers: new Map(),
    autoApproveConfig: { enabled: false, timeoutSeconds: 0, allowBash: false },
    bypassDisabled: false,
    pendingMessages: [],
    messageHistory: [],
    hookSecret: "test-secret",
    pid: null,
    cliSessionId: null,
    extensionSend: null,
    machine: { status: "running", transition: () => true, canTransition: () => true } as any,
  };
}

describe("ws-context-tracker", () => {
  beforeEach(() => {
    clearPrevTokens("test-session");
    mockBroadcastToAll.mockClear();
  });

  describe("prevTokens tracking", () => {
    it("returns zero tokens for unknown session", () => {
      const prev = getPrevTokens("unknown");
      expect(prev.input).toBe(0);
      expect(prev.output).toBe(0);
    });

    it("clears tokens for a session", () => {
      // Trigger token storage via broadcastContextUpdate
      const session = createMockSession({
        total_input_tokens: 1000,
        total_output_tokens: 500,
      });
      broadcastContextUpdate(session);

      const prev = getPrevTokens("test-session");
      expect(prev.input).toBe(1000);

      clearPrevTokens("test-session");
      expect(getPrevTokens("test-session").input).toBe(0);
    });
  });

  describe("broadcastContextUpdate", () => {
    it("broadcasts context_update with token calculations", () => {
      const session = createMockSession({
        total_input_tokens: 5000,
        total_output_tokens: 1000,
      });

      broadcastContextUpdate(session);

      expect(mockBroadcastToAll).toHaveBeenCalledTimes(1);
      const msg = (mockBroadcastToAll.mock.calls as any[][])[0]![1];
      expect(msg.type).toBe("context_update");
      expect(msg.totalTokens).toBe(6000); // 5000 + 1000 (first call, prev = 0)
      expect(msg.maxTokens).toBeGreaterThan(0);
    });

    it("calculates delta tokens on subsequent calls", () => {
      const session = createMockSession({
        total_input_tokens: 5000,
        total_output_tokens: 1000,
      });

      // First call — stores baseline
      broadcastContextUpdate(session);

      // Second call — cumulative grows
      session.state = {
        ...session.state,
        total_input_tokens: 8000,
        total_output_tokens: 2000,
      };
      broadcastContextUpdate(session);

      const msg = (mockBroadcastToAll.mock.calls as any[][])[1]![1];
      // Delta: (8000-5000) + (2000-1000) = 4000
      expect(msg.totalTokens).toBe(4000);
    });
  });

  describe("handleControlResponse", () => {
    it("broadcasts context_update from get_context_usage response", () => {
      const session = createMockSession();

      handleControlResponse(session, {
        response: {
          subtype: "get_context_usage",
          usage: {
            input_tokens: 10000,
            output_tokens: 3000,
            context_window: 200000,
          },
        },
      });

      expect(mockBroadcastToAll).toHaveBeenCalledTimes(1);
      const msg = (mockBroadcastToAll.mock.calls as any[][])[0]![1];
      expect(msg.type).toBe("context_update");
      expect(msg.totalTokens).toBe(13000);
      expect(msg.maxTokens).toBe(200000);
    });

    it("ignores messages without response", () => {
      const session = createMockSession();
      handleControlResponse(session, {});
      expect(mockBroadcastToAll).not.toHaveBeenCalled();
    });

    it("ignores non-context_usage subtypes", () => {
      const session = createMockSession();
      handleControlResponse(session, {
        response: { subtype: "other_type" },
      });
      expect(mockBroadcastToAll).not.toHaveBeenCalled();
    });
  });

  describe("emitContextInjection", () => {
    it("broadcasts context:injection event with token estimate", () => {
      const session = createMockSession();

      emitContextInjection(session, "project_map", "Project context loaded", 4000);

      expect(mockBroadcastToAll).toHaveBeenCalledTimes(1);
      const msg = (mockBroadcastToAll.mock.calls as any[][])[0]![1];
      expect(msg.type).toBe("context:injection");
      expect(msg.injectionType).toBe("project_map");
      expect(msg.charCount).toBe(4000);
      expect(msg.tokenEstimate).toBe(1000); // ceil(4000/4)
    });
  });

  describe("checkCostBudget", () => {
    it("does nothing when no budget is set", () => {
      const session = createMockSession({ cost_budget_usd: 0, total_cost_usd: 5 });
      checkCostBudget(session);
      expect(mockBroadcastToAll).not.toHaveBeenCalled();
    });

    it("broadcasts warning at 80% budget", () => {
      const session = createMockSession({
        cost_budget_usd: 10,
        total_cost_usd: 8.5,
        cost_warned: 0,
      });

      checkCostBudget(session);

      expect(mockBroadcastToAll).toHaveBeenCalled();
      const msgs = (mockBroadcastToAll.mock.calls as any[][]).map((c) => c[1].type);
      expect(msgs).toContain("cost_warning");
      expect(msgs).toContain("budget_warning");
      expect(session.state.cost_warned).toBe(1);
    });

    it("broadcasts critical at 100% budget", () => {
      const session = createMockSession({
        cost_budget_usd: 10,
        total_cost_usd: 10.5,
        cost_warned: 0,
      });

      checkCostBudget(session);

      const msgs = (mockBroadcastToAll.mock.calls as any[][]).map((c) => c[1]);
      const critical = msgs.find((m) => m.type === "cost_warning" && m.level === "critical");
      expect(critical).toBeDefined();
      expect(session.state.cost_warned).toBe(2);
    });

    it("does not re-warn when already warned", () => {
      const session = createMockSession({
        cost_budget_usd: 10,
        total_cost_usd: 8.5,
        cost_warned: 1,
      });

      checkCostBudget(session);
      expect(mockBroadcastToAll).not.toHaveBeenCalled();
    });
  });
});
