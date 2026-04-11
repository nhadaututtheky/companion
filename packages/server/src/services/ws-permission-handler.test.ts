/**
 * Unit tests for ws-permission-handler — permission request/response cycle, auto-approve, interrupt.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock dependencies
const mockBroadcastToAll = mock(() => {});
mock.module("./ws-broadcast.js", () => ({
  broadcastToAll: mockBroadcastToAll,
}));
mock.module("./pulse-estimator.js", () => ({
  getOrCreatePulse: () => ({
    setBlocked: () => {},
  }),
}));

import {
  handlePermissionResponse,
  handleControlRequest,
  handleInterrupt,
  handleHookEvent,
  type PermissionBridge,
} from "./ws-permission-handler.js";
import type { ActiveSession } from "./session-store.js";

function createMockSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: "test-session",
    state: {
      session_id: "test-session",
      model: "claude-sonnet-4-6",
      status: "running",
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
    ...overrides,
  };
}

function createMockBridge(overrides: Partial<PermissionBridge> = {}): PermissionBridge {
  return {
    sendToCLI: mock(() => {}),
    permissionResolvers: new Map(),
    sdkHandles: new Map(),
    ...overrides,
  };
}

describe("ws-permission-handler", () => {
  beforeEach(() => {
    mockBroadcastToAll.mockClear();
  });

  describe("handlePermissionResponse", () => {
    it("resolves SDK permission via resolver", () => {
      const resolved: unknown[] = [];
      const bridge = createMockBridge();
      bridge.permissionResolvers.set("req-1", (result) => resolved.push(result));

      const session = createMockSession();
      session.pendingPermissions.set("req-1", { tool_name: "Read" });

      handlePermissionResponse(bridge, session, {
        request_id: "req-1",
        behavior: "allow",
      });

      expect(resolved).toHaveLength(1);
      expect((resolved[0] as any).behavior).toBe("allow");
      expect(bridge.permissionResolvers.has("req-1")).toBe(false);
      expect(session.pendingPermissions.has("req-1")).toBe(false);
    });

    it("sends CLI NDJSON for allow when no resolver exists", () => {
      const bridge = createMockBridge();
      const cliSend = mock(() => {});
      const session = createMockSession({ cliSend });
      session.pendingPermissions.set("req-2", { tool_name: "Bash" });

      handlePermissionResponse(bridge, session, {
        request_id: "req-2",
        behavior: "allow",
      });

      expect(cliSend).not.toHaveBeenCalled(); // cliSend is on session, but bridge.sendToCLI is called
      expect(bridge.sendToCLI).toHaveBeenCalled();
      const ndjson = (
        (bridge.sendToCLI as ReturnType<typeof mock>).mock.calls as any[][]
      )[0]![1] as string;
      const parsed = JSON.parse(ndjson);
      expect(parsed.response.response.behavior).toBe("allow");
    });

    it("sends CLI NDJSON for deny", () => {
      const bridge = createMockBridge();
      const session = createMockSession({ cliSend: () => {} });
      session.pendingPermissions.set("req-3", {});

      handlePermissionResponse(bridge, session, {
        request_id: "req-3",
        behavior: "deny",
      });

      const ndjson = (
        (bridge.sendToCLI as ReturnType<typeof mock>).mock.calls as any[][]
      )[0]![1] as string;
      const parsed = JSON.parse(ndjson);
      expect(parsed.response.response.behavior).toBe("deny");
    });

    it("clears auto-approve timer when responding", () => {
      const bridge = createMockBridge();
      const session = createMockSession({ cliSend: () => {} });
      const timer = setTimeout(() => {}, 10000);
      session.autoApproveTimers.set("req-4", timer);
      session.pendingPermissions.set("req-4", {});

      handlePermissionResponse(bridge, session, {
        request_id: "req-4",
        behavior: "allow",
      });

      expect(session.autoApproveTimers.has("req-4")).toBe(false);
    });

    it("broadcasts permission_cancelled after response", () => {
      const bridge = createMockBridge();
      const session = createMockSession({ cliSend: () => {} });
      session.pendingPermissions.set("req-5", {});

      handlePermissionResponse(bridge, session, {
        request_id: "req-5",
        behavior: "allow",
      });

      const cancelMsg = (mockBroadcastToAll.mock.calls as any[][]).find(
        (c) => c[1].type === "permission_cancelled",
      );
      expect(cancelMsg).toBeDefined();
      expect(cancelMsg![1].request_id).toBe("req-5");
    });
  });

  describe("handleControlRequest", () => {
    it("auto-approves EnterPlanMode immediately", () => {
      const bridge = createMockBridge();
      const session = createMockSession({ cliSend: () => {} });

      handleControlRequest(bridge, session, {
        type: "control_request",
        request_id: "req-auto",
        request: {
          subtype: "tool_use",
          tool_name: "EnterPlanMode",
          tool_use_id: "tu-1",
        },
      } as any);

      // Should not remain in pending (auto-approved)
      expect(session.pendingPermissions.has("req-auto")).toBe(false);
    });

    it("broadcasts permission_request for normal tools", () => {
      const bridge = createMockBridge();
      const session = createMockSession();

      handleControlRequest(bridge, session, {
        type: "control_request",
        request_id: "req-normal",
        request: {
          subtype: "tool_use",
          tool_name: "Bash",
          input: { command: "ls" },
          tool_use_id: "tu-2",
        },
      } as any);

      expect(session.pendingPermissions.has("req-normal")).toBe(true);
      const permMsg = (mockBroadcastToAll.mock.calls as any[][]).find(
        (c) => c[1].type === "permission_request",
      );
      expect(permMsg).toBeDefined();
    });

    it("does not auto-approve ExitPlanMode when bypass is disabled", () => {
      const bridge = createMockBridge();
      const session = createMockSession({ bypassDisabled: true });

      handleControlRequest(bridge, session, {
        type: "control_request",
        request_id: "req-exit",
        request: {
          subtype: "tool_use",
          tool_name: "ExitPlanMode",
          tool_use_id: "tu-3",
        },
      } as any);

      expect(session.pendingPermissions.has("req-exit")).toBe(true);
    });
  });

  describe("handleInterrupt", () => {
    it("sends interrupt via CLI path when no SDK handle", () => {
      const bridge = createMockBridge();
      const session = createMockSession();

      handleInterrupt(bridge, session);

      expect(bridge.sendToCLI).toHaveBeenCalled();
      const ndjson = (
        (bridge.sendToCLI as ReturnType<typeof mock>).mock.calls as any[][]
      )[0]![1] as string;
      const parsed = JSON.parse(ndjson);
      expect(parsed.request.subtype).toBe("interrupt");
    });

    it("calls SDK query.interrupt() when SDK handle exists", () => {
      const interruptFn = mock(() => {});
      const bridge = createMockBridge();
      bridge.sdkHandles.set("test-session", {
        query: { interrupt: interruptFn },
      } as any);

      const session = createMockSession();
      handleInterrupt(bridge, session);

      expect(interruptFn).toHaveBeenCalled();
      expect(bridge.sendToCLI).not.toHaveBeenCalled();
    });
  });

  describe("handleHookEvent", () => {
    it("broadcasts hook event to all subscribers", () => {
      const session = createMockSession();

      handleHookEvent(session, {
        type: "PostToolUse",
        tool_name: "Read",
        tool_input: { path: "/test.ts" },
        timestamp: 1234,
      } as any);

      const hookMsg = (mockBroadcastToAll.mock.calls as any[][]).find(
        (c) => c[1].type === "hook_event",
      );
      expect(hookMsg).toBeDefined();
      expect(hookMsg![1].toolName).toBe("Read");
    });

    it("returns allow decision for PreToolUse events", () => {
      const session = createMockSession();

      const result = handleHookEvent(session, {
        type: "PreToolUse",
        tool_name: "Bash",
      } as any);

      expect(result.found).toBe(true);
      expect(result.decision?.decision).toBe("allow");
    });

    it("returns found:true without decision for PostToolUse", () => {
      const session = createMockSession();

      const result = handleHookEvent(session, {
        type: "PostToolUse",
        tool_name: "Read",
      } as any);

      expect(result.found).toBe(true);
      expect(result.decision).toBeUndefined();
    });
  });
});
