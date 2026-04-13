/**
 * Unit tests for ws-broadcast — message fanout to browsers, subscribers, spectators.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock spectator-bridge (external dependency)
const spectatorBridgeMockFactory = () => ({
  broadcastToSpectators: mock(() => {}),
});
mock.module("./spectator-bridge.js", spectatorBridgeMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("./spectator-bridge.js"), spectatorBridgeMockFactory);

import { broadcastToAll, broadcastToSubscribers } from "./ws-broadcast.js";
import type { ActiveSession } from "./session-store.js";

function createMockSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: "test-session-1",
    state: {
      session_id: "test-session-1",
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

describe("ws-broadcast", () => {
  describe("broadcastToAll", () => {
    it("sends to all browser sockets", () => {
      const sent: string[] = [];
      const ws1 = { send: (d: string) => sent.push(`ws1:${d}`) };
      const ws2 = { send: (d: string) => sent.push(`ws2:${d}`) };
      const session = createMockSession({
        browserSockets: new Set([ws1, ws2]),
      });

      broadcastToAll(session, { type: "assistant", message: "hello" } as any);

      expect(sent).toHaveLength(2);
      expect(sent[0]).toContain('"type":"assistant"');
      expect(sent[1]).toContain('"type":"assistant"');
    });

    it("removes sockets that throw on send", () => {
      const badSocket = {
        send: () => {
          throw new Error("Connection closed");
        },
      };
      const goodSocket = { send: mock(() => {}) };
      const sockets = new Set([badSocket, goodSocket]);
      const session = createMockSession({ browserSockets: sockets });

      broadcastToAll(session, { type: "ping" } as any);

      expect(sockets.has(badSocket)).toBe(false);
      expect(sockets.has(goodSocket)).toBe(true);
      expect(goodSocket.send).toHaveBeenCalled();
    });

    it("sends to subscribers", () => {
      const received: unknown[] = [];
      const subscribers = new Map<string, (msg: unknown) => void>();
      subscribers.set("telegram-1", (msg) => received.push(msg));
      const session = createMockSession({ subscribers });

      broadcastToAll(session, { type: "assistant", message: "test" } as any);

      expect(received).toHaveLength(1);
      expect((received[0] as any).type).toBe("assistant");
    });

    it("handles zero sockets and zero subscribers gracefully", () => {
      const session = createMockSession();

      // Should not throw
      broadcastToAll(session, { type: "ping" } as any);
    });
  });

  describe("broadcastToSubscribers", () => {
    it("sends to all subscriber callbacks", () => {
      const received: unknown[] = [];
      const subscribers = new Map<string, (msg: unknown) => void>();
      subscribers.set("sub-1", (msg) => received.push({ sub: "1", msg }));
      subscribers.set("sub-2", (msg) => received.push({ sub: "2", msg }));
      const session = createMockSession({ subscribers });

      broadcastToSubscribers(session, { type: "test" });

      expect(received).toHaveLength(2);
    });

    it("continues sending when a subscriber throws", () => {
      const received: unknown[] = [];
      const subscribers = new Map<string, (msg: unknown) => void>();
      subscribers.set("bad", () => {
        throw new Error("Subscriber crash");
      });
      subscribers.set("good", (msg) => received.push(msg));
      const session = createMockSession({ subscribers });

      // Should not throw
      broadcastToSubscribers(session, { type: "test" });

      expect(received).toHaveLength(1);
    });
  });
});
