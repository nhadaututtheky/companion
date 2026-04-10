/**
 * Unit tests for ws-stream-handler — stream events, tool progress, and early results buffering.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock dependencies
mock.module("./ws-broadcast.js", () => ({
  broadcastToAll: mock(() => {}),
}));
mock.module("./pulse-estimator.js", () => ({
  getOrCreatePulse: () => ({ recordThinking: () => {} }),
}));

import {
  bufferEarlyResult,
  getEarlyResult,
  clearEarlyResult,
  replayEarlyResult,
  handleStreamEvent,
  handleToolProgress,
} from "./ws-stream-handler.js";
import { broadcastToAll } from "./ws-broadcast.js";
import type { ActiveSession } from "./session-store.js";

function createMockSession(id = "test-session"): ActiveSession {
  return {
    id,
    state: {
      session_id: id,
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
  };
}

describe("ws-stream-handler", () => {
  beforeEach(() => {
    // Clear any buffered early results
    clearEarlyResult("test-session");
    clearEarlyResult("session-a");
    clearEarlyResult("session-b");
  });

  describe("early results buffer", () => {
    it("stores and retrieves buffered results", () => {
      const msg = { type: "result", content: "done" } as any;
      bufferEarlyResult("session-a", msg);

      const entry = getEarlyResult("session-a");
      expect(entry).not.toBeNull();
      expect(entry!.msg.type).toBe("result");
    });

    it("returns null for non-existent session", () => {
      expect(getEarlyResult("nonexistent")).toBeNull();
    });

    it("clears buffered results", () => {
      bufferEarlyResult("session-a", { type: "result" } as any);
      clearEarlyResult("session-a");

      expect(getEarlyResult("session-a")).toBeNull();
    });

    it("replays buffered result to callback and clears it", () => {
      const msg = { type: "result", content: "test" } as any;
      bufferEarlyResult("session-a", msg);

      const received: unknown[] = [];
      const replayed = replayEarlyResult("session-a", (m) => received.push(m));

      expect(replayed).toBe(true);
      expect(received).toHaveLength(1);
      expect((received[0] as any).type).toBe("result");

      // Should be cleared after replay
      expect(getEarlyResult("session-a")).toBeNull();
    });

    it("returns false when no buffered result exists", () => {
      const replayed = replayEarlyResult("nonexistent", () => {});
      expect(replayed).toBe(false);
    });

    it("overwrites previous buffer for same session", () => {
      bufferEarlyResult("session-a", { type: "old" } as any);
      bufferEarlyResult("session-a", { type: "new" } as any);

      const entry = getEarlyResult("session-a");
      expect((entry!.msg as any).type).toBe("new");
    });
  });

  describe("handleStreamEvent", () => {
    it("broadcasts stream_event to all", () => {
      const session = createMockSession();
      const mockBroadcast = broadcastToAll as ReturnType<typeof mock>;

      handleStreamEvent(session, {
        type: "stream_event",
        event: { delta: { type: "content_block_delta" } },
      } as any);

      expect(mockBroadcast).toHaveBeenCalled();
      const call = mockBroadcast.mock.calls[mockBroadcast.mock.calls.length - 1]!;
      expect(call[1]!.type).toBe("stream_event");
    });
  });

  describe("handleToolProgress", () => {
    it("broadcasts tool_progress to all", () => {
      const session = createMockSession();
      const mockBroadcast = broadcastToAll as ReturnType<typeof mock>;

      handleToolProgress(session, {
        type: "tool_progress",
        tool_use_id: "tu-123",
        tool_name: "Read",
        elapsed_time_seconds: 5,
      } as any);

      expect(mockBroadcast).toHaveBeenCalled();
      const call = mockBroadcast.mock.calls[mockBroadcast.mock.calls.length - 1]!;
      expect(call[1]!.type).toBe("tool_progress");
      expect(call[1]!.tool_name).toBe("Read");
    });
  });
});
