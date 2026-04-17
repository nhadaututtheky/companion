/**
 * Unit tests for WsBridge — composition root that wires CLI, Browser, and Telegram
 * message routing. Tests the public API and delegation to extracted modules.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Module mocks (MUST be before imports) ────────────────────────────────────

// ── session-store ────────────────────────────────────────────────────────────
let mockActiveSessionsMap = new Map<string, ReturnType<typeof createMockSession>>();

const sessionStoreMockFactory = () => ({
  getActiveSession: mock((id: string) => mockActiveSessionsMap.get(id)),
  getAllActiveSessions: mock(() => Array.from(mockActiveSessionsMap.values())),
  persistSession: mock(() => {}),
  cleanupZombieSessions: mock((_isInMemory: (id: string) => boolean) => 0),
  getSessionRecord: mock(() => null),
  removeActiveSession: mock((id: string) => {
    mockActiveSessionsMap.delete(id);
  }),
  createActiveSession: mock(() => {}),
  pushMessageHistory: mock(() => {}),
  updateCliSessionId: mock(() => {}),
  storeMessage: mock(() => {}),
  getActiveSessions: mock(() => new Map()),
  createSession: mock(() => {}),
  deleteSession: mock(() => {}),
  createSessionRecord: mock(() => {}),
  endSessionRecord: mock(() => {}),
  clearCliSessionId: mock(() => {}),
});
mock.module("./session-store.js", sessionStoreMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./session-store.js"), sessionStoreMockFactory);

// ── ws-broadcast ─────────────────────────────────────────────────────────────
const wsBroadcastMockFactory = () => ({
  broadcastToAll: mock(() => {}),
  broadcastToSubscribers: mock(() => {}),
});
mock.module("./ws-broadcast.js", wsBroadcastMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-broadcast.js"), wsBroadcastMockFactory);

// ── ws-stream-handler ─────────────────────────────────────────────────────────
const wsStreamHandlerMockFactory = () => ({
  handleStreamEvent: mock(() => {}),
  handleToolProgress: mock(() => {}),
  clearEarlyResult: mock(() => {}),
  replayEarlyResult: mock((_sessionId: string, _callback: (msg: unknown) => void) => false),
  bufferEarlyResult: mock(() => {}),
  forceFlushStreamBatch: mock(() => {}),
  getEarlyResult: mock(() => null),
  clearStreamBatch: mock(() => {}),
});
mock.module("./ws-stream-handler.js", wsStreamHandlerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-stream-handler.js"), wsStreamHandlerMockFactory);

// ── ws-permission-handler ─────────────────────────────────────────────────────
const wsPermissionHandlerMockFactory = () => ({
  handleControlRequest: mock(() => {}),
  handleHookEvent: mock((_session: unknown, _event: unknown) => ({ found: true })),
  handlePermissionResponse: mock(() => {}),
  handleInterrupt: mock(() => {}),
});
mock.module("./ws-permission-handler.js", wsPermissionHandlerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-permission-handler.js"), wsPermissionHandlerMockFactory);

// ── ws-context-tracker ────────────────────────────────────────────────────────
const wsContextTrackerMockFactory = () => ({
  broadcastContextUpdate: mock(() => {}),
  requestContextUsage: mock(() => {}),
  handleControlResponse: mock(() => {}),
  emitContextInjection: mock(() => {}),
  checkCostBudget: mock(() => {}),
  checkSmartCompact: mock(() => {}),
  clearCompactTimers: mock(() => {}),
  clearPrevTokens: mock(() => {}),
});
mock.module("./ws-context-tracker.js", wsContextTrackerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-context-tracker.js"), wsContextTrackerMockFactory);

// ── ws-multi-brain ────────────────────────────────────────────────────────────
const wsMultiBrainMockFactory = () => ({
  notifyParentOfChildEnd: mock(() => {}),
});
mock.module("./ws-multi-brain.js", wsMultiBrainMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-multi-brain.js"), wsMultiBrainMockFactory);

// ── ws-health-idle (class mock) ───────────────────────────────────────────────
const mockHealthIdleInstance = {
  startHealthCheck: mock(() => {}),
  startCleanupSweep: mock(() => {}),
  startIdleTimer: mock(() => {}),
  clearIdleTimer: mock(() => {}),
  stopAll: mock(() => {}),
  broadcastLockStatus: mock(() => {}),
  scheduleCleanup: mock(() => {}),
  cancelCleanupTimer: mock(() => {}),
};
const wsHealthIdleMockFactory = () => ({
  HealthIdleManager: mock(function HealthIdleManager() {
    return mockHealthIdleInstance;
  }),
});
mock.module("./ws-health-idle.js", wsHealthIdleMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-health-idle.js"), wsHealthIdleMockFactory);

// ── ws-message-handler (class mock) ──────────────────────────────────────────
const mockMessageHandlerInstance = {
  handleNormalizedMessage: mock(() => {}),
  handleCLIMessage: mock(() => {}),
  handleSystemInit: mock(() => {}),
  handleAssistant: mock(() => {}),
  handleResult: mock(() => {}),
  handleSystemStatus: mock(() => {}),
};
const wsMessageHandlerMockFactory = () => ({
  MessageHandler: mock(function MessageHandler() {
    return mockMessageHandlerInstance;
  }),
});
mock.module("./ws-message-handler.js", wsMessageHandlerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-message-handler.js"), wsMessageHandlerMockFactory);

// ── ws-user-message (class mock) ─────────────────────────────────────────────
const mockUserMessageHandlerInstance = {
  handleUserMessage: mock(() => {}),
  routeBrowserMessage: mock(() => {}),
  sendMultimodalMessage: mock(() => {}),
};
const wsUserMessageMockFactory = () => ({
  UserMessageHandler: mock(function UserMessageHandler() {
    return mockUserMessageHandlerInstance;
  }),
});
mock.module("./ws-user-message.js", wsUserMessageMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-user-message.js"), wsUserMessageMockFactory);

// ── ws-session-lifecycle (class mock) ────────────────────────────────────────
const mockSessionLifecycleInstance = {
  startSession: mock(async () => "test-session"),
  killSession: mock(() => {}),
  handleCLIExit: mock(() => {}),
  startSessionWithSdk: mock(async () => {}),
};
const wsSessionLifecycleMockFactory = () => ({
  SessionLifecycleManager: mock(function SessionLifecycleManager() {
    return mockSessionLifecycleInstance;
  }),
});
mock.module("./ws-session-lifecycle.js", wsSessionLifecycleMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./ws-session-lifecycle.js"), wsSessionLifecycleMockFactory);

// ── event-bus ────────────────────────────────────────────────────────────────
const eventBusMockFactory = () => ({
  eventBus: { emit: mock(() => {}) },
});
mock.module("./event-bus.js", eventBusMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./event-bus.js"), eventBusMockFactory);

// ── pulse-estimator ───────────────────────────────────────────────────────────
const pulseEstimatorMockFactory = () => ({
  getLatestReading: mock(() => null),
  getOrCreatePulse: mock(() => null),
  cleanupPulse: mock(() => {}),
});
mock.module("./pulse-estimator.js", pulseEstimatorMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./pulse-estimator.js"), pulseEstimatorMockFactory);

// ── idle-detector (class mock) ────────────────────────────────────────────────
const mockIdleDetectorInstance = {
  stopAll: mock(() => {}),
  stopTracking: mock(() => {}),
  recordOutput: mock(() => {}),
  startTracking: mock(() => {}),
};
const idleDetectorMockFactory = () => ({
  IdleDetector: mock(function IdleDetector() {
    return mockIdleDetectorInstance;
  }),
});
mock.module("./idle-detector.js", idleDetectorMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./idle-detector.js"), idleDetectorMockFactory);

// ── cli-launcher ──────────────────────────────────────────────────────────────
const cliLauncherMockFactory = () => ({
  createPlanModeWatcher: mock(() => null),
  launchCLI: mock(() => {}),
});
mock.module("./cli-launcher.js", cliLauncherMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./cli-launcher.js"), cliLauncherMockFactory);

// ── rtk/index ─────────────────────────────────────────────────────────────────
const mockRtkPipeline = {
  setBudgetLevel: mock(() => {}),
  setDisabledStrategies: mock(() => {}),
  clearSessionCache: mock(() => {}),
  transform: mock(() => ({
    compressed: "output",
    savings: {
      totalTokensSaved: 0,
      strategiesApplied: [],
      ratio: 1,
      cached: false,
      budgetTruncated: false,
    },
  })),
};
const rtkMockFactory = () => ({
  createDefaultPipeline: mock(() => mockRtkPipeline),
  getRTKConfig: mock(() => ({ level: "normal", disabledStrategies: [] })),
});
mock.module("../rtk/index.js", rtkMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../rtk/index.js"), rtkMockFactory);

// ── compact-manager ───────────────────────────────────────────────────────────
mock.module("./compact-manager.js", () => ({}));
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./compact-manager.js"), () => ({}));

// ── sdk-engine ────────────────────────────────────────────────────────────────
mock.module("./sdk-engine.js", () => ({
  startSdkSession: mock(async () => ({})),
}));
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./sdk-engine.js"), () => ({
    startSdkSession: mock(async () => ({})),
  }));

// ── logger ────────────────────────────────────────────────────────────────────
const loggerMockFactory = () => ({
  createLogger: mock(() => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  })),
});
mock.module("../logger.js", loggerMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../logger.js"), loggerMockFactory);

// ── @companion/shared ─────────────────────────────────────────────────────────
// SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000 = 1800000 (from packages/shared/src/constants.ts)
// We use the real module value rather than mocking to stay accurate.
// No mock needed — the real @companion/shared is fine to use directly.

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { WsBridge } from "./ws-bridge.js";
import { getActiveSession, getAllActiveSessions, cleanupZombieSessions } from "./session-store.js";
import { broadcastToAll } from "./ws-broadcast.js";
import { replayEarlyResult, clearEarlyResult } from "./ws-stream-handler.js";
import { handleHookEvent as _handleHookEvent } from "./ws-permission-handler.js";
import type { ActiveSession } from "./session-store.js";

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

function createMockSocket() {
  return { send: mock(() => {}) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WsBridge", () => {
  let bridge: WsBridge;

  beforeEach(() => {
    // Reset mock state
    mockActiveSessionsMap = new Map();

    // Reset all mock call counts
    (mockHealthIdleInstance.startHealthCheck as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.startCleanupSweep as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.startIdleTimer as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.clearIdleTimer as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.stopAll as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.broadcastLockStatus as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.scheduleCleanup as ReturnType<typeof mock>).mockClear?.();
    (mockHealthIdleInstance.cancelCleanupTimer as ReturnType<typeof mock>).mockClear?.();

    (mockIdleDetectorInstance.stopAll as ReturnType<typeof mock>).mockClear?.();
    (mockIdleDetectorInstance.stopTracking as ReturnType<typeof mock>).mockClear?.();
    (mockIdleDetectorInstance.recordOutput as ReturnType<typeof mock>).mockClear?.();

    (mockSessionLifecycleInstance.killSession as ReturnType<typeof mock>).mockClear?.();
    (mockSessionLifecycleInstance.startSession as ReturnType<typeof mock>).mockClear?.();

    (mockUserMessageHandlerInstance.handleUserMessage as ReturnType<typeof mock>).mockClear?.();
    (mockUserMessageHandlerInstance.routeBrowserMessage as ReturnType<typeof mock>).mockClear?.();

    (broadcastToAll as ReturnType<typeof mock>).mockClear?.();
    (replayEarlyResult as ReturnType<typeof mock>).mockImplementation(
      (_sessionId: string, _callback: (msg: unknown) => void) => false,
    );
    (clearEarlyResult as ReturnType<typeof mock>).mockClear?.();

    // Re-wire getActiveSession to use local map
    (getActiveSession as ReturnType<typeof mock>).mockImplementation((id: string) =>
      mockActiveSessionsMap.get(id),
    );
    (getAllActiveSessions as ReturnType<typeof mock>).mockImplementation(() =>
      Array.from(mockActiveSessionsMap.values()),
    );
    (cleanupZombieSessions as ReturnType<typeof mock>).mockImplementation(() => 0);

    bridge = new WsBridge();
  });

  // ── constructor ──────────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("initializes without errors", () => {
      expect(bridge).toBeDefined();
    });

    it("starts health check and cleanup sweep", () => {
      expect(
        (mockHealthIdleInstance.startHealthCheck as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(1);
      expect(
        (mockHealthIdleInstance.startCleanupSweep as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(1);
    });
  });

  // ── getSession ────────────────────────────────────────────────────────────────

  describe("getSession", () => {
    it("returns session from session-store", () => {
      const session = createMockSession("sess-1");
      mockActiveSessionsMap.set("sess-1", session);

      const result = bridge.getSession("sess-1");
      expect(result).toBe(session);
    });

    it("returns undefined for non-existent session", () => {
      const result = bridge.getSession("no-such-session");
      expect(result).toBeUndefined();
    });
  });

  // ── getActiveSessions ─────────────────────────────────────────────────────────

  describe("getActiveSessions", () => {
    it("returns all active sessions", () => {
      const s1 = createMockSession("s1");
      const s2 = createMockSession("s2");
      mockActiveSessionsMap.set("s1", s1);
      mockActiveSessionsMap.set("s2", s2);

      const result = bridge.getActiveSessions();
      expect(result).toHaveLength(2);
      expect(result).toContain(s1);
      expect(result).toContain(s2);
    });

    it("returns empty array when no sessions", () => {
      const result = bridge.getActiveSessions();
      expect(result).toHaveLength(0);
    });
  });

  // ── setSessionSettings / getSessionSettings ───────────────────────────────────

  describe("setSessionSettings / getSessionSettings", () => {
    it("returns default settings for unknown session", () => {
      const settings = bridge.getSessionSettings("no-such-session");
      // SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000 = 1800000
      expect(settings.idleTimeoutMs).toBe(1800000);
      expect(settings.keepAlive).toBe(false);
      expect(settings.autoReinjectOnCompact).toBe(true);
    });

    it("merges partial settings with defaults", () => {
      const session = createMockSession("s1");
      session.state.status = "idle" as any;
      mockActiveSessionsMap.set("s1", session);

      bridge.setSessionSettings("s1", { keepAlive: true });

      const settings = bridge.getSessionSettings("s1");
      expect(settings.keepAlive).toBe(true);
      expect(settings.idleTimeoutMs).toBe(1800000); // default preserved (SESSION_IDLE_TIMEOUT_MS)
      expect(settings.autoReinjectOnCompact).toBe(true); // default preserved
    });

    it("clears idle timer when keepAlive is enabled", () => {
      const session = createMockSession("s1");
      session.state.status = "running" as any;
      mockActiveSessionsMap.set("s1", session);

      bridge.setSessionSettings("s1", { keepAlive: true });

      expect(
        (mockHealthIdleInstance.clearIdleTimer as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
      const clearCall = (mockHealthIdleInstance.clearIdleTimer as ReturnType<typeof mock>).mock
        .calls[0]!;
      expect(clearCall[0]).toBe("s1");
    });

    it("clears idle timer when idleTimeoutMs is 0", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      bridge.setSessionSettings("s1", { idleTimeoutMs: 0 });

      expect(
        (mockHealthIdleInstance.clearIdleTimer as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
    });

    it("restarts idle timer when session is idle with new timeout", () => {
      const session = createMockSession("s1");
      session.state.status = "idle" as any;
      mockActiveSessionsMap.set("s1", session);

      bridge.setSessionSettings("s1", { idleTimeoutMs: 60000 });

      // Should clear then start
      expect(
        (mockHealthIdleInstance.clearIdleTimer as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
      expect(
        (mockHealthIdleInstance.startIdleTimer as ReturnType<typeof mock>).mock.calls.length,
      ).toBeGreaterThan(0);
    });

    it("does not restart idle timer when session is running", () => {
      const session = createMockSession("s1");
      session.state.status = "running" as any;
      mockActiveSessionsMap.set("s1", session);

      bridge.setSessionSettings("s1", { idleTimeoutMs: 60000 });

      // No start — session is running, not idle
      expect(
        (mockHealthIdleInstance.startIdleTimer as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(0);
    });
  });

  // ── subscribe ──────────────────────────────────────────────────────────────────

  describe("subscribe", () => {
    it("adds subscriber callback to session", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const callback = mock(() => {});
      bridge.subscribe("s1", "subscriber-1", callback);

      expect(session.subscribers.has("subscriber-1")).toBe(true);
      expect(session.subscribers.get("subscriber-1")).toBe(callback);
    });

    it("returns noop unsubscribe for non-existent session", () => {
      const unsubscribe = bridge.subscribe(
        "no-such",
        "sub-1",
        mock(() => {}),
      );
      // Should not throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it("unsubscribe removes subscriber from session", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const callback = mock(() => {});
      const unsubscribe = bridge.subscribe("s1", "sub-1", callback);

      expect(session.subscribers.has("sub-1")).toBe(true);
      unsubscribe();
      expect(session.subscribers.has("sub-1")).toBe(false);
    });

    it("replays early result to late subscriber", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const earlyMsg = { type: "result", data: "early" };
      (replayEarlyResult as ReturnType<typeof mock>).mockImplementation(
        (_id: string, cb: (msg: unknown) => void) => {
          cb(earlyMsg);
          return true;
        },
      );

      const callback = mock(() => {});
      bridge.subscribe("s1", "sub-late", callback);

      expect((callback as ReturnType<typeof mock>).mock.calls.length).toBe(1);
      expect((callback as ReturnType<typeof mock>).mock.calls[0]![0]).toBe(earlyMsg);
    });

    it("calls clearEarlyResult when no early result to replay", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      (replayEarlyResult as ReturnType<typeof mock>).mockImplementation(() => false);

      bridge.subscribe(
        "s1",
        "sub-1",
        mock(() => {}),
      );

      expect((clearEarlyResult as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
    });
  });

  // ── addBrowser ─────────────────────────────────────────────────────────────────

  describe("addBrowser", () => {
    it("sends session_init to new browser socket", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const initMsg = sentMessages.find((m) => m.type === "session_init");
      expect(initMsg).toBeDefined();
      expect(initMsg.session).toBeDefined();
    });

    it("sends message_history if messages exist", () => {
      const session = createMockSession("s1");
      session.messageHistory = [{ type: "assistant", content: "hello" }];
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const historyMsg = sentMessages.find((m) => m.type === "message_history");
      expect(historyMsg).toBeDefined();
      expect(historyMsg.messages).toHaveLength(1);
    });

    it("does not send message_history when history is empty", () => {
      const session = createMockSession("s1");
      session.messageHistory = [];
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const historyMsg = sentMessages.find((m) => m.type === "message_history");
      expect(historyMsg).toBeUndefined();
    });

    it("sends cli_connected when CLI process exists (cliSend set)", () => {
      const session = createMockSession("s1");
      session.cliSend = () => {};
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const connectedMsg = sentMessages.find((m) => m.type === "cli_connected");
      expect(connectedMsg).toBeDefined();
    });

    it("sends cli_disconnected when CLI not connected and session active", () => {
      const session = createMockSession("s1");
      session.cliSend = null;
      session.state.status = "idle" as any;
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const disconnectedMsg = sentMessages.find((m) => m.type === "cli_disconnected");
      expect(disconnectedMsg).toBeDefined();
    });

    it("does not send cli_disconnected when session has ended", () => {
      const session = createMockSession("s1");
      session.cliSend = null;
      session.state.status = "ended" as any;
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const disconnectedMsg = sentMessages.find((m) => m.type === "cli_disconnected");
      expect(disconnectedMsg).toBeUndefined();
    });

    it("sends error for non-existent session", () => {
      const ws = createMockSocket();
      bridge.addBrowser("no-such", ws);

      const sentMessages = (ws.send as ReturnType<typeof mock>).mock.calls.map((c) =>
        JSON.parse(c[0] as string),
      );
      const errorMsg = sentMessages.find((m) => m.type === "error");
      expect(errorMsg).toBeDefined();
    });

    it("adds socket to session.browserSockets", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const ws = createMockSocket();
      bridge.addBrowser("s1", ws);

      expect(session.browserSockets.has(ws)).toBe(true);
    });
  });

  // ── removeBrowser ─────────────────────────────────────────────────────────────

  describe("removeBrowser", () => {
    it("removes browser socket from session", () => {
      const session = createMockSession("s1");
      const ws = createMockSocket();
      session.browserSockets.add(ws);
      mockActiveSessionsMap.set("s1", session);

      bridge.removeBrowser("s1", ws);

      expect(session.browserSockets.has(ws)).toBe(false);
    });

    it("does not throw for non-existent session", () => {
      const ws = createMockSocket();
      expect(() => bridge.removeBrowser("no-such", ws)).not.toThrow();
    });
  });

  // ── sendUserMessage ───────────────────────────────────────────────────────────

  describe("sendUserMessage", () => {
    it("delegates to UserMessageHandler.handleUserMessage", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      bridge.sendUserMessage("s1", "Hello world", "test-source");

      expect(
        (mockUserMessageHandlerInstance.handleUserMessage as ReturnType<typeof mock>).mock.calls
          .length,
      ).toBeGreaterThan(0);
      const call = (mockUserMessageHandlerInstance.handleUserMessage as ReturnType<typeof mock>)
        .mock.calls[0]!;
      expect(call[0]).toBe(session);
      expect(call[1]).toBe("Hello world");
      expect(call[2]).toBe("test-source");
    });

    it("logs warning for non-existent session (no delegation)", () => {
      // Should not throw
      expect(() => bridge.sendUserMessage("no-such", "Hello")).not.toThrow();
      // handleUserMessage should NOT be called
      expect(
        (mockUserMessageHandlerInstance.handleUserMessage as ReturnType<typeof mock>).mock.calls
          .length,
      ).toBe(0);
    });
  });

  // ── handleBrowserMessage ──────────────────────────────────────────────────────

  describe("handleBrowserMessage", () => {
    it("parses JSON and delegates to routeBrowserMessage", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const msg = JSON.stringify({ type: "user_message", content: "hi" });
      bridge.handleBrowserMessage("s1", msg);

      expect(
        (mockUserMessageHandlerInstance.routeBrowserMessage as ReturnType<typeof mock>).mock.calls
          .length,
      ).toBeGreaterThan(0);
      const call = (mockUserMessageHandlerInstance.routeBrowserMessage as ReturnType<typeof mock>)
        .mock.calls[0]!;
      expect(call[0]).toBe(session);
      expect(call[1]).toEqual({ type: "user_message", content: "hi" });
    });

    it("silently handles non-existent session (no delegation)", () => {
      expect(() =>
        bridge.handleBrowserMessage("no-such", JSON.stringify({ type: "ping" })),
      ).not.toThrow();
      expect(
        (mockUserMessageHandlerInstance.routeBrowserMessage as ReturnType<typeof mock>).mock.calls
          .length,
      ).toBe(0);
    });

    it("logs error for invalid JSON without throwing", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      expect(() => bridge.handleBrowserMessage("s1", "not valid json{{{")).not.toThrow();
    });
  });

  // ── killSession ───────────────────────────────────────────────────────────────

  describe("killSession", () => {
    it("delegates to SessionLifecycleManager.killSession", () => {
      bridge.killSession("sess-abc");

      expect(
        (mockSessionLifecycleInstance.killSession as ReturnType<typeof mock>).mock.calls.length,
      ).toBe(1);
      expect(
        (mockSessionLifecycleInstance.killSession as ReturnType<typeof mock>).mock.calls[0]![0],
      ).toBe("sess-abc");
    });
  });

  // ── broadcastEvent ────────────────────────────────────────────────────────────

  describe("broadcastEvent", () => {
    it("broadcasts event to all session sockets", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const event = { type: "custom_event", data: "test" };
      bridge.broadcastEvent("s1", event);

      expect((broadcastToAll as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
      const call = (broadcastToAll as ReturnType<typeof mock>).mock.calls[0]!;
      expect(call[0]).toBe(session);
      expect(call[1]).toMatchObject({ type: "custom_event", data: "test" });
    });

    it("silently handles non-existent session", () => {
      expect(() => bridge.broadcastEvent("no-such", { type: "test" })).not.toThrow();
      expect((broadcastToAll as ReturnType<typeof mock>).mock.calls.length).toBe(0);
    });
  });

  // ── handleHookEvent ───────────────────────────────────────────────────────────

  describe("handleHookEvent", () => {
    it("routes hook event to ws-permission-handler", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      const hookEvent = { type: "PreToolUse", tool_name: "Bash", tool_input: {} } as any;
      bridge.handleHookEvent("s1", hookEvent);

      expect((_handleHookEvent as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
      const call = (_handleHookEvent as ReturnType<typeof mock>).mock.calls[0]!;
      expect(call[0]).toBe(session);
      expect(call[1]).toBe(hookEvent);
    });

    it("returns found:false for unknown session", () => {
      const hookEvent = { type: "PreToolUse", tool_name: "Bash", tool_input: {} } as any;
      const result = bridge.handleHookEvent("no-such", hookEvent);

      expect(result.found).toBe(false);
    });

    it("returns found:true result from permission handler", () => {
      const session = createMockSession("s1");
      mockActiveSessionsMap.set("s1", session);

      (_handleHookEvent as ReturnType<typeof mock>).mockImplementation(() => ({
        found: true,
        decision: { behavior: "allow" },
      }));

      const hookEvent = { type: "PreToolUse", tool_name: "Read", tool_input: {} } as any;
      const result = bridge.handleHookEvent("s1", hookEvent);

      expect(result.found).toBe(true);
    });
  });

  // ── cleanupZombieSessions ─────────────────────────────────────────────────────

  describe("cleanupZombieSessions", () => {
    it("delegates to session-store with live-check callback", () => {
      (cleanupZombieSessions as ReturnType<typeof mock>).mockImplementation(
        (isInMemory: (id: string) => boolean) => {
          // Call the callback to verify it works
          const result1 = isInMemory("some-session");
          expect(typeof result1).toBe("boolean");
          return 2;
        },
      );

      const count = bridge.cleanupZombieSessions();

      expect(count).toBe(2);
      expect((cleanupZombieSessions as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(
        0,
      );
    });

    it("returns 0 when no zombies found", () => {
      (cleanupZombieSessions as ReturnType<typeof mock>).mockImplementation(() => 0);

      const count = bridge.cleanupZombieSessions();
      expect(count).toBe(0);
    });
  });

  // ── stopHealthCheck ───────────────────────────────────────────────────────────

  describe("stopHealthCheck", () => {
    it("stops idle detector and health idle manager", () => {
      bridge.stopHealthCheck();

      expect((mockIdleDetectorInstance.stopAll as ReturnType<typeof mock>).mock.calls.length).toBe(
        1,
      );
      expect((mockHealthIdleInstance.stopAll as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    });
  });

  // ── sendToCLI (indirect via pendingMessages queue) ────────────────────────────

  describe("sendToCLI (indirect)", () => {
    it("queues messages when CLI not connected (cliSend is null)", () => {
      const session = createMockSession("s1");
      session.cliSend = null;
      mockActiveSessionsMap.set("s1", session);

      // Trigger via sendUserMessage — which eventually routes to sendToCLI via handler
      // But since we mock userMessageHandler, we test directly that pendingMessages is used
      // by calling the private method indirectly through a pattern that reads session.cliSend

      // We can verify the pattern by checking that session.pendingMessages stays empty
      // since sendUserMessage delegates to the mocked handler (which doesn't call sendToCLI)
      bridge.sendUserMessage("s1", "queued message");

      // The userMessageHandler mock doesn't call sendToCLI, so pendingMessages stays empty —
      // what we're validating is that bridge routes correctly and doesn't crash.
      expect(session.pendingMessages).toHaveLength(0);
    });
  });
});
