/**
 * Credential Manager — Stores and retrieves encrypted OAuth credentials
 * for multi-account management. Uses AES-256-GCM via crypto.ts.
 */

import { createHash, randomUUID } from "node:crypto";
import { eq, and, ne, sql, inArray, notInArray } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts, accountMergeEvents, sessions } from "../db/schema.js";
import type { AccountMergeBeforeRow } from "../db/schema.js";
import { encrypt, decrypt, isEncryptionEnabled } from "./crypto.js";
import { getSqlite } from "../db/client.js";
import { createLogger } from "../logger.js";
import {
  TERMINAL_SESSION_STATUSES,
  QUOTA_STALE_AFTER_MS,
  DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
  ACCOUNT_SWITCH_THRESHOLD_KEY,
  maxQuotaUtil,
} from "@companion/shared";
import type { AccountQuota } from "@companion/shared";
import { rowToAccountQuota, refreshStaleQuotas } from "./usage-fetcher.js";
import { getSettingNumber } from "./settings-helpers.js";

const log = createLogger("credential-manager");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

export interface AccountInfo {
  id: string;
  label: string;
  fingerprint: string;
  identity: string | null;
  /** Canonical Anthropic account.uuid from /api/oauth/profile (Phase 2 dedup key). */
  oauthSubject: string | null;
  email: string | null;
  displayName: string | null;
  organizationName: string | null;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  isActive: boolean;
  status: string;
  statusUntil: Date | null;
  totalCostUsd: number;
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
  skipInRotation: boolean;
  lastUsedAt: Date | null;
  /** Anthropic-reported quota windows, or null when never fetched. Phase 2. */
  quota: AccountQuota | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountBudgets {
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Volatile fingerprint from the access token: sha256(token)[:16].
 * Kept for backward compatibility — accessToken rotates ~hourly on OAuth refresh,
 * so this is NOT reliable for dedup. Use {@link computeIdentity} instead.
 */
function fingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}

/**
 * Stable identity from the refresh token: sha256(token)[:16].
 * Refresh tokens only rotate on re-authorization, so this uniquely identifies
 * one logged-in Claude account across access-token refreshes.
 */
function computeIdentity(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex").slice(0, 16);
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Save or update an account. Upserts by identity (stable sha256(refreshToken)),
 * falling back to fingerprint for legacy rows that pre-date the identity column.
 * Returns `{ id, created }` — `created: true` when a fresh row was inserted,
 * `false` when an existing row was updated. Callers (e.g. credential-watcher)
 * use `created` to decide whether to force a fresh profile fetch instead of
 * comparing list snapshots, which is racy under concurrent captures.
 */
export function saveAccount(
  label: string,
  credentials: OAuthCredentials,
): { id: string; created: boolean } {
  if (!isEncryptionEnabled()) {
    throw new Error(
      "Cannot save account: COMPANION_ENCRYPTION_KEY not set. " +
        "Set this environment variable to enable credential encryption.",
    );
  }

  const db = getDb();
  const sqlite = getSqlite();
  const fp = fingerprint(credentials.accessToken);
  const identity = computeIdentity(credentials.refreshToken);
  const encryptedJson = encrypt(JSON.stringify(credentials));

  // Atomic upsert via SQLite transaction (prevents TOCTOU race on identity/fingerprint)
  const txn = sqlite!.transaction(() => {
    // Prefer stable identity; fall back to legacy fingerprint match so existing
    // rows get merged in-place instead of duplicated on first write after upgrade.
    const existing =
      db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identity, identity)).get() ??
      db.select({ id: accounts.id }).from(accounts).where(eq(accounts.fingerprint, fp)).get();

    if (existing) {
      db.update(accounts)
        .set({
          label,
          fingerprint: fp,
          identity,
          encryptedCredentials: encryptedJson,
          subscriptionType: credentials.subscriptionType ?? null,
          rateLimitTier: credentials.rateLimitTier ?? null,
          status: "ready",
          statusUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existing.id))
        .run();

      log.info("Account updated", { id: existing.id, label, identity });
      return { id: existing.id, created: false };
    }

    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        label,
        fingerprint: fp,
        identity,
        encryptedCredentials: encryptedJson,
        subscriptionType: credentials.subscriptionType ?? null,
        rateLimitTier: credentials.rateLimitTier ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    log.info("Account saved", { id, label, identity });
    return { id, created: true };
  });

