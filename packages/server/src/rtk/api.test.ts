/**
 * Unit tests for rtk/api.ts — compressText + getAutoCompressConfig.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb } from "../test-utils.js";

let currentDb: ReturnType<typeof createTestDb>["db"] | null = null;
let currentSqlite: Database | null = null;

const dbMockFactory = () => ({
  getDb: () => {
    if (!currentDb) throw new Error("Test DB not initialised");
    return currentDb;
  },
  getSqlite: () => currentSqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbMockFactory);

// Import AFTER mock
import {
  compressText,
  getAutoCompressConfig,
  resetAutoCompressConfigCache,
  HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD,
} from "./api.js";
import { setSetting } from "../services/settings-helpers.js";

beforeEach(() => {
  const result = createTestDb();
  currentDb = result.db;
  currentSqlite = result.sqlite;
  resetAutoCompressConfigCache();
});

describe("compressText", () => {
  it("returns text verbatim when input is under budget", () => {
    const small = "Hello world";
    const result = compressText(small, { budgetTokens: 1000 });
    expect(result.compressed).toBe(small);
    expect(result.ratio).toBe(1);
    expect(result.strategiesApplied).toEqual([]);
  });

  it("compresses when input exceeds budget", () => {
    // Build a chunk of text larger than 4 * 200 chars (~50 tokens) to bypass
    // the pipeline's MIN_INPUT_LENGTH gate, and longer than the budget.
    const big = "A".repeat(8000) + "\n" + "B".repeat(8000);
    const result = compressText(big, { budgetTokens: 200 });
    expect(result.compressed.length).toBeLessThan(big.length);
    expect(result.compressedTokens).toBeLessThanOrEqual(220);
    expect(result.ratio).toBeLessThan(1);
  });

  it("hard-truncates when pipeline output still exceeds budget", () => {
    const big = "Random unique line " + "x".repeat(20_000);
    const result = compressText(big, { budgetTokens: 200 });
    // 200 tokens * 4 chars = 800 chars + small marker
    expect(result.compressed.length).toBeLessThan(900);
    expect(result.strategiesApplied).toContain("hard-truncate");
  });

  it("uses default budget (2000) when omitted", () => {
    const small = "Hello"; // way under any reasonable budget
    const result = compressText(small);
    expect(result.compressed).toBe(small);
  });

  it("never throws on empty-ish input over budget", () => {
    // 1-char text, budget 0 — edge case
    const result = compressText("x", { budgetTokens: 1 });
    // Either returns x (under budget at 1 token), or compresses gracefully
    expect(typeof result.compressed).toBe("string");
    expect(result.compressed.length).toBeGreaterThan(0);
  });
});

describe("getAutoCompressConfig", () => {
  it("returns defaults when no settings exist", () => {
    const cfg = getAutoCompressConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.thresholdTokens).toBe(HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD);
  });

  it("respects harness.autoCompressEnabled = false", () => {
    setSetting("harness.autoCompressEnabled", "false");
    resetAutoCompressConfigCache();
    const cfg = getAutoCompressConfig();
    expect(cfg.enabled).toBe(false);
  });

  it("respects harness.autoCompressThreshold within bounds", () => {
    setSetting("harness.autoCompressThreshold", "8000");
    resetAutoCompressConfigCache();
    const cfg = getAutoCompressConfig();
    expect(cfg.thresholdTokens).toBe(8000);
  });

  it("rejects out-of-range threshold and keeps default", () => {
    setSetting("harness.autoCompressThreshold", "999999");
    resetAutoCompressConfigCache();
    const cfg = getAutoCompressConfig();
    expect(cfg.thresholdTokens).toBe(HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD);
  });

  it("rejects non-numeric threshold and keeps default", () => {
    setSetting("harness.autoCompressThreshold", "not-a-number");
    resetAutoCompressConfigCache();
    const cfg = getAutoCompressConfig();
    expect(cfg.thresholdTokens).toBe(HARNESS_AUTO_COMPRESS_DEFAULT_THRESHOLD);
  });

  it("caches across calls (no double DB read)", () => {
    setSetting("harness.autoCompressThreshold", "5000");
    resetAutoCompressConfigCache();
    const a = getAutoCompressConfig();
    // Mutate underlying setting to a value that would be rejected if reread.
    setSetting("harness.autoCompressThreshold", "999999");
    const b = getAutoCompressConfig();
    expect(a.thresholdTokens).toBe(5000);
    expect(b.thresholdTokens).toBe(5000); // cached
  });

  it("resetAutoCompressConfigCache forces a fresh read", () => {
    setSetting("harness.autoCompressThreshold", "5000");
    resetAutoCompressConfigCache();
    const a = getAutoCompressConfig();
    setSetting("harness.autoCompressThreshold", "7500");
    resetAutoCompressConfigCache();
    const b = getAutoCompressConfig();
    expect(a.thresholdTokens).toBe(5000);
    expect(b.thresholdTokens).toBe(7500);
  });
});
