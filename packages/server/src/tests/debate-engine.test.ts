/**
 * Unit tests for debate-engine — state management, format definitions, human injection.
 * Lives in src/tests/ to use real DB (createTestDb) and avoid mock.module pollution.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

// Use real DB (in-memory) instead of mocking db/client — prevents test pollution
mock.module("../db/client.js", () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
}));

// Mock only external dependencies (AI, convergence — not DB)
mock.module("../services/convergence-detector.js", () => ({
  checkConvergence: mock(async () => ({ score: 0, staleRounds: 0 })),
}));
mock.module("../services/ai-client.js", () => ({
  callAI: mock(async () => ({ text: "test response", costUsd: 0.001 })),
  callAIWithModel: mock(async () => ({ text: "test response", costUsd: 0.001 })),
  getOpenRouterConfig: mock(() => null),
}));
mock.module("../services/provider-registry.js", () => ({
  resolveModelProvider: mock(() => null),
  getProviderOverride: mock(() => null),
}));
mock.module("../services/custom-personas.js", () => ({
  resolvePersona: mock(() => null),
}));

import {
  getActiveDebate,
  listActiveDebates,
  startDebate,
  injectHumanMessage,
} from "../services/debate-engine.js";

describe("debate-engine", () => {
  beforeEach(() => {
    const result = createTestDb();
    currentDb = result.db;
    currentSqlite = result.sqlite;
  });

  describe("getActiveDebate", () => {
    it("returns undefined for unknown channel", () => {
      expect(getActiveDebate("nonexistent")).toBeUndefined();
    });
  });

  describe("startDebate + state tracking", () => {
    it("creates a debate and tracks it as active", async () => {
      const state = await startDebate({
        topic: "Test topic",
        format: "pro_con",
      });

      expect(state.channelId).toBeDefined();
      expect(state.topic).toBe("Test topic");
      expect(state.format).toBe("pro_con");
      expect(state.agents).toHaveLength(2);
      expect(state.agents[0]!.id).toBe("advocate");
      expect(state.agents[1]!.id).toBe("challenger");
      expect(state.maxRounds).toBe(5);
      expect(state.status).toBe("active");
    });

    it("supports all debate formats", async () => {
      const formats = ["pro_con", "red_team", "review", "brainstorm"] as const;
      for (const format of formats) {
        const state = await startDebate({ topic: "test", format });
        expect(state.agents.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("red_team has builder and attacker", async () => {
      const state = await startDebate({ topic: "Security", format: "red_team" });
      expect(state.agents.find((a) => a.id === "builder")).toBeDefined();
      expect(state.agents.find((a) => a.id === "attacker")).toBeDefined();
    });

    it("respects custom maxRounds and maxCostUsd", async () => {
      const state = await startDebate({
        topic: "test",
        format: "pro_con",
        maxRounds: 10,
        maxCostUsd: 2.0,
      });

      expect(state.maxRounds).toBe(10);
      expect(state.maxCostUsd).toBe(2.0);
    });
  });

  describe("listActiveDebates", () => {
    it("returns only active debates", async () => {
      await startDebate({ topic: "Active debate", format: "brainstorm" });

      const active = listActiveDebates();
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(active.every((d) => d.status === "active")).toBe(true);
    });
  });

  describe("injectHumanMessage", () => {
    it("returns false for unknown channel", () => {
      expect(injectHumanMessage("nonexistent", "hello")).toBe(false);
    });

    it("posts human message to active debate", async () => {
      const state = await startDebate({ topic: "Inject test", format: "pro_con" });

      const result = injectHumanMessage(state.channelId, "Human input here");
      expect(result).toBe(true);
    });
  });
});