  return txn();
}

/**
 * Backfill missing `identity` values + collapse ghost duplicates created by the
 * old fingerprint-based dedup (see 0040_account_identity.sql).
 *
 * For each group of rows sharing one identity, picks a survivor (active > most
 * recently used > oldest createdAt), reassigns that group's sessions to the
 * survivor, sums costs, and deletes the rest. Idempotent — safe to run on every
 * server startup.
 *
 * Returns counts for logging/observability.
 */
export function dedupeAccountsByIdentity(): {
  scanned: number;
  backfilled: number;
  merged: number;
} {
  if (!isEncryptionEnabled()) return { scanned: 0, backfilled: 0, merged: 0 };

  const db = getDb();
  const sqlite = getSqlite();
  let backfilled = 0;
  let merged = 0;

  const txn = sqlite!.transaction(() => {
    const rows = db.select().from(accounts).all();

    // Step 1: backfill identity for rows that don't have one.
    for (const row of rows) {
      if (row.identity) continue;
      try {
        const creds = JSON.parse(decrypt(row.encryptedCredentials)) as OAuthCredentials;
        if (!creds.refreshToken) continue;
        const identity = computeIdentity(creds.refreshToken);
        db.update(accounts)
          .set({ identity, updatedAt: new Date() })
          .where(eq(accounts.id, row.id))
          .run();
        row.identity = identity;
        backfilled++;
      } catch (err) {
        log.warn("Failed to backfill identity for account", { id: row.id, error: String(err) });
      }
    }

    // Step 2: group by identity and merge duplicates.
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.identity) continue;
      const existing = groups.get(row.identity) ?? [];
      existing.push(row);
      groups.set(row.identity, existing);
    }

    // A session is "live" if its status is anything other than these terminal states.
    const terminalStatuses = TERMINAL_SESSION_STATUSES;

    for (const [identity, group] of groups) {
      if (group.length < 2) continue;

      // Live-session guard: if any row in the group owns a non-terminal session,
      // it becomes the unconditional survivor — deleting it would orphan a
      // running cli-launcher subprocess on its next DB lookup.
      const groupIds = group.map((r) => r.id);
      const liveRows = db
        .select({ accountId: sessions.accountId })
        .from(sessions)
        .where(
          and(inArray(sessions.accountId, groupIds), notInArray(sessions.status, terminalStatuses)),
        )
        .all();
      const liveAccountIds = new Set(liveRows.map((r) => r.accountId).filter(Boolean) as string[]);

      if (liveAccountIds.size > 1) {
        // More than one row in the group has live sessions — can't safely merge.
        // Leave the group alone until those sessions end.
        log.warn("Skipping dedup for group with multiple live sessions", {
          identity,
          liveAccountIds: [...liveAccountIds],
        });
        continue;
      }

      // Survivor priority: live session → isActive → latest lastUsedAt → oldest createdAt.
      const sorted = [...group].sort((a, b) => {
        const aLive = liveAccountIds.has(a.id);
        const bLive = liveAccountIds.has(b.id);
        if (aLive !== bLive) return aLive ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const aUsed = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
        const bUsed = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
        if (aUsed !== bUsed) return bUsed - aUsed;
        const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
        const bCreated = b.createdAt ? b.createdAt.getTime() : 0;
        return aCreated - bCreated;
      });
      const survivor = sorted[0]!;
      const duplicates = sorted.slice(1);
      const duplicateIds = duplicates.map((d) => d.id);

      // Sum costs + keep the freshest lastUsedAt across the whole group.
      const totalCost = group.reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0);
      const latestUsed = group.reduce<Date | null>((acc, r) => {
        if (!r.lastUsedAt) return acc;
        if (!acc || r.lastUsedAt.getTime() > acc.getTime()) return r.lastUsedAt;
        return acc;
      }, null);

      // Reassign sessions from duplicates → survivor (history stays attached).
      db.update(sessions)
        .set({ accountId: survivor.id })
        .where(inArray(sessions.accountId, duplicateIds))
        .run();

      // Promote survivor to active if any row in the group was active —
      // otherwise we'd nuke the active row and leave nothing flagged.
      const groupHadActive = group.some((r) => r.isActive);

      db.update(accounts)
        .set({
          totalCostUsd: totalCost,
          lastUsedAt: latestUsed,
          isActive: groupHadActive ? true : survivor.isActive,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, survivor.id))
        .run();

      db.delete(accounts).where(inArray(accounts.id, duplicateIds)).run();
      merged += duplicates.length;

      log.info("Merged duplicate accounts", {
        identity,
        survivor: survivor.id,
        removed: duplicateIds,
      });
    }

    return { scanned: rows.length, backfilled, merged };
  });

  return txn();
}

