/**
 * Account Merge Events lifecycle (Phase 3).
 *
 * Covers the user-facing tail of multi-account dedup:
 *   1. mergeAccountsBySubject records an event ONLY when non-null budget caps
 *      diverge across the merge group.
 *   2. listPendingMergeEvents returns only unresolved events, newest first.
 *   3. dismiss / apply mark the event resolved with the right audit choice.
 *   4. apply:<accountId> rewrites the survivor's budgets to that snapshot row.
 *   5. Cascade-delete: removing the survivor account removes the event.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll, mock } from "bun:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db.js";
import { accounts, accountMergeEvents } from "../db/schema.js";

process.env.COMPANION_ENCRYPTION_KEY ??= "test-key-for-account-merge-events-only";

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

const { mergeAccountsBySubject, listAccounts } = await import(
  "../services/credential-manager.js"
);
const {
  listPendingMergeEvents,
  dismissMergeEvent,
  applyMergeEventChoice,
  pruneResolvedMergeEvents,
} = await import("../services/account-merge-events.js");
const { encrypt } = await import("../services/crypto.js");

const SUBJECT = "abcdef01-2345-6789-abcd-ef0123456789";

const fingerprintFor = (accessToken: string) =>
  createHash("sha256").update(accessToken).digest("hex").slice(0, 16);

const makeCreds = (suffix: string) => ({
  accessToken: `sk-ant-oat01-${suffix}`,
  refreshToken: `sk-ant-ort01-${suffix}`,
  expiresAt: Date.now() + 60_000,
  scopes: ["user:inference"],
});

interface RowOpts {
  id: string;
  isActive?: boolean;
  createdAt?: Date;
  session5hBudget?: number | null;
  weeklyBudget?: number | null;
  monthlyBudget?: number | null;
  totalCostUsd?: number;
  subject?: string;
}

function insertRow(opts: RowOpts): void {
  const creds = makeCreds(opts.id);
  testDbResult.db
    .insert(accounts)
    .values({
      id: opts.id,
      label: `Acc ${opts.id}`,
      fingerprint: fingerprintFor(creds.accessToken),
      identity: `id-${opts.id}`,
      oauthSubject: opts.subject ?? SUBJECT,
      encryptedCredentials: encrypt(JSON.stringify(creds)),
      isActive: opts.isActive ?? false,
      session5hBudget: opts.session5hBudget ?? null,
      weeklyBudget: opts.weeklyBudget ?? null,
      monthlyBudget: opts.monthlyBudget ?? null,
      totalCostUsd: opts.totalCostUsd ?? 0,
      createdAt: opts.createdAt ?? new Date(),
      updatedAt: new Date(),
    })
    .run();
}

beforeAll(() => {
  testDbResult = createTestDb();
});

afterAll(() => {
  testDbResult.sqlite.close();
});

beforeEach(() => {
  testDbResult.db.delete(accountMergeEvents).run();
  testDbResult.db.delete(accounts).run();
});

describe("account merge events", () => {
  describe("recording (mergeAccountsBySubject)", () => {
    test("records an event when non-null budgets diverge", () => {
      // Two rows with different non-null session5hBudget values → conflict.
      insertRow({
        id: "low",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "high",
        session5hBudget: 20,
        createdAt: new Date(Date.now() - 30_000),
      });

      const result = mergeAccountsBySubject(SUBJECT);
      expect(result.merged).toBe(1);

      const events = listPendingMergeEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.appliedSession5hBudget).toBe(20);
      expect(events[0]?.beforeState).toHaveLength(2);
      expect(events[0]?.beforeState.map((r) => r.id).sort()).toEqual(["high", "low"]);
    });

    test("does NOT record an event when budgets agree across rows", () => {
      // Both rows pin session5hBudget=10 → no conflict.
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 10,
        weeklyBudget: 100,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 10,
        weeklyBudget: 100,
        createdAt: new Date(Date.now() - 30_000),
      });

      mergeAccountsBySubject(SUBJECT);
      expect(listPendingMergeEvents()).toHaveLength(0);
    });

    test("does NOT record when one side is null and the other has a value", () => {
      // null + 10 has only ONE distinct non-null value → not a conflict.
      // Auto-pick = 10, which is the only setting the user expressed. No banner.
      insertRow({
        id: "set",
        isActive: true,
        weeklyBudget: 50,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "unset",
        weeklyBudget: null,
        createdAt: new Date(Date.now() - 30_000),
      });

      mergeAccountsBySubject(SUBJECT);
      expect(listPendingMergeEvents()).toHaveLength(0);
    });

    test("records when ANY of the three budget fields conflicts", () => {
      // Only monthlyBudget diverges; session5h + weekly agree.
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        weeklyBudget: 50,
        monthlyBudget: 100,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 5,
        weeklyBudget: 50,
        monthlyBudget: 200,
        createdAt: new Date(Date.now() - 30_000),
      });

      mergeAccountsBySubject(SUBJECT);
      const events = listPendingMergeEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.appliedMonthlyBudget).toBe(200);
    });
  });

  describe("listPendingMergeEvents", () => {
    test("returns only unresolved events, newest first", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 20,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);

      // Manually mark first event resolved, then trigger a second merge.
      testDbResult.db
        .update(accountMergeEvents)
        .set({ resolvedAt: new Date(), resolvedChoice: "kept" })
        .run();

      // Second wave under a different subject so we don't reuse the same row.
      const SUBJECT_2 = "11111111-aaaa-bbbb-cccc-222222222222";
      insertRow({
        id: "c",
        isActive: true,
        session5hBudget: 7,
        subject: SUBJECT_2,
        createdAt: new Date(Date.now() - 1_000),
      });
      insertRow({
        id: "d",
        session5hBudget: 15,
        subject: SUBJECT_2,
        createdAt: new Date(Date.now() - 2_000),
      });
      mergeAccountsBySubject(SUBJECT_2);

      const events = listPendingMergeEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.oauthSubject).toBe(SUBJECT_2);
    });
  });

  describe("dismissMergeEvent", () => {
    test("marks the event resolved with choice='kept'", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 20,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      const eventId = listPendingMergeEvents()[0]!.id;

      const result = dismissMergeEvent(eventId);
      expect(result.ok).toBe(true);

      expect(listPendingMergeEvents()).toHaveLength(0);
      const stored = testDbResult.db
        .select()
        .from(accountMergeEvents)
        .where(eq(accountMergeEvents.id, eventId))
        .get();
      expect(stored?.resolvedChoice).toBe("kept");
      expect(stored?.resolvedAt).toBeInstanceOf(Date);
    });

    test("returns not_found for missing event id", () => {
      expect(dismissMergeEvent("nonexistent")).toEqual({ ok: false, reason: "not_found" });
    });

    test("returns already_resolved for events with resolvedAt set", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({ id: "b", session5hBudget: 20 });
      mergeAccountsBySubject(SUBJECT);
      const eventId = listPendingMergeEvents()[0]!.id;
      dismissMergeEvent(eventId);

      expect(dismissMergeEvent(eventId)).toEqual({
        ok: false,
        reason: "already_resolved",
      });
    });
  });

  describe("applyMergeEventChoice", () => {
    test("'kept' is equivalent to dismiss (no budget mutation)", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 20,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      const event = listPendingMergeEvents()[0]!;

      // Survivor is "a" (active wins) → after merge it carries the auto-max=20.
      const beforeBudget = listAccounts()[0]!.session5hBudget;
      expect(beforeBudget).toBe(20);

      const result = applyMergeEventChoice(event.id, "kept");
      expect(result.ok).toBe(true);

      const after = listAccounts()[0]!;
      expect(after.session5hBudget).toBe(beforeBudget);
    });

    test("'applied:<id>' overwrites survivor budgets with that snapshot row", () => {
      // Two rows: low caps (active winner) and high caps (loser). After merge
      // the survivor inherits the max — but the user wants the LOW caps back.
      insertRow({
        id: "low-active",
        isActive: true,
        session5hBudget: 5,
        weeklyBudget: 25,
        monthlyBudget: 100,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "high",
        session5hBudget: 50,
        weeklyBudget: 250,
        monthlyBudget: 1000,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      const event = listPendingMergeEvents()[0]!;

      // Survivor is "low-active" but currently carries the maxes (50/250/1000).
      expect(listAccounts()[0]!.session5hBudget).toBe(50);

      const result = applyMergeEventChoice(event.id, "applied:low-active");
      expect(result.ok).toBe(true);

      const after = listAccounts()[0]!;
      // Re-applied to the original "low-active" caps the user had set.
      expect(after.session5hBudget).toBe(5);
      expect(after.weeklyBudget).toBe(25);
      expect(after.monthlyBudget).toBe(100);

      // Event resolved with the right choice for audit.
      const stored = testDbResult.db
        .select()
        .from(accountMergeEvents)
        .where(eq(accountMergeEvents.id, event.id))
        .get();
      expect(stored?.resolvedChoice).toBe("applied:low-active");
    });

    test("'applied:<id>' rejects an id not in the snapshot", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({ id: "b", session5hBudget: 20 });
      mergeAccountsBySubject(SUBJECT);
      const event = listPendingMergeEvents()[0]!;

      const result = applyMergeEventChoice(event.id, "applied:bogus");
      expect(result).toEqual({ ok: false, reason: "choice_not_in_snapshot" });
    });

    test("rejects a missing event id", () => {
      expect(applyMergeEventChoice("nope", "kept")).toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    test("rejects an event that is already resolved", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({ id: "b", session5hBudget: 20 });
      mergeAccountsBySubject(SUBJECT);
      const eventId = listPendingMergeEvents()[0]!.id;
      dismissMergeEvent(eventId);

      expect(applyMergeEventChoice(eventId, "kept")).toEqual({
        ok: false,
        reason: "already_resolved",
      });
    });
  });

  describe("cascade delete", () => {
    test("deleting the survivor account removes its merge events", () => {
      insertRow({
        id: "survivor",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "loser",
        session5hBudget: 20,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      expect(listPendingMergeEvents()).toHaveLength(1);

      // Force-delete the survivor row directly — covers the FK cascade,
      // independent of the higher-level deleteAccount() guard.
      testDbResult.db.delete(accounts).where(eq(accounts.id, "survivor")).run();

      expect(listPendingMergeEvents()).toHaveLength(0);
    });
  });

  describe("concurrent apply (already_resolved guard)", () => {
    test("two simultaneous applies — exactly one wins, the other gets already_resolved", async () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 50,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      const events = listPendingMergeEvents();
      expect(events).toHaveLength(1);
      const eventId = events[0]!.id;

      // SQLite serializes writers within one connection — the second apply must
      // observe resolvedAt set by the first and bail with already_resolved.
      // bun-sqlite is sync, so Promise.all just queues two transactions in order;
      // the second one re-reads inside the transaction and sees the resolved row.
      const [first, second] = await Promise.all([
        Promise.resolve().then(() => applyMergeEventChoice(eventId, "kept")),
        Promise.resolve().then(() => applyMergeEventChoice(eventId, `applied:b`)),
      ]);

      const okCount = [first, second].filter((r) => r.ok).length;
      const resolvedReason = [first, second].find((r) => !r.ok)?.reason;
      expect(okCount).toBe(1);
      expect(resolvedReason).toBe("already_resolved");

      expect(listPendingMergeEvents()).toHaveLength(0);
    });
  });

  describe("pruneResolvedMergeEvents", () => {
    test("removes resolved events older than retention window, keeps newer", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 50,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);
      const eventId = listPendingMergeEvents()[0]!.id;

      // Resolve the event with a deliberately old resolvedAt (40 days ago).
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      testDbResult.db
        .update(accountMergeEvents)
        .set({ resolvedAt: fortyDaysAgo, resolvedChoice: "kept" })
        .where(eq(accountMergeEvents.id, eventId))
        .run();

      // Prune with 30-day retention — should remove this stale row.
      const pruned = pruneResolvedMergeEvents(30);
      expect(pruned).toBe(1);
      expect(
        testDbResult.db
          .select({ id: accountMergeEvents.id })
          .from(accountMergeEvents)
          .all(),
      ).toHaveLength(0);
    });

    test("never prunes pending (unresolved) events, no matter how old", () => {
      insertRow({
        id: "a",
        isActive: true,
        session5hBudget: 5,
        createdAt: new Date(Date.now() - 5_000),
      });
      insertRow({
        id: "b",
        session5hBudget: 50,
        createdAt: new Date(Date.now() - 30_000),
      });
      mergeAccountsBySubject(SUBJECT);

      // Backdate mergedAt by 1 year; resolvedAt stays null (still pending).
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      testDbResult.db.update(accountMergeEvents).set({ mergedAt: yearAgo }).run();

      const pruned = pruneResolvedMergeEvents(30);
      expect(pruned).toBe(0);
      expect(listPendingMergeEvents()).toHaveLength(1);
    });
  });
});
