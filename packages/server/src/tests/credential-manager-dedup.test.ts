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

const {
  saveAccount,
  listAccounts,
  dedupeAccountsByIdentity,
  mergeAccountsBySubject,
  dedupeAccountsBySubject,
  applyOAuthProfile,
  deleteAccount,
} = await import("../services/credential-manager.js");
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
      const { id: idA, created: createdA } = saveAccount("Work Max", makeCreds("alpha"));
      expect(createdA).toBe(true);

      // Simulate OAuth access-token refresh: refreshToken unchanged, accessToken rotated.
      const rotated = { ...makeCreds("alpha"), accessToken: "sk-ant-oat01-alpha-v2" };
      const { id: idB, created: createdB } = saveAccount("Work Max", rotated);

      expect(idA).toBe(idB);
      expect(createdB).toBe(false);
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
      const { id, created } = saveAccount("Work Max", creds);
      expect(id).toBe("legacy-id");
      expect(created).toBe(false);
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

  // ── Phase 2: dedup by canonical Anthropic subject (account.uuid) ────────────
  describe("mergeAccountsBySubject", () => {
    const SUBJECT = "11111111-2222-3333-4444-555555555555";

    /** Insert a duplicate row keyed on the same `oauthSubject`. */
    function insertSubjectRow(opts: {
      id: string;
      identity?: string;
      isActive?: boolean;
      lastUsedAt?: Date | null;
      createdAt?: Date;
      totalCostUsd?: number;
      session5hBudget?: number | null;
      weeklyBudget?: number | null;
      monthlyBudget?: number | null;
      skipInRotation?: boolean;
      subject?: string | null;
    }): void {
      const creds = makeCreds(opts.id);
      testDbResult.db
        .insert(accounts)
        .values({
          id: opts.id,
          label: `Acc ${opts.id}`,
          fingerprint: fingerprintFor(creds.accessToken),
          identity: opts.identity ?? `id-${opts.id}`,
          oauthSubject: opts.subject === undefined ? SUBJECT : opts.subject,
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          isActive: opts.isActive ?? false,
          lastUsedAt: opts.lastUsedAt ?? null,
          totalCostUsd: opts.totalCostUsd ?? 0,
          session5hBudget: opts.session5hBudget ?? null,
          weeklyBudget: opts.weeklyBudget ?? null,
          monthlyBudget: opts.monthlyBudget ?? null,
          skipInRotation: opts.skipInRotation ?? false,
          createdAt: opts.createdAt ?? new Date(),
          updatedAt: new Date(),
        })
        .run();
    }

    test("no-op when only one row carries the subject", () => {
      insertSubjectRow({ id: "solo" });
      const result = mergeAccountsBySubject(SUBJECT);
      expect(result).toEqual({ merged: 0, skipped: false });
      expect(listAccounts()).toHaveLength(1);
    });

    test("merges duplicates and sums totalCostUsd", () => {
      insertSubjectRow({
        id: "old",
        totalCostUsd: 1.5,
        createdAt: new Date(Date.now() - 20_000),
      });
      insertSubjectRow({
        id: "new",
        totalCostUsd: 2.25,
        isActive: true,
        createdAt: new Date(Date.now() - 5_000),
      });

      const result = mergeAccountsBySubject(SUBJECT);
      expect(result).toEqual({ merged: 1, skipped: false });

      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("new"); // active wins survivor race
      expect(rows[0]?.totalCostUsd).toBeCloseTo(3.75, 6);
    });

    test("survivor priority: live session > isActive flag", () => {
      // ghost-active is the flagged active row but has terminal sessions only.
      // ghost-live has a running session — it must be the survivor.
      insertSubjectRow({
        id: "ghost-active",
        isActive: true,
        createdAt: new Date(Date.now() - 20_000),
      });
      insertSubjectRow({
        id: "ghost-live",
        isActive: false,
        createdAt: new Date(Date.now() - 5_000),
      });

      testDbResult.db
        .insert(sessions)
        .values([
          {
            id: "s-end",
            model: "claude-sonnet-4-6",
            status: "ended",
            cwd: "/test",
            accountId: "ghost-active",
            startedAt: new Date(),
          },
          {
            id: "s-run",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/test",
            accountId: "ghost-live",
            startedAt: new Date(),
          },
        ])
        .run();

      mergeAccountsBySubject(SUBJECT);
      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("ghost-live");
    });

    test("skips merge when 2+ rows hold live sessions", () => {
      insertSubjectRow({ id: "a" });
      insertSubjectRow({ id: "b" });
      testDbResult.db
        .insert(sessions)
        .values([
          {
            id: "s-a",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/t",
            accountId: "a",
            startedAt: new Date(),
          },
          {
            id: "s-b",
            model: "claude-sonnet-4-6",
            status: "busy",
            cwd: "/t",
            accountId: "b",
            startedAt: new Date(),
          },
        ])
        .run();

      const result = mergeAccountsBySubject(SUBJECT);
      expect(result).toEqual({ merged: 0, skipped: true });
      expect(listAccounts()).toHaveLength(2);
    });

    test("reassigns sessions from duplicates to survivor", () => {
      insertSubjectRow({
        id: "survivor",
        isActive: true,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertSubjectRow({
        id: "duplicate",
        isActive: false,
        createdAt: new Date(Date.now() - 20_000),
      });

      testDbResult.db
        .insert(sessions)
        .values({
          id: "session-dup",
          model: "claude-sonnet-4-6",
          status: "ended",
          cwd: "/t",
          accountId: "duplicate",
          startedAt: new Date(),
        })
        .run();

      mergeAccountsBySubject(SUBJECT);

      const session = testDbResult.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, "session-dup"))
        .get();
      expect(session?.accountId).toBe("survivor");
    });

    test("budget fields keep the maximum non-null across the group", () => {
      insertSubjectRow({
        id: "low",
        session5hBudget: 5,
        weeklyBudget: null,
        monthlyBudget: 50,
        isActive: true,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertSubjectRow({
        id: "high",
        session5hBudget: 20,
        weeklyBudget: 100,
        monthlyBudget: null,
        createdAt: new Date(Date.now() - 20_000),
      });

      mergeAccountsBySubject(SUBJECT);
      const row = listAccounts()[0]!;
      expect(row.id).toBe("low"); // active wins
      expect(row.session5hBudget).toBe(20);
      expect(row.weeklyBudget).toBe(100);
      expect(row.monthlyBudget).toBe(50);
    });

    test("skipInRotation preserves true if ANY row had it set", () => {
      insertSubjectRow({
        id: "winner",
        isActive: true,
        skipInRotation: false,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertSubjectRow({
        id: "loser",
        skipInRotation: true,
        createdAt: new Date(Date.now() - 20_000),
      });

      mergeAccountsBySubject(SUBJECT);
      const row = listAccounts()[0]!;
      expect(row.id).toBe("winner");
      expect(row.skipInRotation).toBe(true);
    });

    test("idempotent — second run is a no-op", () => {
      insertSubjectRow({
        id: "a",
        isActive: true,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertSubjectRow({ id: "b", createdAt: new Date(Date.now() - 20_000) });

      const first = mergeAccountsBySubject(SUBJECT);
      const second = mergeAccountsBySubject(SUBJECT);

      expect(first.merged).toBe(1);
      expect(second.merged).toBe(0);
      expect(listAccounts()).toHaveLength(1);
    });

    test("empty subject is a no-op (defensive)", () => {
      insertSubjectRow({ id: "x" });
      const result = mergeAccountsBySubject("");
      expect(result).toEqual({ merged: 0, skipped: false });
      expect(listAccounts()).toHaveLength(1);
    });

    // ── Regression: F7 (review finding) — survivor must keep `isActive=true`
    //    if any row in the merge group was active. Earlier code unconditionally
    //    used the survivor row's own flag, which could leave the system with
    //    no active account when the active duplicate was dropped.
    test("isActive post-merge: survivor inherits active flag if any row was active", () => {
      // Survivor is forced via live-session priority (highest in the survivor
      // ranking, above isActive). The losing duplicate carries isActive=true.
      // Without the F7 fix the survivor would inherit its own isActive=false,
      // leaving the system with no active account.
      insertSubjectRow({
        id: "survivor-inactive",
        isActive: false,
        createdAt: new Date(Date.now() - 1_000),
      });
      insertSubjectRow({
        id: "duplicate-active",
        isActive: true,
        createdAt: new Date(Date.now() - 30_000),
      });
      // Live session pins `survivor-inactive` as the unconditional survivor.
      testDbResult.db
        .insert(sessions)
        .values({
          id: "s-live",
          model: "claude-sonnet-4-6",
          status: "running",
          cwd: "/t",
          accountId: "survivor-inactive",
          startedAt: new Date(),
        })
        .run();

      const result = mergeAccountsBySubject(SUBJECT);
      expect(result.merged).toBe(1);

      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("survivor-inactive");
      // The active flag must NOT have been lost — duplicate-active was dropped
      // but its isActive=true must have been promoted onto the survivor.
      expect(rows[0]?.isActive).toBe(true);
    });
  });

  // ── Regression: F6 (review finding) — `applyOAuthProfile` must persist the
  //    profile fields AND fold any sibling rows that already carry the same
  //    subject, atomically, in a single transaction. Earlier code did the
  //    UPDATE then a separate `mergeAccountsBySubject` — a TOCTOU window.
  describe("applyOAuthProfile (atomic UPDATE + merge)", () => {
    const SUBJECT = "ddddddddd-eeee-ffff-1111-222222222222".replace("ddddddddd", "dddddddd");

    test("writes subject + profile fields when no siblings exist", () => {
      const creds = makeCreds("solo");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "row-1",
          label: "Row 1",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: "id-row-1",
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      const result = applyOAuthProfile("row-1", {
        oauthSubject: SUBJECT,
        email: "user@example.com",
        displayName: "User",
        organizationUuid: null,
        organizationName: null,
      });

      expect(result).toEqual({ merged: 0, skipped: false });
      const row = listAccounts()[0]!;
      expect(row.id).toBe("row-1");
      expect(row.oauthSubject).toBe(SUBJECT);
      expect(row.email).toBe("user@example.com");
      expect(row.displayName).toBe("User");
    });

    test("UPDATE + merge run together: sibling rows with same subject collapse", () => {
      // Sibling already carries the subject (e.g. earlier capture). When a
      // freshly captured row resolves to the same subject, applyOAuthProfile
      // must both write the subject AND merge the two rows in one atomic step.
      const creds = makeCreds("dup");

      testDbResult.db
        .insert(accounts)
        .values([
          {
            id: "older",
            label: "Older",
            fingerprint: fingerprintFor(`${creds.accessToken}-a`),
            identity: "id-older",
            oauthSubject: SUBJECT,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-a` }),
            ),
            isActive: true,
            totalCostUsd: 1.25,
            createdAt: new Date(Date.now() - 30_000),
            updatedAt: new Date(),
          },
          {
            id: "newcomer",
            label: "Newcomer",
            fingerprint: fingerprintFor(`${creds.accessToken}-b`),
            identity: "id-newcomer",
            // oauthSubject intentionally null — the apply call sets it.
            oauthSubject: null,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-b` }),
            ),
            isActive: false,
            totalCostUsd: 0.75,
            createdAt: new Date(Date.now() - 1_000),
            updatedAt: new Date(),
          },
        ])
        .run();

      const result = applyOAuthProfile("newcomer", {
        oauthSubject: SUBJECT,
        email: null,
        displayName: null,
        organizationUuid: null,
        organizationName: null,
      });

      expect(result.merged).toBe(1);
      const rows = listAccounts();
      expect(rows).toHaveLength(1);
      // Older row has isActive=true so it wins the survivor race.
      expect(rows[0]?.id).toBe("older");
      // Costs summed.
      expect(rows[0]?.totalCostUsd).toBeCloseTo(2.0, 6);
      // Subject still pinned to the canonical value.
      expect(rows[0]?.oauthSubject).toBe(SUBJECT);
    });

    test("repeat call is idempotent (same subject, no siblings to fold)", () => {
      const creds = makeCreds("idem");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "only",
          label: "Only",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: "id-only",
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      const a = applyOAuthProfile("only", {
        oauthSubject: SUBJECT,
        email: "x@y.z",
        displayName: null,
        organizationUuid: null,
        organizationName: null,
      });
      const b = applyOAuthProfile("only", {
        oauthSubject: SUBJECT,
        email: "x@y.z",
        displayName: null,
        organizationUuid: null,
        organizationName: null,
      });

      expect(a.merged).toBe(0);
      expect(b.merged).toBe(0);
      expect(listAccounts()).toHaveLength(1);
    });
  });

  describe("dedupeAccountsBySubject", () => {
    test("groups by distinct subject and skips nulls", () => {
      const subA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const subB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      const baseCreds = makeCreds("dual");

      const insert = (id: string, subject: string | null, age: number) =>
        testDbResult.db
          .insert(accounts)
          .values({
            id,
            label: id,
            fingerprint: fingerprintFor(`${baseCreds.accessToken}-${id}`),
            identity: `id-${id}`,
            oauthSubject: subject,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...baseCreds, accessToken: `${baseCreds.accessToken}-${id}` }),
            ),
            isActive: id.endsWith("-keep"),
            createdAt: new Date(Date.now() - age),
            updatedAt: new Date(),
          })
          .run();

      insert("a-1-keep", subA, 1_000);
      insert("a-2-drop", subA, 30_000);
      insert("b-1-keep", subB, 1_000);
      insert("b-2-drop", subB, 30_000);
      insert("legacy-null", null, 1_000); // skipped — no subject yet

      const result = dedupeAccountsBySubject();
      expect(result.scanned).toBe(2); // two distinct subjects
      expect(result.merged).toBe(2); // one duplicate per subject
      expect(result.skipped).toBe(0);

      const rows = listAccounts();
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.id).sort()).toEqual(["a-1-keep", "b-1-keep", "legacy-null"]);
    });

    test("reports skipped count when live sessions block a group", () => {
      const sub = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const creds = makeCreds("guard");
      for (let i = 0; i < 2; i++) {
        testDbResult.db
          .insert(accounts)
          .values({
            id: `live-${i}`,
            label: `Live ${i}`,
            fingerprint: fingerprintFor(`${creds.accessToken}-v${i}`),
            identity: `id-live-${i}`,
            oauthSubject: sub,
            encryptedCredentials: encrypt(
              JSON.stringify({ ...creds, accessToken: `${creds.accessToken}-v${i}` }),
            ),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();
      }
      testDbResult.db
        .insert(sessions)
        .values([
          {
            id: "ls-0",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/t",
            accountId: "live-0",
            startedAt: new Date(),
          },
          {
            id: "ls-1",
            model: "claude-sonnet-4-6",
            status: "running",
            cwd: "/t",
            accountId: "live-1",
            startedAt: new Date(),
          },
        ])
        .run();

      const result = dedupeAccountsBySubject();
      expect(result.merged).toBe(0);
      expect(result.skipped).toBe(1);
      expect(listAccounts()).toHaveLength(2);
    });
  });

  describe("deleteAccount live-session guard (INV)", () => {
    test("throws if a non-terminal session points at the account", () => {
      const creds = makeCreds("alpha");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "with-live",
          label: "Live",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: identityFor(creds.refreshToken),
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      testDbResult.db
        .insert(sessions)
        .values({
          id: "s-live",
          model: "claude-sonnet-4-6",
          status: "running",
          cwd: "/test",
          accountId: "with-live",
          startedAt: new Date(),
        })
        .run();

      expect(() => deleteAccount("with-live")).toThrow(/live session/);
      expect(listAccounts()).toHaveLength(1); // not deleted
    });

    test("succeeds when only terminal sessions reference the account", () => {
      const creds = makeCreds("beta");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "with-ended",
          label: "Ended",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: identityFor(creds.refreshToken),
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      testDbResult.db
        .insert(sessions)
        .values({
          id: "s-done",
          model: "claude-sonnet-4-6",
          status: "ended",
          cwd: "/test",
          accountId: "with-ended",
          startedAt: new Date(Date.now() - 60_000),
          endedAt: new Date(),
        })
        .run();

      expect(deleteAccount("with-ended")).toBe(true);
      expect(listAccounts()).toHaveLength(0);
      // The historical session row should still exist with accountId detached.
      const detached = testDbResult.db.select().from(sessions).all();
      expect(detached).toHaveLength(1);
      expect(detached[0]?.accountId).toBeNull();
    });

    test("still throws on isActive (existing guard, unchanged)", () => {
      const creds = makeCreds("gamma");
      testDbResult.db
        .insert(accounts)
        .values({
          id: "active",
          label: "Active",
          fingerprint: fingerprintFor(creds.accessToken),
          identity: identityFor(creds.refreshToken),
          encryptedCredentials: encrypt(JSON.stringify(creds)),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      expect(() => deleteAccount("active")).toThrow(/active account/);
    });
  });
});