// ─── Phase 2: Dedup by canonical Anthropic identity (oauth_subject) ────────

/**
 * Outcome of a per-subject merge attempt.
 * - `merged`: number of duplicate rows deleted (survivor kept)
 * - `skipped`: true when the live-session guard blocked the merge
 */
export interface SubjectMergeResult {
  merged: number;
  skipped: boolean;
}

/**
 * Merge all account rows that share one canonical `oauth_subject`. Same logic
 * as {@link dedupeAccountsByIdentity} but keyed by the Anthropic-issued
 * `account.uuid` instead of the refresh-token hash. This is the only dedup
 * signal that survives Anthropic rotating the refresh token on each
 * `claude login`.
 *
 * Survivor priority: live session > isActive > most-recent lastUsedAt > oldest.
 * Live-session guard: if 2+ rows in the group own non-terminal sessions, the
 * merge is skipped entirely (would orphan a running cli-launcher subprocess).
 *
 * Budgets: keeps the **maximum** non-null value across the group for each
 * budget field — losing a tighter cap is the safer side of "wrong" because
 * the alternative is silently raising it to null. Phase 3 may surface a
 * confirm dialog when budgets conflict.
 */
export function mergeAccountsBySubject(subject: string): SubjectMergeResult {
  if (!subject) return { merged: 0, skipped: false };

  const db = getDb();
  const sqlite = getSqlite();

  const txn = sqlite!.transaction(() => {
    const rows = db
      .select()
      .from(accounts)
      .where(eq(accounts.oauthSubject, subject))
      .all();
    if (rows.length < 2) return { merged: 0, skipped: false };

    const terminalStatuses = TERMINAL_SESSION_STATUSES;
    const groupIds = rows.map((r) => r.id);
    const liveRows = db
      .select({ accountId: sessions.accountId })
      .from(sessions)
      .where(
        and(inArray(sessions.accountId, groupIds), notInArray(sessions.status, terminalStatuses)),
      )
      .all();
    const liveAccountIds = new Set(liveRows.map((r) => r.accountId).filter(Boolean) as string[]);

    if (liveAccountIds.size > 1) {
      log.warn("Skipping subject merge — multiple live sessions", {
        subject,
        liveAccountIds: [...liveAccountIds],
      });
      return { merged: 0, skipped: true };
    }

    const sorted = [...rows].sort((a, b) => {
      const aLive = liveAccountIds.has(a.id);
      const bLive = liveAccountIds.has(b.id);
      if (aLive !== bLive) return aLive ? -1 : 1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aUsed = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
      const bUsed = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
      const bCreated = b.createdAt ? b.createdAt.getTime() : 0;
      return aCreated - bCreated;
    });
    const survivor = sorted[0]!;
    const duplicates = sorted.slice(1);
    const duplicateIds = duplicates.map((d) => d.id);

    const totalCost = rows.reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0);
    const latestUsed = rows.reduce<Date | null>((acc, r) => {
      if (!r.lastUsedAt) return acc;
      if (!acc || r.lastUsedAt.getTime() > acc.getTime()) return r.lastUsedAt;
      return acc;
    }, null);

    const maxBudget = (key: "session5hBudget" | "weeklyBudget" | "monthlyBudget"): number | null =>
      rows.reduce<number | null>((max, r) => {
        const v = r[key];
        if (v == null) return max;
        return max == null || v > max ? v : max;
      }, null);

    // Phase 3: budget conflict = ANY budget field has 2+ distinct non-null
    // values across the merge group. Different non-null caps means the user
    // had set incompatible limits per-row, and we silently picked the max —
    // they need to be told and given the option to apply something tighter.
    const budgetKeys = ["session5hBudget", "weeklyBudget", "monthlyBudget"] as const;
    const hasBudgetConflict = budgetKeys.some((key) => {
      const distinct = new Set<number>();
      for (const r of rows) {
        const v = r[key];
        if (v != null) distinct.add(v);
      }
      return distinct.size >= 2;
    });
    const beforeState: AccountMergeBeforeRow[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      session5hBudget: r.session5hBudget,
      weeklyBudget: r.weeklyBudget,
      monthlyBudget: r.monthlyBudget,
      totalCostUsd: r.totalCostUsd ?? 0,
    }));

    db.update(sessions)
      .set({ accountId: survivor.id })
      .where(inArray(sessions.accountId, duplicateIds))
      .run();

    // If ANY row in the group was the active account, the survivor inherits
    // that flag — otherwise dropping a survivor that wasn't isActive when an
    // isActive duplicate is deleted leaves the system with NO active account.
    const groupHadActive = rows.some((r) => r.isActive);

    db.update(accounts)
      .set({
        totalCostUsd: totalCost,
        lastUsedAt: latestUsed,
        session5hBudget: maxBudget("session5hBudget"),
        weeklyBudget: maxBudget("weeklyBudget"),
        monthlyBudget: maxBudget("monthlyBudget"),
        // Preserve `skipInRotation = true` if ANY row had it set (safer default).
        skipInRotation: rows.some((r) => r.skipInRotation),
        isActive: groupHadActive ? true : survivor.isActive,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, survivor.id))
      .run();

    db.delete(accounts).where(inArray(accounts.id, duplicateIds)).run();

    // Surface a UI banner so the user can review (and optionally tighten)
    // the auto-picked max budget. Recorded INSIDE the transaction so a crash
    // mid-merge leaves the table consistent with the deletes.
    if (hasBudgetConflict) {
      db.insert(accountMergeEvents)
        .values({
          id: randomUUID(),
          survivorAccountId: survivor.id,
          oauthSubject: subject,
          beforeState,
          appliedSession5hBudget: maxBudget("session5hBudget"),
          appliedWeeklyBudget: maxBudget("weeklyBudget"),
          appliedMonthlyBudget: maxBudget("monthlyBudget"),
          mergedAt: new Date(),
        })
        .run();
    }

    log.info("Merged duplicate accounts by subject", {
      subject,
      survivor: survivor.id,
      removed: duplicateIds,
      budgetConflict: hasBudgetConflict,
    });
    return { merged: duplicateIds.length, skipped: false };
  });

  return txn();
}

