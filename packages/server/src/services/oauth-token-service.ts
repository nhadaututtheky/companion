/**
 * OAuth Token Service — single entry point for obtaining a fresh access
 * token for any stored Anthropic account.
 *
 * Invariants (candidate INV-16):
 *   1. Every caller that needs an access token MUST go through
 *      `getAccessToken(accountId)`. Nothing else is allowed to decrypt the
 *      credential blob outside this file + credential-manager.ts (the
 *      Phase 1 grep gate enforces this).
 *   2. Concurrent `getAccessToken` calls for the SAME account must share
 *      one network refresh (per-account mutex).
 *   3. A 400 `invalid_refresh_token` response marks the account as
 *      `status='expired'` AND emits `account:expired` — the rotation
 *      scheduler drops it from the pool until the user re-authenticates.
 *
 * Not stored here: the `refresh_token` value itself. This service always
 * reads the latest encrypted blob from SQLite and writes the merged result
 * back in one transaction — `saveAccount()` via credential-watcher is the
 * canonical writer on first-capture.
 */

import { eq } from "drizzle-orm";
import { getDb, getSqlite } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { decrypt, encrypt, isEncryptionEnabled } from "./crypto.js";
import { createLogger } from "../logger.js";
import { eventBus } from "./event-bus.js";
import type { OAuthCredentials } from "./credential-manager.js";

const log = createLogger("oauth-token-service");

// ─── Constants ──────────────────────────────────────────────────────────────

/** Claude Code OAuth client ID (extracted from @anthropic-ai/claude-code v2.1.116 binary). */
export const CLAUDE_CODE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/** Anthropic OAuth token endpoint. */
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";

/** Refresh tokens if they expire within this window. */
const REFRESH_SKEW_MS = 60 * 1_000;

/** Hard timeout for the refresh POST. */
const REFRESH_TIMEOUT_MS = 10_000;

// ─── Per-account refresh mutex ──────────────────────────────────────────────

/**
 * One in-flight refresh promise per account. When five callers hit
 * `getAccessToken(X)` simultaneously and X's token is stale, only one
 * network request fires — the other four await the same promise.
 *
 * Map entries are cleared in a `finally` block so a settled promise never
 * wedges future refreshes.
 */
const inFlightRefreshes = new Map<string, Promise<string | null>>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Return a currently-valid access token for an account, refreshing if
 * the stored token expires within 60s. Returns null on any unrecoverable
 * failure (encryption off, account missing, malformed credentials,
 * expired refresh token, network error — details logged).
 */
export async function getAccessToken(accountId: string): Promise<string | null> {
  if (!isEncryptionEnabled()) {
    log.warn("Cannot read credentials: encryption disabled");
    return null;
  }

  const row = readAccountRow(accountId);
  if (!row) {
    log.debug("getAccessToken: account not found", { accountId });
    return null;
  }

  const creds = safeDecrypt(row.encryptedCredentials, accountId);
  if (!creds) return null;

  // Fast path: token is still fresh enough.
  if (creds.accessToken && creds.expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return creds.accessToken;
  }

  // Slow path: refresh. Per-account mutex prevents stampede.
  return refreshAccessToken(accountId);
}

/**
 * Force a refresh for this account regardless of current expiry. Useful
 * for 401 retry paths when another machine has rotated the refresh token.
 * Per-account mutex still applies.
 */
