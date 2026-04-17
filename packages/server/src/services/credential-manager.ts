/**
 * Credential Manager — Stores and retrieves encrypted OAuth credentials
 * for multi-account management. Uses AES-256-GCM via crypto.ts.
 */

import { createHash, randomUUID } from "node:crypto";
import { eq, and, ne, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { encrypt, decrypt, isEncryptionEnabled } from "./crypto.js";
import { getSqlite } from "../db/client.js";
import { createLogger } from "../logger.js";

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
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountBudgets {
  session5hBudget: number | null;
  weeklyBudget: number | null;
  monthlyBudget: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a fingerprint from an access token: sha256(token)[:16] */
function fingerprint(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Save or update an account. Upserts by fingerprint (dedup on accessToken).
 * Returns the account ID.
 */
export function saveAccount(label: string, credentials: OAuthCredentials): string {
  if (!isEncryptionEnabled()) {
    throw new Error(
      "Cannot save account: COMPANION_ENCRYPTION_KEY not set. " +
        "Set this environment variable to enable credential encryption.",
    );
  }

  const db = getDb();
  const sqlite = getSqlite();
  const fp = fingerprint(credentials.accessToken);
  const encryptedJson = encrypt(JSON.stringify(credentials));

  // Atomic upsert via SQLite transaction (prevents TOCTOU race on fingerprint)
  const txn = sqlite!.transaction(() => {
    const existing = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.fingerprint, fp))
      .get();

    if (existing) {
      db.update(accounts)
        .set({
          label,
          encryptedCredentials: encryptedJson,
          subscriptionType: credentials.subscriptionType ?? null,
          rateLimitTier: credentials.rateLimitTier ?? null,
          status: "ready",
          statusUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, existing.id))
        .run();

      log.info("Account updated", { id: existing.id, label, fingerprint: fp });
      return existing.id;
    }

    const id = randomUUID();
    db.insert(accounts)
      .values({
        id,
        label,
        fingerprint: fp,
        encryptedCredentials: encryptedJson,
        subscriptionType: credentials.subscriptionType ?? null,
        rateLimitTier: credentials.rateLimitTier ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    log.info("Account saved", { id, label, fingerprint: fp });
    return id;
  });

  return txn();
}

/** Check whether an account exists by id. */
export function accountExists(id: string): boolean {
  const db = getDb();
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
  return !!row;
}

/** List all accounts (without decrypted tokens). */
export function listAccounts(): AccountInfo[] {
  const db = getDb();
  const rows = db.select().from(accounts).all();

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    fingerprint: row.fingerprint,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/** Get the currently active account (the one used for new sessions). */
export function getActiveAccount(): AccountInfo | undefined {
  const db = getDb();
  const row = db
    .select()
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .get();

  if (!row) return undefined;

  return {
    id: row.id,
    label: row.label,
    fingerprint: row.fingerprint,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    const target = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();

    if (!target) return false;

    // Intentionally no WHERE — deactivate ALL accounts to enforce single-active invariant
    db.update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .run();

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
 * Throws if trying to delete the currently active account.
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

  db.delete(accounts).where(eq(accounts.id, id)).run();
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

  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

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

  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  if (!existing) return false;

  db.update(accounts)
    .set({ label, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .run();

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
export function findNextReady(
  excludeId?: string,
  includeSkipped = false,
): AccountInfo | undefined {
  const db = getDb();
  const rows = excludeId
    ? db
        .select()
        .from(accounts)
        .where(and(eq(accounts.status, "ready"), ne(accounts.id, excludeId)))
        .all()
    : db.select().from(accounts).where(eq(accounts.status, "ready")).all();

  const eligible = includeSkipped ? rows : rows.filter((r) => !r.skipInRotation);
  if (eligible.length === 0) return undefined;

  // Least recently used first (null = never used → oldest). Ties broken by lowest cost.
  const sorted = eligible.sort((a, b) => {
    const aTime = a.lastUsedAt ? a.lastUsedAt.getTime() : 0;
    const bTime = b.lastUsedAt ? b.lastUsedAt.getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.totalCostUsd - b.totalCostUsd;
  });
  const row = sorted[0]!;

  return {
    id: row.id,
    label: row.label,
    fingerprint: row.fingerprint,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
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
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();
  if (!existing) return false;

  db.update(accounts)
    .set({ skipInRotation: skip, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .run();
  return true;
}
