/**
 * Unit tests for ws-message-handler — NormalizedMessage routing, CLI message parsing,
 * system init, assistant handling, and result finalization.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Module mocks (must be before imports) ───────────────────────────────────

const wsStreamHandlerMockFactory = () => ({
  forceFlushStreamBatch: mock(() => {}),
  bufferEarlyResult: mock(() => {}),
  clearEarlyResult: mock(() => {}),
  getEarlyResult: mock(() => null),
  replayEarlyResult: mock(() => false),
  handleStreamEvent: mock(() => {}),
  handleToolProgress: mock(() => {}),
});
mock.module("./ws-stream-handler.js", wsStreamHandlerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-stream-handler.js"), wsStreamHandlerMockFactory);

const wsBroadcastMockFactory = () => ({
  broadcastToAll: mock(() => {}),
  broadcastToSubscribers: mock(() => {}),
});
mock.module("./ws-broadcast.js", wsBroadcastMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-broadcast.js"), wsBroadcastMockFactory);

const pulseEstimatorMockFactory = () => ({
  getOrCreatePulse: mock(() => ({
    recordToolUse: mock(() => {}),
    recordToolResult: mock(() => {}),
    recordAssistantText: mock(() => {}),
    recordThinking: mock(() => {}),
  })),
  finalizePulseTurn: mock(() => null),
  cleanupPulse: mock(() => {}),
  getPulse: mock(() => undefined),
  getLatestReading: mock(() => null),
});
mock.module("./pulse-estimator.js", pulseEstimatorMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./pulse-estimator.js"), pulseEstimatorMockFactory);

// Shared singleton so both the relative-path and absolute-path mocks
// resolve to the same instance on Linux (factories called twice would
// produce two disconnected mock objects — SUT would call one, tests
// would assert on the other).
const sessionStoreMock = {
  persistSession: mock(() => {}),
  storeMessage: mock(() => {}),
  updateCliSessionId: mock(() => {}),
  pushMessageHistory: mock(() => {}),
  getSessionRecord: mock(() => null),
  getActiveSessions: mock(() => new Map()),
  createSession: mock(() => {}),
  deleteSession: mock(() => {}),
};
mock.module("./session-store.js", () => sessionStoreMock);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./session-store.js"), () => sessionStoreMock);

const contextBudgetMockFactory = () => ({
  getFullBreakdown: mock(() => ({ total: 0, breakdown: [] })),
  getWikiStartContext: mock(() => null),
});
mock.module("./context-budget.js", contextBudgetMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./context-budget.js"), contextBudgetMockFactory);

const agentContextProviderMockFactory = () => ({
  buildProjectMap: mock(() => null),
  buildMessageContext: mock(() => null),
  buildActivityContext: mock(() => null),
  clearActivityState: mock(() => {}),
  reviewPlan: mock(() => null),
  checkBreaks: mock(() => null),
  hasPlanIndicators: mock(() => false),
  extractFilePaths: mock(() => []),
  getCodeGraphConfig: mock(() => ({
    injectionEnabled: false,
    planReviewEnabled: false,
    breakCheckEnabled: false,
  })),
});
mock.module("../codegraph/agent-context-provider.js", agentContextProviderMockFactory);
if (process.platform !== "win32")
  mock.module(
    import.meta.resolve("../codegraph/agent-context-provider.js"),
    agentContextProviderMockFactory,
  );

const codeGraphIndexMockFactory = () => ({
  isGraphReady: mock(() => false),
});
mock.module("../codegraph/index.js", codeGraphIndexMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../codegraph/index.js"), codeGraphIndexMockFactory);

const eventCollectorMockFactory = () => ({
  processToolEvent: mock(() => null),
});
mock.module("../codegraph/event-collector.js", eventCollectorMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../codegraph/event-collector.js"), eventCollectorMockFactory);

const wsContextTrackerMockFactory = () => ({
  handleControlResponse: mock(() => {}),
  emitContextInjection: mock(() => {}),
  broadcastContextUpdate: mock(() => {}),
  requestContextUsage: mock(() => {}),
  checkCostBudget: mock(() => {}),
  checkSmartCompact: mock(() => {}),
});
mock.module("./ws-context-tracker.js", wsContextTrackerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-context-tracker.js"), wsContextTrackerMockFactory);

const wsPermissionHandlerMockFactory = () => ({
  handleControlRequest: mock(() => {}),
});
mock.module("./ws-permission-handler.js", wsPermissionHandlerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-permission-handler.js"), wsPermissionHandlerMockFactory);

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { MessageHandler } from "./ws-message-handler.js";
import { forceFlushStreamBatch } from "./ws-stream-handler.js";
import type { ActiveSession } from "./session-store.js";
import type { MessageHandlerBridge } from "./ws-message-handler.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockSession(id = "test-session"): ActiveSession {
  return {
    id,
    state: {
      session_id: id,
      model: "claude-sonnet-4-6",
      status: "running",
      cwd: "/test/cwd",
      tools: [],
      mcp_servers: [],
      files_read: [],
      files_modified: [],
      files_created: [],
      total_cost_usd: 0,
      num_turns: 0,
      total_lines_added: 0,
      total_lines_removed: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      is_in_plan_mode: false,
      name: "Test Session",
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

function createMockBridge(): MessageHandlerBridge {
  const mockRtkPipeline = {
    transform: mock(() => ({
      compressed: "test output",
      savings: {
        totalTokensSaved: 0,
        strategiesApplied: [],
        ratio: 1,
        cached: false,
        budgetTruncated: false,
      },
    })),
    compressToolOutput: mock(() => ({ compressed: false, output: "test" })),
    clearSessionCache: mock(() => {}),
  };

  const mockIdleDetector = {
    recordOutput: mock(() => {}),
    stopTracking: mock(() => {}),
    startTracking: mock(() => {}),
  };

  return {
    broadcastToAll: mock(() => {}),
    broadcastToSubscribers: mock(() => {}),
    updateStatus: mock(() => {}),
    persistSession: mock(() => {}),
    emitContextInjection: mock(() => {}),
    broadcastContextUpdate: mock(() => {}),
    requestContextUsage: mock(() => {}),
    checkCostBudget: mock(() => {}),
    checkSmartCompact: mock(() => {}),
    startIdleTimer: mock(() => {}),
    sendToCLI: mock(() => {}),
    reloadRTKConfig: mock(() => {}),
    getRtkPipeline: mock(() => mockRtkPipeline as any),
    getIdleDetector: mock(() => mockIdleDetector as any),
    getPlanWatcher: mock(() => undefined),
    getSessionSettings: mock(() => ({
      idleTimeoutMs: 3600000,
      keepAlive: false,
      autoReinjectOnCompact: true,
    })),
    handleStreamEvent: mock(() => {}),
    handleControlRequest: mock(() => {}),
    handleToolProgress: mock(() => {}),
    handleControlResponse: mock(() => {}),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MessageHandler", () => {
  let session: ActiveSession;
  let bridge: MessageHandlerBridge;
  let handler: MessageHandler;

  beforeEach(() => {
    session = createMockSession();
    bridge = createMockBridge();
    handler = new MessageHandler(bridge);
  });

  // ── handleNormalizedMessage ────────────────────────────────────────────────

  describe("handleNormalizedMessage", () => {
    it("routes claude platform messages with raw to handleCLIMessage", () => {
      const rawLine = JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/test",
        session_id: "cli-sess-1",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "default",
        claude_code_version: "1.0.0",
        slash_commands: [],
        uuid: "",
      });

      handler.handleNormalizedMessage(session, {
        platform: "claude",
        type: "system_init",
        raw: rawLine,
      } as any);

      // Should have called bridge methods from handleSystemInit via handleCLIMessage
      expect((bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
      const firstCall = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls[0]!;
      expect(firstCall[1]!.type).toBe("session_init");
    });

    it("routes non-Claude system_init to handleSystemInit", () => {
      handler.handleNormalizedMessage(session, {
        platform: "opencode",
        type: "system_init",
        cwd: "/opencode/cwd",
        sessionId: "oc-session",
        tools: ["Read", "Write"],
        model: "gpt-4o",
        permissionMode: "auto",
        cliVersion: "2.0.0",
      } as any);

      expect(session.state.cwd).toBe("/opencode/cwd");
      expect(session.state.model).toBe("gpt-4o");
      expect(session.state.status).toBe("idle");
      expect((bridge.updateStatus as ReturnType<typeof mock>).mock.calls[0]![1]).toBe("idle");
    });

    it("routes non-Claude assistant message to handleAssistant", () => {
      handler.handleNormalizedMessage(session, {
        platform: "opencode",
        type: "assistant",
        contentBlocks: [{ type: "text", text: "Hello from OpenCode" }],
        model: "gpt-4o",
        stopReason: "end_turn",
        tokenUsage: { input: 10, output: 20, cacheCreation: 0, cacheRead: 0 },
      } as any);

      // broadcastToAll should be called with assistant message
      const calls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const assistantCall = calls.find((c: any[]) => c[1]?.type === "assistant");
      expect(assistantCall).toBeDefined();
    });

    it("routes non-Claude complete message to handleResult", () => {
      handler.handleNormalizedMessage(session, {
        platform: "opencode",
        type: "complete",
        isError: false,
        resultText: "Done.",
        durationMs: 1500,
        numTurns: 2,
        costUsd: 0.01,
        tokenUsage: { input: 100, output: 50, cacheCreation: 0, cacheRead: 0 },
      } as any);

      // forceFlushStreamBatch should be called before broadcasting result
      expect((forceFlushStreamBatch as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );

      const calls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const resultCall = calls.find((c: any[]) => c[1]?.type === "result");
      expect(resultCall).toBeDefined();
      expect((bridge.updateStatus as ReturnType<typeof mock>).mock.calls.at(-1)![1]).toBe("idle");
    });

    it("records output via idleDetector for every normalized message", () => {
      const idleDetector = bridge.getIdleDetector();

      handler.handleNormalizedMessage(session, {
        platform: "opencode",
        type: "keep_alive",
      } as any);

      expect((idleDetector.recordOutput as ReturnType<typeof mock>).mock.calls.length).toBe(1);
      expect((idleDetector.recordOutput as ReturnType<typeof mock>).mock.calls[0]![0]).toBe(
        session.id,
      );
    });
  });

  // ── handleCLIMessage ───────────────────────────────────────────────────────

  describe("handleCLIMessage", () => {
    it("handles system:init NDJSON line and updates session state", () => {
      const line = JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/cli/cwd",
        session_id: "cli-abc",
        tools: ["Read"],
        mcp_servers: [],
        model: "claude-opus-4-6",
        permissionMode: "default",
        claude_code_version: "1.2.3",
        slash_commands: [],
        uuid: "",
      });

      handler.handleCLIMessage(session, line);

      expect(session.state.cwd).toBe("/cli/cwd");
      expect(session.state.model).toBe("claude-opus-4-6");
      expect(session.cliSessionId).toBe("cli-abc");
    });

    it("handles assistant NDJSON line and broadcasts", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          id: "msg-1",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "Hello!" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      });

      handler.handleCLIMessage(session, line);

      const calls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const assistantCall = calls.find((c: any[]) => c[1]?.type === "assistant");
      expect(assistantCall).toBeDefined();
    });

    it("handles result NDJSON line and triggers idle + persistSession", () => {
      const line = JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Task complete",
        duration_ms: 3000,
        duration_api_ms: 2500,
        num_turns: 1,
        total_cost_usd: 0.005,
        stop_reason: null,
        usage: {
          input_tokens: 50,
          output_tokens: 30,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        uuid: "",
        session_id: session.id,
      });

      handler.handleCLIMessage(session, line);

      expect((bridge.updateStatus as ReturnType<typeof mock>).mock.calls.at(-1)![1]).toBe("idle");
      expect((bridge.persistSession as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
    });

    it("silently ignores non-JSON lines", () => {
      // Should not throw and should not broadcast anything
      expect(() => handler.handleCLIMessage(session, "not json")).not.toThrow();
      expect((bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });

    it("routes control_response to bridge.handleControlResponse", () => {
      const line = JSON.stringify({
        type: "control_response",
        request_id: "req-1",
        data: { context_tokens: 5000 },
      });

      handler.handleCLIMessage(session, line);

      expect(
        (bridge.handleControlResponse as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
    });
  });

  // ── handleSystemInit ───────────────────────────────────────────────────────

  describe("handleSystemInit", () => {
    it("sets session model, tools, cwd, status on init", () => {
      handler.handleSystemInit(session, {
        type: "system",
        subtype: "init",
        cwd: "/project",
        session_id: "sess-xyz",
        tools: ["Read", "Write", "Edit"],
        mcp_servers: [{ name: "test", type: "stdio" }],
        model: "claude-haiku-4-5",
        permissionMode: "auto",
        claude_code_version: "1.0.0",
        slash_commands: [],
        uuid: "",
      } as any);

      expect(session.state.cwd).toBe("/project");
      expect(session.state.model).toBe("claude-haiku-4-5");
      expect(session.state.tools).toEqual(["Read", "Write", "Edit"]);
      expect(session.state.status).toBe("idle");
    });

    it("persists cliSessionId from system init", () => {
      handler.handleSystemInit(session, {
        type: "system",
        subtype: "init",
        cwd: "/test",
        session_id: "internal-cli-id",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "default",
        claude_code_version: "1.0.0",
        slash_commands: [],
        uuid: "",
      } as any);

      expect(session.cliSessionId).toBe("internal-cli-id");
    });

    it("broadcasts session_init and calls updateStatus idle + persistSession", () => {
      handler.handleSystemInit(session, {
        type: "system",
        subtype: "init",
        cwd: "/test",
        session_id: "s1",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "default",
        claude_code_version: "1.0.0",
        slash_commands: [],
        uuid: "",
      } as any);

      const broadcastCalls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const initBroadcast = broadcastCalls.find((c: any[]) => c[1]?.type === "session_init");
      expect(initBroadcast).toBeDefined();
      expect((bridge.updateStatus as ReturnType<typeof mock>).mock.calls[0]![1]).toBe("idle");
      expect((bridge.persistSession as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
    });
  });

  // ── handleAssistant ────────────────────────────────────────────────────────

  describe("handleAssistant", () => {
    it("broadcasts assistant message to all", () => {
      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-2",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "Processing..." }],
          stop_reason: null,
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      const calls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const assistantCall = calls.find((c: any[]) => c[1]?.type === "assistant");
      expect(assistantCall).toBeDefined();
    });

    it("stores message in history via pushMessageHistory", async () => {
      const { pushMessageHistory } = await import("./session-store.js");

      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-3",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [{ type: "text", text: "Stored." }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 5,
            output_tokens: 3,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect((pushMessageHistory as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
    });

    it("tracks file reads from tool_use Read blocks", () => {
      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-4",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-1",
              name: "Read",
              input: { file_path: "/test/foo.ts" },
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.files_read).toContain("/test/foo.ts");
    });

    it("tracks file modifications from tool_use Edit blocks", () => {
      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-edit",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-edit",
              name: "Edit",
              input: { file_path: "/test/bar.ts", old_string: "a", new_string: "b" },
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.files_modified).toContain("/test/bar.ts");
    });

    it("tracks Write to previously-read file as modification", () => {
      // Pre-populate files_read
      session.state = { ...session.state, files_read: ["/test/existing.ts"] };

      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-write-mod",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-write",
              name: "Write",
              input: { file_path: "/test/existing.ts", content: "new content" },
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.files_modified).toContain("/test/existing.ts");
      expect(session.state.files_created).not.toContain("/test/existing.ts");
    });

    it("tracks Write to new file as creation", () => {
      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-write-new",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-write-new",
              name: "Write",
              input: { file_path: "/test/brand-new.ts", content: "fresh" },
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.files_created).toContain("/test/brand-new.ts");
      expect(session.state.files_modified).not.toContain("/test/brand-new.ts");
    });

    it("detects EnterPlanMode tool and sets is_in_plan_mode", () => {
      const mockWatcher = { onEnterPlan: mock(() => {}), onExitPlan: mock(() => {}) };
      (bridge.getPlanWatcher as ReturnType<typeof mock>).mockReturnValue(mockWatcher);

      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-plan",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-plan",
              name: "EnterPlanMode",
              input: {},
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.is_in_plan_mode).toBe(true);
      expect(mockWatcher.onEnterPlan).toHaveBeenCalled();
    });

    it("detects ExitPlanMode tool and clears is_in_plan_mode", () => {
      session.state = { ...session.state, is_in_plan_mode: true };
      const mockWatcher = { onEnterPlan: mock(() => {}), onExitPlan: mock(() => {}) };
      (bridge.getPlanWatcher as ReturnType<typeof mock>).mockReturnValue(mockWatcher);

      handler.handleAssistant(session, {
        type: "assistant",
        message: {
          id: "msg-exitplan",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-6",
          content: [
            {
              type: "tool_use",
              id: "tu-exitplan",
              name: "ExitPlanMode",
              input: {},
            },
          ],
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.is_in_plan_mode).toBe(false);
      expect(mockWatcher.onExitPlan).toHaveBeenCalled();
    });

    it("does not duplicate files in tracking arrays", () => {
      session.state = { ...session.state, files_read: ["/test/dup.ts"] };

      // Read same file twice
      for (let i = 0; i < 2; i++) {
        handler.handleAssistant(session, {
          type: "assistant",
          message: {
            id: `msg-dup-${i}`,
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-6",
            content: [
              {
                type: "tool_use",
                id: `tu-dup-${i}`,
                name: "Read",
                input: { file_path: "/test/dup.ts" },
              },
            ],
            stop_reason: null,
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
          parent_tool_use_id: null,
          uuid: "",
          session_id: session.id,
        } as any);
      }

      const readCount = session.state.files_read.filter((f: string) => f === "/test/dup.ts").length;
      expect(readCount).toBe(1);
    });
  });

  // ── handleResult ──────────────────────────────────────────────────────────

  describe("handleResult", () => {
    it("calls forceFlushStreamBatch before broadcasting result", () => {
      handler.handleResult(session, {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done",
        duration_ms: 1000,
        duration_api_ms: 900,
        num_turns: 1,
        total_cost_usd: 0.002,
        stop_reason: null,
        usage: {
          input_tokens: 30,
          output_tokens: 20,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        uuid: "",
        session_id: session.id,
      } as any);

      const flushCalls = (forceFlushStreamBatch as ReturnType<typeof mock>).mock.calls;
      expect(flushCalls.length).toBeGreaterThan(0);
      // The most recent flush call should reference this session
      const lastFlushCall = flushCalls[flushCalls.length - 1]!;
      expect(lastFlushCall[0]).toBe(session);
    });

    it("broadcasts result message and updates status to idle", () => {
      handler.handleResult(session, {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Complete",
        duration_ms: 500,
        duration_api_ms: 450,
        num_turns: 2,
        total_cost_usd: 0.01,
        stop_reason: null,
        usage: {
          input_tokens: 100,
          output_tokens: 80,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        uuid: "",
        session_id: session.id,
      } as any);

      const calls = (bridge.broadcastToAll as ReturnType<typeof mock>).mock.calls;
      const resultCall = calls.find((c: any[]) => c[1]?.type === "result");
      expect(resultCall).toBeDefined();
      expect((bridge.updateStatus as ReturnType<typeof mock>).mock.calls.at(-1)![1]).toBe("idle");
    });

    it("stores result in message history", async () => {
      const { pushMessageHistory } = await import("./session-store.js");

      handler.handleResult(session, {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Stored result",
        duration_ms: 200,
        duration_api_ms: 180,
        num_turns: 1,
        total_cost_usd: 0.001,
        stop_reason: null,
        usage: {
          input_tokens: 10,
          output_tokens: 8,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        uuid: "",
        session_id: session.id,
      } as any);

      expect((pushMessageHistory as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
    });

    it("updates session state with cost and token counts from result", () => {
      handler.handleResult(session, {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done",
        duration_ms: 100,
        duration_api_ms: 90,
        num_turns: 3,
        total_cost_usd: 0.05,
        stop_reason: null,
        usage: {
          input_tokens: 200,
          output_tokens: 150,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
        total_lines_added: 42,
        total_lines_removed: 7,
        uuid: "",
        session_id: session.id,
      } as any);

      expect(session.state.total_cost_usd).toBe(0.05);
      expect(session.state.num_turns).toBe(3);
      expect(session.state.total_lines_added).toBe(42);
      expect(session.state.total_lines_removed).toBe(7);
      expect(session.state.total_input_tokens).toBe(200);
      expect(session.state.total_output_tokens).toBe(150);
    });

    it("starts idle timer and triggers post-result checks", () => {
      handler.handleResult(session, {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done",
        duration_ms: 100,
        duration_api_ms: 90,
        num_turns: 1,
        total_cost_usd: 0,
        stop_reason: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        uuid: "",
        session_id: session.id,
      } as any);

      expect((bridge.startIdleTimer as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
      expect((bridge.checkCostBudget as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
      expect(
        (bridge.checkSmartCompact as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
    });
  });
});