/**
 * Atomic write of OAuth profile fields onto an account row + merge by subject,
 * inside a single SQLite transaction. Closes the TOCTOU window where two
 * concurrent profile fetches could each call `mergeAccountsBySubject` after
 * the other had written the same `oauth_subject` — the in-flight transactions
 * would otherwise see overlapping group snapshots.
 *
 * Returns the merge result (or `{ merged: 0, skipped: false }` if the subject
 * still has only one row after the write). Caller is responsible for the
 * profile fetch + decryption — this helper only touches the DB.
 */
export function applyOAuthProfile(
  accountId: string,
  patch: {
    oauthSubject: string;
    email: string | null;
    displayName: string | null;
    organizationUuid: string | null;
    organizationName: string | null;
  },
): SubjectMergeResult {
  const sqlite = getSqlite();
  const db = getDb();

  const txn = sqlite!.transaction(() => {
    const now = new Date();
    db.update(accounts)
      .set({
        oauthSubject: patch.oauthSubject,
        email: patch.email,
        displayName: patch.displayName,
        organizationUuid: patch.organizationUuid,
        organizationName: patch.organizationName,
        profileFetchedAt: now,
        updatedAt: now,
      })
      .where(eq(accounts.id, accountId))
      .run();

    return mergeAccountsBySubject(patch.oauthSubject);
  });

  return txn();
}

