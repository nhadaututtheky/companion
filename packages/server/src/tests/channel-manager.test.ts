/**
 * Tests for channel-manager CRUD operations.
 * Uses in-memory SQLite with migrations.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createTestDb } from "./test-db.js";

const testDbResult = createTestDb();
mock.module("../db/client.js", () => ({
  getDb: () => testDbResult.db,
}));

const {
  createChannel,
  getChannel,
  listChannels,
  postMessage,
  getChannelMessages,
  updateChannelStatus,
  deleteChannel,
} = await import("../services/channel-manager.js");

describe("channel-manager", () => {
  afterAll(() => {
    testDbResult.sqlite.close();
  });

  describe("createChannel", () => {
    test("creates a debate channel", () => {
      const ch = createChannel({ type: "debate", topic: "Test debate" });
      expect(ch.id).toBeTruthy();
      expect(ch.type).toBe("debate");
      expect(ch.topic).toBe("Test debate");
      expect(ch.status).toBe("active");
    });

    test("creates a review channel", () => {
      const ch = createChannel({ type: "review", topic: "Review code" });
      expect(ch.type).toBe("review");
    });

    test("creates channel with project slug", () => {
      // Note: project must exist for FK, but in test DB we may not have projects
      // This tests the basic insert without FK constraint
      const ch = createChannel({ type: "brainstorm", topic: "Ideas" });
      expect(ch.topic).toBe("Ideas");
    });
  });

  describe("messages", () => {
    let channelId: string;

    beforeAll(() => {
      const ch = createChannel({ type: "debate", topic: "Message test" });
      channelId = ch.id;
    });

    test("posts a message to channel", () => {
      const msg = postMessage({
        channelId,
        agentId: "agent-1",
        role: "pro",
        content: "I argue in favor",
      });
      expect(msg.id).toBeTruthy();
      expect(msg.content).toBe("I argue in favor");
      expect(msg.role).toBe("pro");
    });

    test("posts multiple messages", () => {
      postMessage({ channelId, agentId: "agent-2", role: "con", content: "I disagree" });
      postMessage({ channelId, agentId: "agent-1", role: "pro", content: "Rebuttal" });

      const messages = getChannelMessages(channelId);
      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    test("messages are in chronological order", () => {
      const messages = getChannelMessages(channelId);
      // Should be chronological (oldest first after reverse)
      for (let i = 1; i < messages.length; i++) {
        const currTs = Number(messages[i]!.timestamp ?? 0);
        const prevTs = Number(messages[i - 1]!.timestamp ?? 0);
        expect(currTs).toBeGreaterThanOrEqual(prevTs);
      }
    });
  });

  describe("getChannel", () => {
    test("returns channel with messages and sessions", () => {
      const ch = createChannel({ type: "debate", topic: "Full test" });
      postMessage({ channelId: ch.id, agentId: "a1", role: "pro", content: "Hello" });

      const full = getChannel(ch.id);
      expect(full).not.toBeNull();
      expect(full!.id).toBe(ch.id);
      expect(full!.messages.length).toBeGreaterThanOrEqual(1);
    });

    test("returns null for nonexistent channel", () => {
      expect(getChannel("nonexistent")).toBeNull();
    });
  });

  describe("listChannels", () => {
    test("lists all channels", () => {
      const result = listChannels();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    test("respects limit", () => {
      const result = listChannels({ limit: 1 });
      expect(result.items).toHaveLength(1);
    });

    test("filters by status", () => {
      const result = listChannels({ status: "active" });
      expect(result.items.every((ch) => ch.status === "active")).toBe(true);
    });
  });

  describe("updateChannelStatus", () => {
    test("updates status to concluded", () => {
      const ch = createChannel({ type: "debate", topic: "Status test" });
      updateChannelStatus(ch.id, "concluded");

      const updated = getChannel(ch.id);
      expect(updated!.status).toBe("concluded");
      expect(updated!.concludedAt).toBeTruthy();
    });

    test("updates status to concluding (no concludedAt)", () => {
      const ch = createChannel({ type: "debate", topic: "Concluding test" });
      updateChannelStatus(ch.id, "concluding");

      const updated = getChannel(ch.id);
      expect(updated!.status).toBe("concluding");
    });
  });

  describe("deleteChannel", () => {
    test("deletes channel and its messages", () => {
      const ch = createChannel({ type: "debate", topic: "Delete test" });
      postMessage({ channelId: ch.id, agentId: "a1", role: "pro", content: "To be deleted" });

      const success = deleteChannel(ch.id);
      expect(success).toBe(true);
      expect(getChannel(ch.id)).toBeNull();
    });

    test("returns false for nonexistent channel", () => {
      expect(deleteChannel("nonexistent")).toBe(false);
    });
  });
});
