/**
 * Unit tests for channel-manager — CRUD for debate/collaboration channels.
 * Uses an in-memory SQLite DB.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

const dbClientMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);

// Import AFTER mock
import {
  createChannel,
  getChannel,
  listChannels,
  postMessage,
  updateChannelStatus,
  deleteChannel,
  linkSession,
  unlinkSession,
} from "./channel-manager.js";

function setup() {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  return result;
}

function insertSession(sqlite: Database, id: string, projectSlug: string | null = null) {
  const now = Date.now();
  sqlite.run(
    `INSERT INTO sessions (id, model, status, cwd, started_at${projectSlug ? ", project_slug" : ""})
     VALUES (?, ?, ?, ?, ?${projectSlug ? ", ?" : ""})`,
    projectSlug
      ? [id, "claude-sonnet-4-6", "running", "/tmp", now, projectSlug]
      : [id, "claude-sonnet-4-6", "running", "/tmp", now],
  );
}

describe("channel-manager", () => {
  let sqlite: Database;

  beforeEach(() => {
    const result = setup();
    sqlite = result.sqlite;
  });

  afterEach(() => {
    currentSqlite?.close();
    currentDb = null;
    currentSqlite = null;
  });

  describe("createChannel", () => {
    it("creates a debate channel", () => {
      const channel = createChannel({ type: "debate", topic: "React vs Svelte" });
      expect(channel).toBeDefined();
      expect(channel.id).toBeTruthy();
      expect(channel.type).toBe("debate");
      expect(channel.topic).toBe("React vs Svelte");
      expect(channel.status).toBe("active");
      expect(channel.maxRounds).toBe(5);
      expect(channel.currentRound).toBe(0);
    });

    it("creates channel with custom maxRounds", () => {
      const channel = createChannel({ type: "review", topic: "Code review", maxRounds: 3 });
      expect(channel.maxRounds).toBe(3);
    });

    it("creates channel with project slug", () => {
      // Insert project first for FK
      sqlite.run(
        `INSERT INTO projects (slug, name, dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ["my-app", "My App", "/tmp", Date.now(), Date.now()],
      );

      const channel = createChannel({
        type: "brainstorm",
        topic: "Architecture",
        projectSlug: "my-app",
      });
      expect(channel.projectSlug).toBe("my-app");
    });
  });

  describe("getChannel", () => {
    it("returns null for non-existent channel", () => {
      expect(getChannel("nonexistent")).toBeNull();
    });

    it("returns channel with messages and linked sessions", () => {
      const channel = createChannel({ type: "debate", topic: "Test topic" });
      postMessage({
        channelId: channel.id,
        agentId: "agent-1",
        role: "advocate",
        content: "I think X",
      });
      postMessage({
        channelId: channel.id,
        agentId: "agent-2",
        role: "critic",
        content: "I disagree",
      });

      const result = getChannel(channel.id);
      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(2);
      expect(result!.linkedSessions).toHaveLength(0);
    });
  });

  describe("listChannels", () => {
    it("returns empty list", () => {
      const { items, total } = listChannels();
      expect(items).toHaveLength(0);
      expect(total).toBe(0);
    });

    it("lists all channels", () => {
      createChannel({ type: "debate", topic: "Topic 1" });
      createChannel({ type: "review", topic: "Topic 2" });
      createChannel({ type: "brainstorm", topic: "Topic 3" });

      const { items, total } = listChannels();
      expect(items).toHaveLength(3);
      expect(total).toBe(3);
    });

    it("filters by status", () => {
      const ch1 = createChannel({ type: "debate", topic: "Active" });
      createChannel({ type: "debate", topic: "Also active" });
      updateChannelStatus(ch1.id, "concluded");

      const { items: active } = listChannels({ status: "active" });
      expect(active).toHaveLength(1);

      const { items: concluded } = listChannels({ status: "concluded" });
      expect(concluded).toHaveLength(1);
    });
  });

  describe("postMessage", () => {
    it("posts a message to a channel", () => {
      const channel = createChannel({ type: "debate", topic: "Test" });
      const msg = postMessage({
        channelId: channel.id,
        agentId: "agent-1",
        role: "advocate",
        content: "My argument",
        round: 1,
      });

      expect(msg.id).toBeTruthy();
      expect(msg.channelId).toBe(channel.id);
      expect(msg.agentId).toBe("agent-1");
      expect(msg.role).toBe("advocate");
      expect(msg.content).toBe("My argument");
      expect(msg.round).toBe(1);
    });
  });

  describe("updateChannelStatus", () => {
    it("updates status to concluded", () => {
      const channel = createChannel({ type: "debate", topic: "Test" });
      updateChannelStatus(channel.id, "concluded");

      const updated = getChannel(channel.id);
      expect(updated!.status).toBe("concluded");
    });

    it("updates status to concluding", () => {
      const channel = createChannel({ type: "debate", topic: "Test" });
      updateChannelStatus(channel.id, "concluding");

      const updated = getChannel(channel.id);
      expect(updated!.status).toBe("concluding");
    });
  });

  describe("linkSession / unlinkSession", () => {
    it("links and unlinks a session to a channel", () => {
      const channel = createChannel({ type: "debate", topic: "Test" });
      insertSession(sqlite, "sess-1");

      linkSession(channel.id, "sess-1");

      const withSession = getChannel(channel.id);
      expect(withSession!.linkedSessions).toHaveLength(1);
      expect(withSession!.linkedSessions[0]!.id).toBe("sess-1");

      unlinkSession("sess-1");

      const withoutSession = getChannel(channel.id);
      expect(withoutSession!.linkedSessions).toHaveLength(0);
    });

    it("throws when linking to non-existent channel", () => {
      insertSession(sqlite, "sess-2");
      expect(() => linkSession("nonexistent", "sess-2")).toThrow("Channel not found");
    });
  });

  describe("deleteChannel", () => {
    it("deletes channel and its messages", () => {
      const channel = createChannel({ type: "debate", topic: "To delete" });
      postMessage({ channelId: channel.id, agentId: "a1", role: "advocate", content: "msg" });

      expect(deleteChannel(channel.id)).toBe(true);
      expect(getChannel(channel.id)).toBeNull();
    });

    it("returns false for non-existent channel", () => {
      expect(deleteChannel("nonexistent")).toBe(false);
    });

    it("unlinks sessions when deleting channel", () => {
      const channel = createChannel({ type: "debate", topic: "Test" });
      insertSession(sqlite, "sess-3");
      linkSession(channel.id, "sess-3");

      deleteChannel(channel.id);

      // Session should still exist but with no channel
      const row = sqlite.prepare("SELECT channel_id FROM sessions WHERE id = ?").get("sess-3") as {
        channel_id: string | null;
      };
      expect(row.channel_id).toBeNull();
    });
  });
});
