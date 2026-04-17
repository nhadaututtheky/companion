/**
 * Tests for credential-manager dedup logic (migration 0040).
 *
 * Covers the Multi Account bug fix: when Claude OAuth refreshes the access
 * token (~hourly), the credential watcher writes the new credentials. The old
 * implementation dedup'd by sha256(accessToken) — a volatile value — so every
 * refresh inserted a new row. The fix keys on sha256(refreshToken), which is
 * stable across refreshes, and ships a startup dedupe to merge ghost rows
 * created before the migration.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { createHash } from "node:crypto";
import { createTestDb } from "./test-db.js";
import { accounts, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-credential-manager-dedup-only";

let testDbResult: ReturnType<typeof createTestDb>;

const dbClientMockFactory = () => ({
  getDb: () => testDbResult.db,
  getSqlite: () => testDbResult?.sqlite ?? null,
  closeDb: () => {},
  schema: {},
});
mock.module("../db/client.js", dbClientMockFactory);
if (process.platform !== "win32")
  mock.module(import.meta.resolve("../db/client.js"), dbClientMockFactory);

const { saveAccount, listAccounts, dedupeAccountsByIdentity } = await import(
  "../services/credential-manager.js"
);
const { encrypt } = await import("../services/crypto.js");

const identityFor = (refreshToken: string) =>
  createHash("sha256").update(refreshToken).digest("hex").slice(0, 16);

const fingerprintFor = (accessToken: string) =>
  createHash("sha256").update(accessToken).digest("hex").slice(0, 16);

const makeCreds = (suffix: string) => ({
  accessToken: `sk-ant-oat01-${suffix}`,
  refreshToken: `sk-ant-ort01-${suffix}`,
  expiresAt: Date.now() + 60_000,
  scopes: ["user:inference"],
  subscriptionType: "max",
  rateLimitTier: "default_claude_max_20x",
});

beforeAll(() => {
  testDbResult = createTestDb();
});

afterAll(() => {
  testDbResult.sqlite.close();
});

beforeEach(() => {
  testDbResult.db.delete(sessions).run();
  testDbResult.db.delete(accounts).run();
});

describe("credential-manager dedup (migration 0040)", () => {
  describe("saveAccount upsert by identity", () => {
    test("rotating access token does NOT create a new row", () => {
      const idA = saveAccount("Work Max", makeCreds("alpha"));

      // Simulate OAuth access-token refresh: refreshToken unchanged, accessToken rotated.
      const rotated = { ...makeCreds("alpha"), accessToken: "sk-ant-oat01-alpha-v2" };
      const idB = saveAccount("Work Max", rotated);

      expect(idA).toBe(idB);
      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.identity).toBe(identityFor("sk-ant-ort01-alpha"));
      // fingerprint refreshed to the new access token
      expect(rows[0]?.fingerprint).toBe(fingerprintFor("sk-ant-oat01-alpha-v2"));
    });

    test("different refresh token = different account", () => {
      saveAccount("Work Max", makeCreds("alpha"));
      saveAccount("Personal Pro", makeCreds("beta"));

      const rows = listAccounts();
      expect(rows).toHaveLength(2);
      const identities = rows.map((r) => r.identity).sort();
      expect(identities).toEqual(
        [identityFor("sk-ant-ort01-alpha"), identityFor("sk-ant-ort01-beta")].sort(),
      );
    });

    test("legacy row without identity gets merged on next save", () => {
      // Insert a pre-0040 row manually (no identity).
      const creds = makeCreds("alpha");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "legacy-id",
          label: "Legacy",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: null,
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      // Saving the same credentials should UPDATE the legacy row, not insert.
      const id = saveAccount("Work Max", creds);
      expect(id).toBe("legacy-id");
      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.identity).toBe(identityFor(creds.refreshToken));
      expect(rows[0]?.label).toBe("Work Max");
    });
  });

  describe("dedupeAccountsByIdentity", () => {
    test("no-op on empty database", () => {
      const result = dedupeAccountsByIdentity();
      expect(result).toEqual({ scanned: 0, backfilled: 0, merged: 0 });
    });

    test("backfills identity for pre-migration rows without merging", () => {
      const creds = makeCreds("alpha");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "legacy-id",
          label: "Legacy",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: null,
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      const result = dedupeAccountsByIdentity();
      expect(result.scanned).toBe(1);
      expect(result.backfilled).toBe(1);
      expect(result.merged).toBe(0);

      const rows = listAccounts();
      expect(rows[0]?.identity).toBe(identityFor(creds.refreshToken));
    });

    test("merges ghost rows that share one refreshToken", () => {
      const creds = makeCreds("alpha");
      // 3 ghost rows — same refreshToken, different accessTokens (simulates 3 OAuth refreshes
      // landing before the fix).
      for (let i = 0; i < 3; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `ghost-${i}`,
            label: `Work Max #${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            totalCostUsd: (i + 1) * 0.5,
            isActive: i === 2,
            lastUsedAt: new Date(Date.now() - (2 - i) * 1000),
            createdAt: new Date(Date.now() - (2 - i) * 10_000),
            updatedAt: new Date(),
          })
          .run();
      }

      const result = dedupeAccountsByIdentity();
      expect(result.scanned).toBe(3);
      expect(result.backfilled).toBe(3);
      expect(result.merged).toBe(2);

      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("ghost-2"); // active wins survivor race
      // Costs summed across the whole group.
      expect(rows[0]?.totalCostUsd).toBeCloseTo(0.5 + 1.0 + 1.5, 6);
    });

    test("reassigns sessions from duplicates to survivor", () => {
      const creds = makeCreds("alpha");
      for (let i = 0; i < 2; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `ghost-${i}`,
            label: `Work #${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            isActive: i === 0,
            createdAt: new Date(Date.now() - (1 - i) * 10_000),
            updatedAt: new Date(),
          })
          .run();
      }

      // Session historically attached to the duplicate (ghost-1).
      testDbResult.db
        .insert(sessions)
        .values({
          id: "session-1",
          model: "claude-sonnet-4-6",
          status: "ended",
          cwd: "/test",
          accountId: "ghost-1",
          startedAt: new Date(),
        })
        .run();

      dedupeAccountsByIdentity();

      const session = testDbResult.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, "session-1"))
        .get();
      expect(session?.accountId).toBe("ghost-0");
    });

    test("live-session guard: promotes row with active session as unconditional survivor", () => {
      // ghost-0 is marked isActive but has a terminal session.
      // ghost-1 is inactive but owns a live ("running") session — must survive.
      const creds = makeCreds("alpha");
      for (let i = 0; i < 2; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `ghost-${i}`,
            label: `Work #${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            isActive: i === 0, // ghost-0 is "active" per flag
            createdAt: new Date(Date.now() - (1 - i) * 10_000),
            updatedAt: new Date(),
          })
          .run();
      }

      testDbResult.db
        .insert(sessions)
        .values([
          {
            id: "s-terminal",
            model: "claude-sonnet-4-6",
            status: "ended",
            cwd: "/test",
            accountId: "ghost-0",
            startedAt: new Date(),
          },
          {
            id: "s-live",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/test",
            accountId: "ghost-1",
            startedAt: new Date(),
          },
        ])
        .run();

      dedupeAccountsByIdentity();

      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      // ghost-1 must survive — its live session would otherwise be orphaned.
      expect(rows[0]?.id).toBe("ghost-1");
    });

    test("live-session guard: skips merge when multiple rows have live sessions", () => {
      const creds = makeCreds("alpha");
      for (let i = 0; i < 2; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `ghost-${i}`,
            label: `Work #${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();
      }

      // Both rows have live sessions — can't safely pick a survivor.
      testDbResult.db
        .insert(sessions)
        .values([
          {
            id: "s-live-0",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/test",
            accountId: "ghost-0",
            startedAt: new Date(),
          },
          {
            id: "s-live-1",
            model: "claude-sonnet-4-6",
            status: "busy",
            cwd: "/test",
            accountId: "ghost-1",
            startedAt: new Date(),
          },
        ])
        .run();

      const result = dedupeAccountsByIdentity();
      expect(result.merged).toBe(0);
      expect(listAccounts()).toHaveLength(2); // both preserved
    });

    test("is idempotent — running twice is safe", () => {
      const creds = makeCreds("alpha");
      for (let i = 0; i < 2; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `ghost-${i}`,
            label: `Work #${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            createdAt: new Date(Date.now() - (1 - i) * 10_000),
            updatedAt: new Date(),
          })
          .run();
      }

      const first = dedupeAccountsByIdentity();
      const second = dedupeAccountsByIdentity();

      expect(first.merged).toBe(1);
      expect(second.merged).toBe(0); // nothing left to merge
      expect(listAccounts()).toHaveLength(1);
    });
  });
});