/**
 * Iterate every distinct non-null `oauth_subject` and merge duplicate groups.
 * Idempotent — safe to run on every server startup. Returns counts for logging.
 */
export function dedupeAccountsBySubject(): {
  scanned: number;
  merged: number;
  skipped: number;
} {
  const db = getDb();
  const rows = db
    .select({ subject: accounts.oauthSubject })
    .from(accounts)
    .all();
  const subjects = [...new Set(rows.map((r) => r.subject).filter((s): s is string => !!s))];

  let merged = 0;
  let skipped = 0;
  for (const subject of subjects) {
    const result = mergeAccountsBySubject(subject);
    merged += result.merged;
    if (result.skipped) skipped++;
  }
  return { scanned: subjects.length, merged, skipped };
}

/** Check whether an account exists by id. */
export function accountExists(id: string): boolean {
  const db = getDb();
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
  return !!row;
}

type AccountRow = typeof accounts.$inferSelect;

function toAccountInfo(row: AccountRow): AccountInfo {
  return {
    id: row.id,
    label: row.label,
    fingerprint: row.fingerprint,
    identity: row.identity ?? null,
    oauthSubject: row.oauthSubject ?? null,
    email: row.email ?? null,
    displayName: row.displayName ?? null,
    organizationName: row.organizationName ?? null,
    subscriptionType: row.subscriptionType,
    rateLimitTier: row.rateLimitTier,
    isActive: row.isActive,
    status: row.status,
    statusUntil: row.statusUntil,
    totalCostUsd: row.totalCostUsd,
    session5hBudget: row.session5hBudget ?? null,
    weeklyBudget: row.weeklyBudget ?? null,
    monthlyBudget: row.monthlyBudget ?? null,
    skipInRotation: row.skipInRotation ?? false,
    lastUsedAt: row.lastUsedAt,
    quota: rowToAccountQuota(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** List all accounts (without decrypted tokens). */
export function listAccounts(): AccountInfo[] {
  const db = getDb();
  return db.select().from(accounts).all().map(toAccountInfo);
}

/** Get the currently active account (the one used for new sessions). */
export function getActiveAccount(): AccountInfo | undefined {
  const db = getDb();
  const row = db.select().from(accounts).where(eq(accounts.isActive, true)).get();
  return row ? toAccountInfo(row) : undefined;
}

/**
 * Set one account as active (deactivate all others).
 * Returns true if the account was found and activated.
 */
export function setActiveAccount(id: string): boolean {
  const db = getDb();
  const sqlite = getSqlite();

  // Atomic: deactivate all → activate target (prevents crash leaving no active account)
  const txn = sqlite!.transaction(() => {
    const target = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();

    if (!target) return false;

    // Intentionally no WHERE — deactivate ALL accounts to enforce single-active invariant
    db.update(accounts).set({ isActive: false, updatedAt: new Date() }).run();

    db.update(accounts)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .run();

    log.info("Active account switched", { id });
    return true;
  });

  return txn();
}

/**
 * Delete an account by ID. Returns true if found and deleted.
 * Throws if the account is currently active OR owns a non-terminal session
 * (per INV-x: deletion of an account with a live session orphans the running
 * subprocess on its next DB lookup).
 */
export function deleteAccount(id: string): boolean {
  const db = getDb();

  const existing = db
    .select({ id: accounts.id, isActive: accounts.isActive })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!existing) return false;

  if (existing.isActive) {
    throw new Error("Cannot delete the active account — switch to another account first");
  }

  const liveSession = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(eq(sessions.accountId, id), notInArray(sessions.status, TERMINAL_SESSION_STATUSES)),
    )
    .get();
  if (liveSession) {
    throw new Error(
      "Cannot delete account with a live session — wait for it to finish or stop it first",
    );
  }

  const sqlite = getSqlite();
  const txn = sqlite.transaction(() => {
    // Detach historical sessions so per-session cost data isn't orphaned
    // (sessions.accountId has no FK, so nothing stops a dangling reference otherwise).
    db.update(sessions).set({ accountId: null }).where(eq(sessions.accountId, id)).run();
    db.delete(accounts).where(eq(accounts.id, id)).run();
  });
  txn();
  log.info("Account deleted", { id });
  return true;
}

/** Decrypt and return full OAuth credentials for an account. */
export function getDecryptedCredentials(id: string): OAuthCredentials | undefined {
  const db = getDb();

  const row = db
    .select({ encryptedCredentials: accounts.encryptedCredentials })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!row) return undefined;

  try {
    const json = decrypt(row.encryptedCredentials);
    return JSON.parse(json) as OAuthCredentials;
  } catch (err) {
    log.error("Failed to decrypt credentials", { id, error: String(err) });
    return undefined;
  }
}