export async function refreshAccessToken(accountId: string): Promise<string | null> {
  const existing = inFlightRefreshes.get(accountId);
  if (existing) return existing;

  const pending = performRefresh(accountId).finally(() => {
    inFlightRefreshes.delete(accountId);
  });
  inFlightRefreshes.set(accountId, pending);
  return pending;
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Actually hit the OAuth token endpoint + persist the new tokens. Kept
 * separate from {@link refreshAccessToken} so the mutex wrapper stays tiny.
 */
async function performRefresh(accountId: string): Promise<string | null> {
  const row = readAccountRow(accountId);
  if (!row) {
    log.debug("performRefresh: account not found", { accountId });
    return null;
  }

  const creds = safeDecrypt(row.encryptedCredentials, accountId);
  if (!creds) return null;

  if (!creds.refreshToken) {
    log.warn("performRefresh: no refresh_token in stored credentials", { accountId });
    markExpired(accountId, row.label, "missing_refresh_token");
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
    client_id: CLAUDE_CODE_OAUTH_CLIENT_ID,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  const startedAt = Date.now();

  let status = 0;
  let responseJson: RefreshResponse | null = null;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
        "User-Agent": "companion-oauth-token/1.0",
      },
      body: body.toString(),
      signal: ctrl.signal,
      // SSRF defense: the token endpoint must not redirect us elsewhere
      // with the Authorization bearer still attached.
      redirect: "error",
    });
    status = res.status;

    const text = await res.text();
    try {
      responseJson = text ? (JSON.parse(text) as RefreshResponse) : null;
    } catch {
      log.warn("Refresh response was not JSON", { accountId, status });
    }

    if (res.ok && responseJson?.access_token) {
      persistNewTokens(accountId, creds, responseJson);
      log.info("OAuth token refreshed", {
        accountId,
        latencyMs: Date.now() - startedAt,
        hasNewRefresh: !!responseJson.refresh_token,
      });
      return responseJson.access_token;
    }

    // Anthropic returns 400 with `error: "invalid_grant"` or similar for
    // revoked/expired refresh tokens. Anything in the 4xx range that isn't
    // a 429 likely means the token is permanently bad — mark expired.
    const errorCode = responseJson?.error ?? "";
    const isExpired =
      status === 400 &&
      /invalid_?(grant|refresh_?token)|expired/i.test(errorCode);

    if (isExpired) {
      markExpired(accountId, row.label, errorCode || "invalid_refresh_token");
    } else {
      log.warn("OAuth token refresh failed", {
        accountId,
        status,
        latencyMs: Date.now() - startedAt,
        // Error code is from Anthropic's response shape — safe to log.
        errorCode: errorCode || null,
      });
    }
    return null;
  } catch (err) {
    log.warn("OAuth token refresh network error", {
      accountId,
      latencyMs: Date.now() - startedAt,
      // Error strings from fetch may include URL/host — keep but never
      // include the access or refresh token.
      error: String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

interface AccountCredentialRow {
  id: string;
  label: string;
  encryptedCredentials: string;
}

function readAccountRow(accountId: string): AccountCredentialRow | null {
  const db = getDb();
  const row = db
    .select({
      id: accounts.id,
      label: accounts.label,
      encryptedCredentials: accounts.encryptedCredentials,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  return row ?? null;
}

function safeDecrypt(blob: string, accountId: string): OAuthCredentials | null {
  try {
    return JSON.parse(decrypt(blob)) as OAuthCredentials;
  } catch (err) {
    log.warn("Failed to decrypt credentials", { accountId, error: String(err) });
    return null;
  }
}

/**
 * Merge refresh response into the stored credential blob, then re-encrypt
 * and write in one UPDATE. We decrypt again inside the txn to avoid a
 * TOCTOU window where another refresh could commit between the outer
 * decrypt and this write.
 */
function persistNewTokens(
  accountId: string,
  _prevCreds: OAuthCredentials,
  response: RefreshResponse,
): void {
  const sqlite = getSqlite();
  const db = getDb();

  sqlite!.transaction(() => {
    const row = db
      .select({ encryptedCredentials: accounts.encryptedCredentials })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get();
    if (!row) return;

    const current = safeDecrypt(row.encryptedCredentials, accountId);
    if (!current) return;

    const next: OAuthCredentials = {
      ...current,
      // Caller only invokes this after validating response.access_token is
      // a non-empty string — narrow the optional away here.
      accessToken: response.access_token ?? current.accessToken,
      // Anthropic MAY rotate the refresh token on each refresh (cross-machine
      // usage). Keep the old one only if the response omits the field.
      refreshToken: response.refresh_token ?? current.refreshToken,
      expiresAt:
        typeof response.expires_in === "number"
          ? Date.now() + response.expires_in * 1_000
          : current.expiresAt,
    };

    db.update(accounts)
      .set({
        encryptedCredentials: encrypt(JSON.stringify(next)),
        // Refresh clears `expired` status — the next findNextReady round
        // should consider this account again.
        status: "ready",
        statusUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId))
      .run();
  })();
}

function markExpired(accountId: string, label: string, reason: string): void {
  const db = getDb();
  db.update(accounts)
    .set({ status: "expired", statusUntil: null, updatedAt: new Date() })
    .where(eq(accounts.id, accountId))
    .run();
  log.warn("Account marked expired", { accountId, reason });
  try {
    eventBus.emit("account:expired", { accountId, label, reason });
  } catch (err) {
    log.warn("Failed to emit account:expired event", { accountId, error: String(err) });
  }
}

// ─── Response shape ─────────────────────────────────────────────────────────

/** Shape of the POST /v1/oauth/token response. Fields are validated before use. */
interface RefreshResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// ─── Test-only helpers ──────────────────────────────────────────────────────

/** @internal Clear the refresh mutex. Used by tests to reset between cases. */
export function __clearInFlightRefreshes(): void {
  inFlightRefreshes.clear();
}
