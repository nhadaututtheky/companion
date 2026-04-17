/**
 * Tests for CodeGraph query telemetry — Phase 0 baseline.
 * Uses in-memory SQLite via the shared test-db helper.
 */

import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { createTestDb } from "../../tests/test-db.js";

// Set up in-memory DB before importing the module under test
const testDbResult = createTestDb();
const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult.sqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../../db/client.js"), dbClientMockFactory);

const { logQuery, summarize, rotateOldRows, instrumentQuery } = await import("../telemetry.js");
import { codeQueryLog } from "../../db/schema.js";

function clearLogs() {
  testDbResult.db.delete(codeQueryLog).run();
}

describe("CodeGraph Telemetry", () => {
  beforeEach(() => {
    clearLogs();
  });

  afterAll(() => {
    testDbResult.sqlite.close();
  });

  // ─── 1. logQuery writes row correctly ────────────────────────────────

  describe("logQuery", () => {
    test("writes a row with all fields", () => {
      logQuery({
        projectSlug: "test-project",
        queryType: "find_symbol",
        queryText: "getUserById",
        resultCount: 3,
        tokensReturned: 120,
        latencyMs: 45,
        agentSource: "mcp",
      });

      const rows = testDbResult.db.select().from(codeQueryLog).all();
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.projectSlug).toBe("test-project");
      expect(row.queryType).toBe("find_symbol");
      expect(row.queryText).toBe("getUserById");
      expect(row.resultCount).toBe(3);
      expect(row.tokensReturned).toBe(120);
      expect(row.latencyMs).toBe(45);
      expect(row.agentSource).toBe("mcp");
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    test("writes row with null optional fields", () => {
      logQuery({
        projectSlug: "test-project",
        queryType: "hot_files",
        resultCount: 0,
        tokensReturned: 0,
        latencyMs: 10,
      });

      const rows = testDbResult.db.select().from(codeQueryLog).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.queryText).toBeNull();
      expect(rows[0]!.agentSource).toBeNull();
    });

    test("never throws on DB error (swallows exceptions)", () => {
      // Pass a bad entry — should not throw
      expect(() => {
        logQuery({
          projectSlug: "",
          queryType: "find_symbol",
          resultCount: 0,
          tokensReturned: 0,
          latencyMs: 0,
        });
      }).not.toThrow();
    });
  });

  // ─── 2. summarize returns correct aggregates ─────────────────────────

  describe("summarize", () => {
    test("returns empty summary when no rows", () => {
      const result = summarize("empty-project", 7);
      expect(result.totalQueries).toBe(0);
      expect(result.overallHitRate).toBe(0);
      expect(result.byType).toHaveLength(0);
      expect(result.top10Slowest).toHaveLength(0);
      expect(result.queriesOverTime).toHaveLength(0);
    });

    test("computes correct hit rate and per-type stats", () => {
      const slug = "proj-a";
      // 3 hits + 1 miss for find_symbol
      logQuery({
        projectSlug: slug,
        queryType: "find_symbol",
        queryText: "foo",
        resultCount: 5,
        tokensReturned: 200,
        latencyMs: 30,
        agentSource: "mcp",
      });
      logQuery({
        projectSlug: slug,
        queryType: "find_symbol",
        queryText: "bar",
        resultCount: 2,
        tokensReturned: 100,
        latencyMs: 50,
        agentSource: "mcp",
      });
      logQuery({
        projectSlug: slug,
        queryType: "find_symbol",
        queryText: "baz",
        resultCount: 0,
        tokensReturned: 0,
        latencyMs: 20,
        agentSource: "mcp",
      });
      logQuery({
        projectSlug: slug,
        queryType: "find_symbol",
        queryText: "qux",
        resultCount: 1,
        tokensReturned: 80,
        latencyMs: 40,
        agentSource: "mcp",
      });
      // 1 hot_files hit
      logQuery({
        projectSlug: slug,
        queryType: "hot_files",
        queryText: null,
        resultCount: 8,
        tokensReturned: 400,
        latencyMs: 15,
      });

      const summary = summarize(slug, 7);
      expect(summary.totalQueries).toBe(5);

      // 4 hits out of 5 = 0.8
      expect(summary.overallHitRate).toBeCloseTo(0.8, 2);

      const findSymbolStat = summary.byType.find((s) => s.queryType === "find_symbol");
      expect(findSymbolStat).toBeDefined();
      expect(findSymbolStat!.totalCalls).toBe(4);
      expect(findSymbolStat!.hitRate).toBeCloseTo(0.75, 2); // 3/4
      expect(findSymbolStat!.avgLatencyMs).toBe(35); // (30+50+20+40)/4

      const hotFilesStat = summary.byType.find((s) => s.queryType === "hot_files");
      expect(hotFilesStat).toBeDefined();
      expect(hotFilesStat!.hitRate).toBe(1);
    });

    test("top10Slowest returns slowest queries in order", () => {
      const slug = "proj-slow";
      for (let i = 0; i < 12; i++) {
        logQuery({
          projectSlug: slug,
          queryType: "impact_radius",
          queryText: `file${i}`,
          resultCount: 1,
          tokensReturned: 100,
          latencyMs: i * 10 + 5,
        });
      }

      const summary = summarize(slug, 7);
      expect(summary.top10Slowest).toHaveLength(10);
      // Should be sorted descending by latencyMs
      for (let i = 1; i < summary.top10Slowest.length; i++) {
        expect(summary.top10Slowest[i - 1]!.latencyMs).toBeGreaterThanOrEqual(
          summary.top10Slowest[i]!.latencyMs,
        );
      }
      // Slowest should be latencyMs = 11*10+5 = 115
      expect(summary.top10Slowest[0]!.latencyMs).toBe(115);
    });

    test("does not include rows outside date range", () => {
      const slug = "proj-range";
      // Insert a row with an old date
      testDbResult.db
        .insert(codeQueryLog)
        .values({
          projectSlug: slug,
          queryType: "find_symbol",
          resultCount: 5,
          tokensReturned: 100,
          latencyMs: 20,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        })
        .run();

      // Insert a recent row
      logQuery({
        projectSlug: slug,
        queryType: "find_symbol",
        resultCount: 2,
        tokensReturned: 50,
        latencyMs: 10,
      });

      const summary = summarize(slug, 7); // only 7 days
      expect(summary.totalQueries).toBe(1); // only the recent one
    });
  });

  // ─── 3. rotation caps at 10K, oldest deleted first ───────────────────

  describe("rotateOldRows", () => {
    test("does not delete when count is under cap", () => {
      const slug = "proj-rot-under";
      const now = new Date();

      // Insert 50 rows (well under 10K)
      for (let i = 0; i < 50; i++) {
        testDbResult.db
          .insert(codeQueryLog)
          .values({
            projectSlug: slug,
            queryType: "find_symbol",
            resultCount: 1,
            tokensReturned: 50,
            latencyMs: 5,
            createdAt: now,
          })
          .run();
      }

      rotateOldRows(slug);

      const rows = testDbResult.db.select().from(codeQueryLog).all();
      expect(rows.filter((r) => r.projectSlug === slug)).toHaveLength(50);
    });

    test("deletes oldest rows when count exceeds 10K cap", () => {
      const slug = "proj-rot-over";
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Insert 10001 rows (1 over cap)
      const batch = 100;
      for (let batch_i = 0; batch_i < 101; batch_i++) {
        const values = [];
        for (let j = 0; j < batch; j++) {
          // All with slightly different timestamps to ensure ordering
          values.push({
            projectSlug: slug,
            queryType: "find_symbol",
            resultCount: 1,
            tokensReturned: 50,
            latencyMs: 5,
            createdAt: new Date(today.getTime() + batch_i * batch + j),
          });
          if (values.length >= 10001) break;
        }
        for (const v of values) {
          testDbResult.db.insert(codeQueryLog).values(v).run();
        }
        if (
          testDbResult.db
            .select()
            .from(codeQueryLog)
            .all()
            .filter((r) => r.projectSlug === slug).length >= 10001
        )
          break;
      }

      // Verify we have >= 10001
      const countBefore = testDbResult.db
        .select()
        .from(codeQueryLog)
        .all()
        .filter((r) => r.projectSlug === slug).length;
      expect(countBefore).toBeGreaterThanOrEqual(10001);

      rotateOldRows(slug);

      const remaining = testDbResult.db
        .select()
        .from(codeQueryLog)
        .all()
        .filter((r) => r.projectSlug === slug);
      expect(remaining).toHaveLength(10000);
    });
  });

  // ─── 4. tokensReturned computed correctly in instrumentQuery ─────────

  describe("instrumentQuery", () => {
    test("calculates tokensReturned as ceil(json_length / 4)", () => {
      clearLogs();
      const slug = "proj-tokens";
      const mockResult = [{ a: 1 }, { b: 2 }];
      const jsonLen = JSON.stringify(mockResult).length; // e.g. 18 chars
      const expectedTokens = Math.ceil(jsonLen / 4);

      instrumentQuery("find_symbol", "test", "mcp", slug, () => mockResult);

      // Give it a tick to fire-and-forget
      const rows = testDbResult.db
        .select()
        .from(codeQueryLog)
        .all()
        .filter((r) => r.projectSlug === slug);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.tokensReturned).toBe(expectedTokens);
      expect(rows[0]!.resultCount).toBe(2); // array length
    });

    test("returns the original function result unchanged", () => {
      const expected = [{ id: 42 }];
      const actual = instrumentQuery("hot_files", null, "http", "proj-passthrough", () => expected);
      expect(actual).toStrictEqual(expected);
    });

    test("logs resultCount=1 for non-array truthy results", () => {
      clearLogs();
      const slug = "proj-scalar";
      instrumentQuery("exported_nodes", "path.ts", "internal", slug, () => ({ value: "hello" }));
      const rows = testDbResult.db
        .select()
        .from(codeQueryLog)
        .all()
        .filter((r) => r.projectSlug === slug);
      expect(rows[0]!.resultCount).toBe(1);
    });

    test("logs resultCount=0 for null/undefined results", () => {
      clearLogs();
      const slug = "proj-null";
      instrumentQuery("find_symbol", "nothing", "internal", slug, () => null);
      const rows = testDbResult.db
        .select()
        .from(codeQueryLog)
        .all()
        .filter((r) => r.projectSlug === slug);
      expect(rows[0]!.resultCount).toBe(0);
    });
  });
});
