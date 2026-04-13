/**
 * Tests for share-manager — create, validate, revoke, list share tokens.
 * Uses in-memory SQLite via createTestDb.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createTestDb } from "./test-db.js";
import { sessions } from "../db/schema.js";

let testDbResult: ReturnType<typeof createTestDb>;

// Mock DB before importing service
const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult?.sqlite ?? null,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);

const {
  createShareToken,
  validateShareToken,
  revokeShareToken,
  listActiveShares,
  revokeAllForSession,
} = await import("../services/share-manager.js");

const SESSION_ID = "test-session-1";
const SESSION_ID_2 = "test-session-2";

beforeAll(() => {
  testDbResult = createTestDb();

  // Insert test sessions (shareTokens has FK to sessions)
  testDbResult.db
    .insert(sessions)
    .values({
      id: SESSION_ID,
      model: "claude-sonnet-4-6",
      status: "active",
      cwd: "/test",
      startedAt: new Date(),
    })
    .run();

  testDbResult.db
    .insert(sessions)
    .values({
      id: SESSION_ID_2,
      model: "claude-sonnet-4-6",
      status: "active",
      cwd: "/test2",
      startedAt: new Date(),
    })
    .run();
});

afterAll(() => {
  testDbResult.sqlite.close();
});

describe("share-manager", () => {
  describe("createShareToken", () => {
    test("creates token with default options", () => {
      const result = createShareToken({ sessionId: SESSION_ID });

      expect(result.token).toBeString();
      expect(result.token).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.permission).toBe("read-only");
      expect(result.createdBy).toBe("owner");
      expect(result.revokedAt).toBeNull();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test("respects custom permission 'interactive'", () => {
      const result = createShareToken({
        sessionId: SESSION_ID,
        permission: "interactive",
      });

      expect(result.permission).toBe("interactive");
    });

    test("respects custom expiry", () => {
      const expiresInMs = 60_000; // 1 minute
      const before = Date.now();
      const result = createShareToken({ sessionId: SESSION_ID, expiresInMs });
      const after = Date.now();

      const expectedMin = before + expiresInMs;
      const expectedMax = after + expiresInMs;

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    test("throws when session already has 10 active tokens", () => {
      // Use a separate session to avoid interference with other tests
      const sessionId = "session-max-limit";
      testDbResult.db
        .insert(sessions)
        .values({
          id: sessionId,
          model: "claude-sonnet-4-6",
          status: "active",
          cwd: "/limit-test",
          startedAt: new Date(),
        })
        .run();

      // Create 10 tokens
      for (let i = 0; i < 10; i++) {
        createShareToken({ sessionId });
      }

      // 11th should throw
      expect(() => createShareToken({ sessionId })).toThrow(
        "Max 10 active share tokens per session",
      );
    });
  });

  describe("validateShareToken", () => {
    test("valid token returns data including sessionName", () => {
      const created = createShareToken({ sessionId: SESSION_ID });
      const result = validateShareToken(created.token);

      expect(result).not.toBeNull();
      expect(result!.token).toBe(created.token);
      expect(result!.sessionId).toBe(SESSION_ID);
      expect(result!.permission).toBe("read-only");
      expect(result!.revokedAt).toBeNull();
    });

    test("invalid token returns null", () => {
      const result = validateShareToken("000000000000000000000000deadbeef");
      expect(result).toBeNull();
    });

    test("expired token returns null", () => {
      const created = createShareToken({
        sessionId: SESSION_ID,
        expiresInMs: 1, // expires almost immediately
      });

      // Wait for expiry
      Bun.sleepSync(10);

      const result = validateShareToken(created.token);
      expect(result).toBeNull();
    });

    test("revoked token returns null", () => {
      const created = createShareToken({ sessionId: SESSION_ID });
      revokeShareToken(created.token);

      const result = validateShareToken(created.token);
      expect(result).toBeNull();
    });
  });

  describe("revokeShareToken", () => {
    test("revokes existing active token and returns true", () => {
      const created = createShareToken({ sessionId: SESSION_ID });
      const result = revokeShareToken(created.token);

      expect(result).toBe(true);
      expect(validateShareToken(created.token)).toBeNull();
    });

    test("returns false for non-existent token", () => {
      const result = revokeShareToken("nonexistent00000000000000000token");
      expect(result).toBe(false);
    });

    test("returns false for already-revoked token", () => {
      const created = createShareToken({ sessionId: SESSION_ID });
      revokeShareToken(created.token); // first revoke
      const result = revokeShareToken(created.token); // second revoke

      expect(result).toBe(false);
    });
  });

  describe("listActiveShares", () => {
    test("returns only active (non-expired, non-revoked) tokens", () => {
      const sessionId = "session-list-active";
      testDbResult.db
        .insert(sessions)
        .values({
          id: sessionId,
          model: "claude-sonnet-4-6",
          status: "active",
          cwd: "/list-test",
          startedAt: new Date(),
        })
        .run();

      const t1 = createShareToken({ sessionId });
      const t2 = createShareToken({ sessionId });

      const active = listActiveShares(sessionId);
      const tokens = active.map((t) => t.token);

      expect(tokens).toContain(t1.token);
      expect(tokens).toContain(t2.token);
      expect(active.length).toBeGreaterThanOrEqual(2);
    });

    test("excludes revoked tokens", () => {
      const sessionId = "session-list-revoked";
      testDbResult.db
        .insert(sessions)
        .values({
          id: sessionId,
          model: "claude-sonnet-4-6",
          status: "active",
          cwd: "/revoked-test",
          startedAt: new Date(),
        })
        .run();

      const active = createShareToken({ sessionId });
      const revoked = createShareToken({ sessionId });
      revokeShareToken(revoked.token);

      const list = listActiveShares(sessionId);
      const tokens = list.map((t) => t.token);

      expect(tokens).toContain(active.token);
      expect(tokens).not.toContain(revoked.token);
    });
  });

  describe("revokeAllForSession", () => {
    test("revokes all active tokens for a session", () => {
      const sessionId = "session-revoke-all";
      testDbResult.db
        .insert(sessions)
        .values({
          id: sessionId,
          model: "claude-sonnet-4-6",
          status: "active",
          cwd: "/revoke-all-test",
          startedAt: new Date(),
        })
        .run();

      const t1 = createShareToken({ sessionId });
      const t2 = createShareToken({ sessionId });
      const t3 = createShareToken({ sessionId });

      revokeAllForSession(sessionId);

      expect(validateShareToken(t1.token)).toBeNull();
      expect(validateShareToken(t2.token)).toBeNull();
      expect(validateShareToken(t3.token)).toBeNull();
      expect(listActiveShares(sessionId)).toHaveLength(0);
    });

    test("returns count of revoked tokens", () => {
      const sessionId = "session-revoke-count";
      testDbResult.db
        .insert(sessions)
        .values({
          id: sessionId,
          model: "claude-sonnet-4-6",
          status: "active",
          cwd: "/revoke-count-test",
          startedAt: new Date(),
        })
        .run();

      createShareToken({ sessionId });
      createShareToken({ sessionId });

      const count = revokeAllForSession(sessionId);
      expect(count).toBe(2);
    });
  });
});
