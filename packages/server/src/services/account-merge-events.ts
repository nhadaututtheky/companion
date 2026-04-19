/**
 * Account Merge Events — Phase 3 of multi-account dedup.
 *
 * `mergeAccountsBySubject` (credential-manager) records an event whenever it
 * silently picked a winning budget cap from rows that had different non-null
 * caps. This service exposes those pending events so the web Accounts tab can
 * render a banner: "We folded N duplicates and kept the highest cap. Want to
 * keep one of the originals instead?"
 *
 * - listPendingMergeEvents() — for the banner query
 * - applyMergeEventChoice()  — user picks "keep" or "applied:<accountId>"
 * - dismissMergeEvent()      — user accepts the auto-pick (no-op write)
 *
 * All three mark `resolvedAt` so the event drops out of the pending list.
 * `applyMergeEventChoice` additionally re-applies the picked row's budgets
 * to the survivor.
 */

import { and, eq, isNull, isNotNull, desc, lt } from "drizzle-orm";
import { getDb, getSqlite } from "../db/client.js";
import { accounts, accountMergeEvents } from "../db/schema.js";
import type { AccountMergeBeforeRow } from "../db/schema.js";
import { createLogger } from "../logger.js";

const log = createLogger("account-merge-events");

export interface PendingMergeEvent {
  id: string;
  survivorAccountId: string;
  oauthSubject: string;
  beforeState: AccountMergeBeforeRow[];
  appliedSession5hBudget: number | null;
  appliedWeeklyBudget: number | null;
  appliedMonthlyBudget: number | null;
  mergedAt: Date;
}

/**
 * Resolution choice the user picked. Stored in `resolved_choice` for audit.
 *  - "kept": user accepted the auto-picked max — survivor budgets unchanged
 *  - "applied:<accountId>": user picked a specific row's budgets to apply
 */
export type MergeEventChoice = "kept" | `applied:${string}`;

/** Every unresolved event, newest first. */
export function listPendingMergeEvents(): PendingMergeEvent[] {
  const db = getDb();
  const rows = db
    .select()
    .from(accountMergeEvents)
    .where(isNull(accountMergeEvents.resolvedAt))
    .orderBy(desc(accountMergeEvents.mergedAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    survivorAccountId: r.survivorAccountId,
    oauthSubject: r.oauthSubject,
    beforeState: r.beforeState,
    appliedSession5hBudget: r.appliedSession5hBudget,
    appliedWeeklyBudget: r.appliedWeeklyBudget,
    appliedMonthlyBudget: r.appliedMonthlyBudget,
    mergedAt: r.mergedAt,
  }));
}

/** Mark dismissed without changing budgets. */
export function dismissMergeEvent(eventId: string): { ok: boolean; reason?: string } {
  const db = getDb();
  const sqlite = getSqlite();
  if (!sqlite) return { ok: false, reason: "db_unavailable" };

  const txn = sqlite.transaction((): { ok: boolean; reason?: string } => {
    const event = db
      .select({ id: accountMergeEvents.id, resolvedAt: accountMergeEvents.resolvedAt })
      .from(accountMergeEvents)
      .where(eq(accountMergeEvents.id, eventId))
      .get();
    if (!event) return { ok: false, reason: "not_found" };
    if (event.resolvedAt) return { ok: false, reason: "already_resolved" };

    db.update(accountMergeEvents)
      .set({ resolvedAt: new Date(), resolvedChoice: "kept" })
      .where(eq(accountMergeEvents.id, eventId))
      .run();
    return { ok: true };
  });

  const result = txn();
  if (result.ok) log.info("Merge event dismissed", { eventId });
  return result;
}

/**
 * Apply a different budget choice from the pre-merge snapshot to the survivor.
 * `choice = "kept"` is equivalent to dismiss (audit trail differs).
 * `choice = "applied:<accountId>"` re-applies that pre-merge row's budgets.
 */
export function applyMergeEventChoice(
  eventId: string,
  choice: MergeEventChoice,
): { ok: boolean; reason?: string } {
  const db = getDb();
  const sqlite = getSqlite();
  if (!sqlite) return { ok: false, reason: "db_unavailable" };

  // Wrap the entire read-then-write sequence in one transaction so a crash
  // between budget UPDATE and event resolve cannot leave an applied event
  // pending — re-applying would otherwise double-write the same caps.
  const txn = sqlite.transaction((): { ok: boolean; reason?: string } => {
    const event = db
      .select()
      .from(accountMergeEvents)
      .where(eq(accountMergeEvents.id, eventId))
      .get();
    if (!event) return { ok: false, reason: "not_found" };
    if (event.resolvedAt) return { ok: false, reason: "already_resolved" };

    if (choice === "kept") {
      db.update(accountMergeEvents)
        .set({ resolvedAt: new Date(), resolvedChoice: "kept" })
        .where(eq(accountMergeEvents.id, eventId))
        .run();
      return { ok: true };
    }

    const accountId = choice.slice("applied:".length);
    const picked = event.beforeState.find((r) => r.id === accountId);
    if (!picked) return { ok: false, reason: "choice_not_in_snapshot" };

    // Cascade FK on survivor_account_id deletes events when the account is
    // removed, so reaching this branch with a missing survivor implies the
    // table was modified out-of-band (manual SQL/tests). The SELECT below and
    // the UPDATE happen inside one SQLite transaction, so a concurrent delete
    // cannot interleave between them — if survivor exists here, the UPDATE
    // is guaranteed to hit one row.
    const survivor = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, event.survivorAccountId))
      .get();
    if (!survivor) return { ok: false, reason: "survivor_missing" };

    db.update(accounts)
      .set({
        session5hBudget: picked.session5hBudget,
        weeklyBudget: picked.weeklyBudget,
        monthlyBudget: picked.monthlyBudget,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, event.survivorAccountId))
      .run();

    db.update(accountMergeEvents)
      .set({ resolvedAt: new Date(), resolvedChoice: choice })
      .where(eq(accountMergeEvents.id, eventId))
      .run();
    return { ok: true };
  });

  const result = txn();
  if (result.ok) {
    log.info("Merge event resolved", {
      eventId,
      choice: choice === "kept" ? "kept" : "applied",
    });
  }
  return result;
}

/**
 * Delete resolved events older than `retentionDays`. Pending events are never
 * pruned — the user must resolve them. Called once at server startup; the
 * volume per user is small enough that periodic timers are overkill.
 */
export function pruneResolvedMergeEvents(retentionDays = 30): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  // Count first (drizzle's .run() returns void for bun-sqlite), then delete.
  // Both inside the same logical statement-set is fine — single writer per
  // SQLite connection means no other delete can interleave.
  const stale = db
    .select({ id: accountMergeEvents.id })
    .from(accountMergeEvents)
    .where(
      and(isNotNull(accountMergeEvents.resolvedAt), lt(accountMergeEvents.resolvedAt, cutoff)),
    )
    .all();
  if (stale.length === 0) return 0;
  db.delete(accountMergeEvents)
    .where(
      and(isNotNull(accountMergeEvents.resolvedAt), lt(accountMergeEvents.resolvedAt, cutoff)),
    )
    .run();
  log.info("Pruned resolved merge events", { count: stale.length, retentionDays });
  return stale.length;
}