/**
 * Update account status (e.g., mark as rate_limited).
 * statusUntil is optional — when the status should auto-clear.
 */
export function updateAccountStatus(
  id: string,
  status: "ready" | "rate_limited" | "expired" | "error",
  statusUntil?: Date,
): boolean {
  const db = getDb();

  const existing = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();

  if (!existing) return false;

  db.update(accounts)
    .set({
      status,
      statusUntil: statusUntil ?? null,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))
    .run();

  log.info("Account status updated", { id, status });
  return true;
}

/**
 * Switch to a different account: set as active in DB + write credentials to file.
 * Emits `account:switched` event. Returns false if account not found.
 */
export async function switchAccount(id: string): Promise<boolean> {
  const credentials = getDecryptedCredentials(id);
  if (!credentials) return false;

  // Get label before switching (for event)
  const allAccounts = listAccounts();
  const targetAccount = allAccounts.find((a) => a.id === id);
  if (!targetAccount) return false;

  // Write credentials file FIRST — if this fails, DB stays consistent
  const { writeCredentialsFile } = await import("./credential-watcher.js");
  await writeCredentialsFile(credentials);

  // Then update DB state
  const ok = setActiveAccount(id);
  if (!ok) return false;

  const { eventBus } = await import("./event-bus.js");
  eventBus.emit("account:switched", {
    accountId: id,
    label: targetAccount.label,
  });

  log.info("Account switched", { id });
  return true;
}

/** Update the label (display name) of an account. */
export function renameAccount(id: string, label: string): boolean {
  const db = getDb();

  const existing = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();

  if (!existing) return false;

  db.update(accounts).set({ label, updatedAt: new Date() }).where(eq(accounts.id, id)).run();

  return true;
}

// ─── Rate Limit + Auto-Switch ──────────────────────────────────────────────

/** Default cooldown durations by rate limit tier (ms). */
const COOLDOWN_BY_TIER: Record<string, number> = {
  default_claude_max_20x: 60_000,
  default_claude_pro_5x: 300_000,
};
const DEFAULT_COOLDOWN_MS = 600_000; // 10 minutes

/**
 * Mark an account as rate-limited with an appropriate cooldown based on its tier.
 * Returns the cooldown duration in ms.
 */
