/**
 * Tests for error-tracker — buffer mechanics, flush, and query.
 * Uses in-memory SQLite.
 */

import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { createTestDb } from "./test-db.js";

const testDbResult = createTestDb();
const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult.sqlite,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbClientMockFactory);

const { trackError, flushErrors, getErrors, clearErrors } =
  await import("../services/error-tracker.js");

describe("error-tracker", () => {
  beforeEach(() => {
    clearErrors();
    flushErrors(); // Ensure buffer is flushed
  });

  afterAll(() => {
    testDbResult.sqlite.close();
  });

  describe("trackError + flush", () => {
    test("tracks and flushes a single error", () => {
      trackError({
        source: "test",
        message: "Something went wrong",
        level: "error",
      });
      flushErrors();

      const result = getErrors({ source: "test" });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]!.message).toBe("Something went wrong");
      expect(result.errors[0]!.source).toBe("test");
    });

    test("tracks error with session context", () => {
      trackError({
        source: "ws-bridge",
        message: "Session crashed",
        sessionId: "session-123",
        context: { pid: 12345 },
      });
      flushErrors();

      const result = getErrors({ sessionId: "session-123" });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]!.sessionId).toBe("session-123");
    });

    test("tracks error with stack trace", () => {
      trackError({
        source: "test",
        message: "Error with stack",
        stack: "Error: test\n  at foo.ts:10",
      });
      flushErrors();

      const result = getErrors({ source: "test" });
      const found = result.errors.find((e) => e.message === "Error with stack");
      expect(found).toBeTruthy();
      expect(found!.stack).toContain("foo.ts:10");
    });
  });

  describe("getErrors — filtering", () => {
    test("filters by source", () => {
      trackError({ source: "alpha", message: "Alpha error" });
      trackError({ source: "beta", message: "Beta error" });
      flushErrors();

      const alphaResult = getErrors({ source: "alpha" });
      expect(alphaResult.errors.every((e) => e.source === "alpha")).toBe(true);
    });

    test("supports pagination", () => {
      for (let i = 0; i < 5; i++) {
        trackError({ source: "paginate", message: `Error ${i}` });
      }
      flushErrors();

      const page1 = getErrors({ source: "paginate", limit: 2, offset: 0 });
      expect(page1.errors).toHaveLength(2);

      const page2 = getErrors({ source: "paginate", limit: 2, offset: 2 });
      expect(page2.errors).toHaveLength(2);
    });
  });

  describe("clearErrors", () => {
    test("clears all errors and returns count", () => {
      trackError({ source: "clear-test", message: "To be cleared 1" });
      trackError({ source: "clear-test", message: "To be cleared 2" });
      flushErrors();

      const count = clearErrors();
      expect(count).toBeGreaterThanOrEqual(2);

      const result = getErrors({ source: "clear-test" });
      expect(result.errors).toHaveLength(0);
    });
  });
});
