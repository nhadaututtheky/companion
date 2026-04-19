/**
 * Profile Fetcher — Calls Anthropic's OAuth profile endpoint to obtain the
 * canonical user identity (`account.uuid`) plus email + display name.
 *
 * Why: dedup-by-refreshToken (credential-manager.identity) still creates
 * duplicates when Anthropic issues a fresh refresh token on each
 * `claude login`. The only stable per-account identifier is `account.uuid`
 * returned by GET https://api.anthropic.com/api/oauth/profile.
 *
 * This service is best-effort: network errors are logged and swallowed so
 * the credential capture path keeps working offline. Phase 2 will switch
 * saveAccount() to upsert by `oauth_subject` once fields are populated.
 */
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { decrypt, isEncryptionEnabled } from "./crypto.js";
import { createLogger } from "../logger.js";
import { applyOAuthProfile } from "./credential-manager.js";
import type { OAuthCredentials } from "./credential-manager.js";

const log = createLogger("profile-fetcher");

const PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const FETCH_TIMEOUT_MS = 8_000;
/** Don't refresh if last successful fetch is newer than this. */
const REFRESH_TTL_MS = 60 * 60 * 1_000; // 1h
/** RFC-4122 UUID format. Used to defensively reject crafted/garbage profile responses
 *  that could otherwise pollute `oauth_subject` and induce wrong-account merges. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OAuthProfile {
  accountUuid: string;
  email: string | null;
  displayName: string | null;
  organizationUuid: string | null;
  organizationName: string | null;
}

interface ProfileResponse {
  account?: {
    uuid?: string;
    email?: string;
    display_name?: string;
    full_name?: string;
  };
  organization?: {
    uuid?: string;
    name?: string;
  };
}

// ─── Network ────────────────────────────────────────────────────────────────

/**
 * Fetch the OAuth profile for a given access token. Returns null on any
 * failure (network error, non-2xx, malformed body) — never throws.
 */
