/**
 * Unit tests for mention-router — @mention parsing, routing, and deduplication.
 * Lives in src/tests/ to avoid mock.module pollution of session-store.
 */

import { describe, it, expect, mock } from "bun:test";

// Mock dependencies with path relative to THIS file (src/tests/)
mock.module("../services/short-id.js", () => ({
  resolveShortId: (shortId: string) => {
    const map: Record<string, string> = {
      fox: "session-fox-123",
      bear: "session-bear-456",
      wolf: "session-wolf-789",
    };
    return map[shortId] ?? null;
  },
}));
mock.module("../services/session-store.js", () => ({
  getActiveSession: (id: string) => {
    if (id.startsWith("session-")) {
      return { id, state: { status: "running" } };
    }
    return null;
  },
}));
mock.module("../services/debate-engine.js", () => ({
  listActiveDebates: () => [
    {
      channelId: "debate-1",
      agents: [
        { id: "advocate", name: "Advocate" },
        { id: "challenger", name: "Challenger" },
      ],
    },
  ],
  injectHumanMessage: mock(() => true),
}));

import { parseMentions, handleMentions } from "../services/mention-router.js";

describe("mention-router", () => {
  describe("parseMentions", () => {
    it("parses single @mention", () => {
      const result = parseMentions(
        "Hey @fox what do you think?",
        "session-current",
        "current",
      );

      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(1);
      expect(result!.mentions[0].shortId).toBe("fox");
      expect(result!.mentions[0].sessionId).toBe("session-fox-123");
    });

    it("parses multiple @mentions", () => {
      const result = parseMentions(
        "@fox @bear please review this",
        "session-current",
        "current",
      );

      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(2);
    });

    it("returns null when no mentions found", () => {
      const result = parseMentions(
        "No mentions here",
        "session-current",
        "current",
      );

      expect(result).toBeNull();
    });

    it("ignores self-mentions", () => {
      const result = parseMentions(
        "@fox hello",
        "session-fox-123",
        "fox",
      );

      expect(result).toBeNull();
    });

    it("ignores unresolved mentions", () => {
      const result = parseMentions(
        "@unknown hello @fox",
        "session-current",
        "current",
      );

      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(1);
      expect(result!.mentions[0].shortId).toBe("fox");
    });

    it("deduplicates multiple mentions of the same session", () => {
      const result = parseMentions(
        "@fox hey @fox what's up?",
        "session-current",
        "current",
      );

      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(1);
    });

    it("strips resolved mentions from clean message", () => {
      const result = parseMentions(
        "Hey @fox what do you think?",
        "session-current",
        "current",
      );

      expect(result!.cleanMessage).toBe("Hey what do you think?");
    });

    it("resolves debate agent mentions", () => {
      const result = parseMentions(
        "@advocate what's your view?",
        "session-current",
        "current",
      );

      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(1);
      expect(result!.mentions[0].debateChannelId).toBe("debate-1");
    });
  });

  describe("handleMentions", () => {
    it("routes mentions and returns target session IDs", () => {
      const sentMessages: Array<{ sessionId: string; content: string }> = [];
      const sendToSession = (sessionId: string, content: string) => {
        sentMessages.push({ sessionId, content });
      };

      const targets = handleMentions(
        "@fox what do you think?",
        "session-current",
        "current",
        sendToSession,
      );

      expect(targets).toHaveLength(1);
      expect(targets[0]).toBe("session-fox-123");
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].content).toContain("Cross-session mention");
    });

    it("returns empty array when no mentions", () => {
      const targets = handleMentions(
        "Just a regular message",
        "session-current",
        "current",
        () => {},
      );

      expect(targets).toHaveLength(0);
    });

    it("routes to multiple targets", () => {
      const sentMessages: Array<{ sessionId: string; content: string }> = [];
      const sendToSession = (sessionId: string, content: string) => {
        sentMessages.push({ sessionId, content });
      };

      const targets = handleMentions(
        "@fox @bear review this please",
        "session-current",
        "current",
        sendToSession,
      );

      expect(targets).toHaveLength(2);
      expect(sentMessages).toHaveLength(2);
    });
  });
});