export function markRateLimited(id: string): number {
  const db = getDb();
  const row = db
    .select({ rateLimitTier: accounts.rateLimitTier })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!row) return 0;

  const cooldownMs = COOLDOWN_BY_TIER[row.rateLimitTier ?? ""] ?? DEFAULT_COOLDOWN_MS;
  const statusUntil = new Date(Date.now() + cooldownMs);

  updateAccountStatus(id, "rate_limited", statusUntil);
  log.info("Account marked rate-limited", { id, cooldownMs, until: statusUntil.toISOString() });
  return cooldownMs;
}

/**
 * Find the next account with status = "ready" (excluding a given ID).
 * Round-robin: oldest lastUsedAt first (least recently used). Ties broken by lowest totalCostUsd.
 * Accounts flagged skipInRotation are excluded. Returns undefined if none available.
 *
 * `includeSkipped` bypasses the skip flag — used by manual "switch to next" when the
 * caller has already vetted the candidate pool (e.g. exposed by a UI button).
 */
export function findNextReady(excludeId?: string, includeSkipped = false): AccountInfo | undefined {
  const sorted = readSortedReadyRows(excludeId, includeSkipped);
  const row = sorted[0];
  return row ? toAccountInfo(row) : undefined;
}

/**
 * Phase 2 — async picker with JIT refresh + Anthropic-quota gate.
 *
 * Pipeline:
 *   1. Refresh every `ready` row whose `quota_fetched_at` is older than
 *      `QUOTA_STALE_AFTER_MS` (or null). Bounded latency (2s × concurrency 3).
 *   2. Re-read rows, sort by LRU+cost (same as sync), then:
 *      - PREFER rows with `maxUtil < switchThreshold`
 *      - If ALL eligible rows are over threshold → pick the LEAST-over-limit
 *        (`min(maxUtil)`), so the reactive path still has a fighting chance.
 *      - Rows with `quota == null` OR stale `fetched_at` treat `maxUtil=0`
 *        (don't block on missing data — reactive regex path is our safety net).
 *
 * Callers that can afford latency (session start, reactive auto-switch,
 * manual switch-next) should use this. Callers that can't (sync code paths,
 * tests) can stay on the sync variant — the reactive regex path is still
 * our safety net there.
 */
export async function findNextReadyAsync(
  excludeId?: string,
  includeSkipped = false,
): Promise<AccountInfo | undefined> {
  // JIT refresh: only touches stale `ready` rows, concurrency-capped. The
  // TTL guard inside usage-fetcher makes this a near-no-op when quotas were
  // touched recently.
  try {
    await refreshStaleQuotas();
  } catch (err) {
    log.warn("refreshStaleQuotas failed before quota gate — continuing with stale data", {
      error: String(err),
    });
  }

  const sorted = readSortedReadyRows(excludeId, includeSkipped);
  if (sorted.length === 0) return undefined;

  const switchThreshold = getSettingNumber(
    ACCOUNT_SWITCH_THRESHOLD_KEY,
    DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
  );
  const staleCutoff = Date.now() - QUOTA_STALE_AFTER_MS;

  // Compute one maxUtil per row. Null quota or stale → 0 so the gate never
  // excludes a row we don't have data for; the reactive path will still catch
  // a real rate-limit if this guess is wrong.
  type Scored = { row: AccountRow; maxUtil: number; hasFreshQuota: boolean };
  const scored: Scored[] = sorted.map((row) => {
    const quota = rowToAccountQuota(row);
    const fetchedAtMs = quota?.fetchedAt ?? 0;
    const hasFreshQuota = !!quota && fetchedAtMs > staleCutoff;
    const util = hasFreshQuota ? (maxQuotaUtil(quota) ?? 0) : 0;
    return { row, maxUtil: util, hasFreshQuota };
  });

  const underThreshold = scored.filter((s) => s.maxUtil < switchThreshold);
  if (underThreshold.length > 0) {
    const winner = underThreshold[0]!; // sorted upstream by LRU+cost
    return toAccountInfo(winner.row);
  }

  // Deadlock fallback: every eligible account is at/over the switch
  // threshold. Pick the least-over-limit so the session can still try; if
  // it rate-limits we fall back to the reactive auto-switch + cooldown.
  log.warn("All eligible accounts over switch threshold — picking least-over-limit", {
    switchThreshold,
    count: scored.length,
  });
  const fallback = [...scored].sort((a, b) => a.maxUtil - b.maxUtil)[0]!;
  return toAccountInfo(fallback.row);
}