export async function fetchOAuthProfile(accessToken: string): Promise<OAuthProfile | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "companion-profile-fetcher/1.0",
      },
      signal: ctrl.signal,
      // Defense against SSRF / token-exfil-via-redirect: a compromised or
      // misconfigured upstream must not be able to bounce our Bearer header
      // to a third-party host.
      redirect: "error",
    });

    if (!res.ok) {
      log.warn("Profile fetch returned non-2xx", { status: res.status });
      return null;
    }

    const body = (await res.json()) as ProfileResponse;
    const uuid = body.account?.uuid;
    if (!uuid || !UUID_RE.test(uuid)) {
      // Reject anything that isn't a canonical UUID — protects oauth_subject
      // from garbage / crafted values that could drive wrong-account merges.
      log.warn("Profile response missing or invalid account.uuid");
      return null;
    }

    return {
      accountUuid: uuid,
      email: body.account?.email ?? null,
      displayName: body.account?.display_name ?? body.account?.full_name ?? null,
      organizationUuid: body.organization?.uuid ?? null,
      organizationName: body.organization?.name ?? null,
    };
  } catch (err) {
    log.warn("Profile fetch failed", { error: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Refresh the profile for one account: decrypts its credentials, calls the
 * profile API, and persists the response. No-op if encryption is disabled
 * or the account doesn't exist. Returns the new profile or null on failure.
 *
 * Skips the network call if `profile_fetched_at` is within {@link REFRESH_TTL_MS}.
 * Pass `force: true` to bypass the TTL (e.g. on first capture).
 */
export async function refreshAccountProfile(
  accountId: string,
  opts: { force?: boolean } = {},
): Promise<OAuthProfile | null> {
  if (!isEncryptionEnabled()) return null;

  const db = getDb();
  const row = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!row) {
    log.debug("refreshAccountProfile: account not found", { accountId });
    return null;
  }

  if (!opts.force && row.profileFetchedAt) {
    // Defensive: Drizzle returns Date for `timestamp_ms` columns, but raw SQL
    // inserts (tests, manual tooling, future migrations) can leave a number.
    const fetchedAtMs =
      row.profileFetchedAt instanceof Date
        ? row.profileFetchedAt.getTime()
        : Number(row.profileFetchedAt);
    const age = Date.now() - fetchedAtMs;
    if (age < REFRESH_TTL_MS) {
      log.debug("Skipping profile refresh — within TTL", { accountId, ageMs: age });
      return null;
    }
  }

  // Narrow scope: only the access token crosses the await boundary, never the
  // full credential blob (which carries the long-lived refresh token). Reduces
  // exposure window if a future bug causes this struct to leak into a log or
  // unhandled rejection trace.
  let accessToken: string;
  try {
    const creds = JSON.parse(decrypt(row.encryptedCredentials)) as OAuthCredentials;
    accessToken = creds.accessToken;
  } catch (err) {
    log.warn("Failed to decrypt credentials for profile fetch", {
      accountId,
      error: String(err),
    });
    return null;
  }

  const profile = await fetchOAuthProfile(accessToken);
  if (!profile) return null;

  // Anthropic should never reassign account.uuid for the same row, but flag it
  // so Phase 2 dedup-by-subject can be audited if it ever happens (account
  // transfer, manual DB edit, or upstream bug). Subject UUIDs are PII-adjacent
  // and tie directly to a paying customer — log only the boolean signal, never
  // the actual values.
  const subjectChanged = !!row.oauthSubject && row.oauthSubject !== profile.accountUuid;
  if (subjectChanged) {
    log.warn("oauth_subject changed — possible account transfer", { accountId });
  }

  // Atomic UPDATE + merge — closes the TOCTOU window where two concurrent
  // refreshes for siblings of the same subject could each see only one row in
  // their merge snapshot.
  let mergeResult: { merged: number; skipped: boolean };
  try {
    mergeResult = applyOAuthProfile(accountId, {
      oauthSubject: profile.accountUuid,
      email: profile.email,
      displayName: profile.displayName,
      organizationUuid: profile.organizationUuid,
      organizationName: profile.organizationName,
    });
  } catch (err) {
    log.warn("Atomic profile apply failed", { accountId, error: String(err) });
    return null;
  }

  // Email + oauthSubject omitted from log — both are PII. Only emit booleans.
  log.info("Account profile refreshed", {
    accountId,
    hasEmail: !!profile.email,
    hasOrg: !!profile.organizationUuid,
  });

  if (mergeResult.merged > 0) {
    log.info("Subject merge after profile refresh removed duplicates", {
      accountId,
      merged: mergeResult.merged,
    });
  }

  return profile;
}

/**
 * Fire-and-forget profile refresh — used by hot paths (credential capture)
 * that must not block on network. Errors are logged inside refreshAccountProfile.
 */
export function refreshAccountProfileAsync(accountId: string, opts: { force?: boolean } = {}): void {
  void refreshAccountProfile(accountId, opts).catch((err) => {
    log.warn("refreshAccountProfileAsync unexpected error", {
      accountId,
      error: String(err),
    });
  });
}

// ─── Backfill ───────────────────────────────────────────────────────────────

/** Spacing between API calls during backfill — protects against rate limits. */
const BACKFILL_DELAY_MS = 500;

export interface BackfillResult {
  scanned: number;
  fetched: number;
  failed: number;
}

/**
 * Walk every account row that has no `oauth_subject` yet and refresh its
 * profile. Sequential with a small delay to stay polite to the profile
 * endpoint (no documented rate limit, but bursting N tokens at once on
 * server boot is rude).
 *
 * Each successful refresh implicitly triggers `mergeAccountsBySubject` via
 * the trigger inside {@link refreshAccountProfile}, so a follow-up
 * `dedupeAccountsBySubject()` call is mostly defensive — it picks up any
 * subject groups that were already populated before this backfill ran.
 */
export async function backfillAccountProfiles(): Promise<BackfillResult> {
  if (!isEncryptionEnabled()) return { scanned: 0, fetched: 0, failed: 0 };

  const db = getDb();
  const rows = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(isNull(accounts.oauthSubject))
    .all();

  let fetched = 0;
  let failed = 0;
  for (const row of rows) {
    // force=true so the 1h TTL doesn't suppress the very first fetch.
    const profile = await refreshAccountProfile(row.id, { force: true });
    if (profile) fetched++;
    else failed++;
    if (rows.length > 1) await sleep(BACKFILL_DELAY_MS);
  }

  if (rows.length > 0) {
    log.info("Backfill complete", { scanned: rows.length, fetched, failed });
  }
  return { scanned: rows.length, fetched, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