/** Shared sort used by both sync + async pickers. Purely DB reads, no I/O. */
function readSortedReadyRows(excludeId: string | undefined, includeSkipped: boolean): AccountRow[] {
  const db = getDb();
  const rows = excludeId
    ? db
        .select()
        .from(accounts)
        .where(and(eq(accounts.status, "ready"), ne(accounts.id, excludeId)))
        .all()
    : db.select().from(accounts).where(eq(accounts.status, "ready")).all();

  const eligible = includeSkipped ? rows : rows.filter((r) => !r.skipInRotation);
  if (eligible.length === 0) return [];

  // Tiebreaker cost comes from the live sessions table, not the denormalized
  // accounts.totalCostUsd column which can drift (missed cost events, resets).
  const eligibleIds = eligible.map((r) => r.id);
  const liveCost = new Map<string, number>();
  const costRows = db
    .select({
      accountId: sessions.accountId,
      total: sql<number>`COALESCE(SUM(${sessions.totalCostUsd}), 0)`,
    })
    .from(sessions)
    .where(inArray(sessions.accountId, eligibleIds))
    .groupBy(sessions.accountId)
    .all();
  for (const r of costRows) {
    if (r.accountId) liveCost.set(r.accountId, Number(r.total) || 0);
  }

  // Least recently used first (null = never used → oldest). Ties broken by lowest cost.
  return [...eligible].sort((a, b) => {
    const aTime = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
    const bTime = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return (liveCost.get(a.id) ?? 0) - (liveCost.get(b.id) ?? 0);
  });
}

/**
 * Check all rate-limited accounts and reset expired ones to "ready".
 * Called periodically by the cooldown timer.
 */
export function resetExpiredCooldowns(): number {
  const db = getDb();
  const now = new Date();

  const limited = db
    .select({ id: accounts.id, statusUntil: accounts.statusUntil })
    .from(accounts)
    .where(eq(accounts.status, "rate_limited"))
    .all();

  let resetCount = 0;
  for (const row of limited) {
    if (row.statusUntil && row.statusUntil <= now) {
      updateAccountStatus(row.id, "ready");
      log.info("Account cooldown expired, reset to ready", { id: row.id });
      resetCount++;
    }
  }

  return resetCount;
}

/**
 * Add session cost to account's totalCostUsd.
 */
export function addAccountCost(id: string, costUsd: number): void {
  if (costUsd <= 0) return;
  const db = getDb();

  // Use SQL increment to avoid TOCTOU race when multiple sessions end concurrently
  db.update(accounts)
    .set({
      totalCostUsd: sql`${accounts.totalCostUsd} + ${costUsd}`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))
    .run();
}

/**
 * Set custom per-account budget limits. Pass null to clear a limit.
 * Returns true if the account was found and updated.
 */
export function updateAccountBudgets(id: string, budgets: AccountBudgets): boolean {
  const db = getDb();
  const existing = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) return false;

  db.update(accounts)
    .set({
      session5hBudget: budgets.session5hBudget,
      weeklyBudget: budgets.weeklyBudget,
      monthlyBudget: budgets.monthlyBudget,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id))
    .run();
  return true;
}

/**
 * Toggle the skipInRotation flag for an account.
 * Returns true if updated, false if account not found.
 */
export function updateAccountSkipRotation(id: string, skip: boolean): boolean {
  const db = getDb();
  const existing = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) return false;

  db.update(accounts)
    .set({ skipInRotation: skip, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .run();
  return true;
}
