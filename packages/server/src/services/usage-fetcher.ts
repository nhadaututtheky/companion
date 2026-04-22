/**
 * Usage Fetcher — Calls Anthropic's `/api/oauth/usage` endpoint for one
 * account and persists the reported rate-limit utilization onto the
 * `accounts` row.
 *
 * Reverse-engineered from @anthropic-ai/claude-code v2.1.116 binary. Pro/Max
 * accounts return `five_hour` + `seven_day`; Team/Enterprise return
 * `five_hour` + `seven_day_opus` + `seven_day_sonnet`. All windows are
 * optional — the Zod schema treats everything as nullable so a shape drift
 * on Anthropic's side degrades to "we couldn't parse it" instead of a crash.
 *
 * Privacy: the public endpoint returns only aggregate utilization (no user
 * IDs, no message text). We still log only booleans of "did we parse X",
 * never raw numbers, for consistency with the rest of the credential path.
 *
 * Called from:
 *   - Phase 2: round-robin pre-pick refresh of all `ready` accounts
 *   - Phase 3 (deferred): smart poller
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { createLogger } from "../logger.js";
import { getAccessToken, refreshAccessToken } from "./oauth-token-service.js";
import { QUOTA_REFRESH_TTL_MS, QUOTA_STALE_AFTER_MS } from "@companion/shared";
import type {
  AccountOverageStatus,
  AccountQuota,
  AccountQuotaWindow,
} from "@companion/shared";

const log = createLogger("usage-fetcher");

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const FETCH_TIMEOUT_MS = 5_000;

// ─── Zod schema ─────────────────────────────────────────────────────────────

/**
 * Every field optional because Anthropic may change shape (new tier, removed
 * legacy window). Missing fields fall back to null so callers never see an
 * exception, only `AccountQuota { fiveHour: null, ... }`.
 */
const WindowSchema = z
  .object({
    utilization: z.number().optional(),
    resets_at: z.number().optional(),
  })
  .partial()
  .optional();

const OverageStatusSchema = z
  .enum(["allowed", "allowed_warning", "rejected"])
  .optional();

const UsageResponseSchema = z
  .object({
    five_hour: WindowSchema,
    seven_day: WindowSchema,
    seven_day_opus: WindowSchema,
    seven_day_sonnet: WindowSchema,
    overage: z
      .object({ status: OverageStatusSchema })
      .partial()
      .optional(),
  })
  .partial();

export type UsageResponse = z.infer<typeof UsageResponseSchema>;

// ─── Network ────────────────────────────────────────────────────────────────

/**
 * Fetch the raw usage payload for one access token. Never throws — returns
 * `{ status, parsed }` so callers can distinguish 401 (needs refresh) from
 * other failures (null).
 */
export async function fetchAccountUsage(accessToken: string): Promise<{
  status: number;
  parsed: UsageResponse | null;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "companion-usage-fetcher/1.0",
      },
      signal: ctrl.signal,
      // SSRF defense — see profile-fetcher.ts and oauth-token-service.ts.
      redirect: "error",
    });

    if (!res.ok) {
      log.warn("Usage fetch returned non-2xx", { status: res.status });
      return { status: res.status, parsed: null };
    }

    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      log.warn("Usage response was not valid JSON", { status: res.status });
      return { status: res.status, parsed: null };
    }
    const result = UsageResponseSchema.safeParse(body);
    if (!result.success) {
      log.warn("Usage response failed validation", {
        // Issue paths are safe to log (schema field names). Never log values.
        issues: result.error.issues.map((i) => i.path.join(".")),
      });
      return { status: res.status, parsed: null };
    }
    return { status: res.status, parsed: result.data };
  } catch (err) {
    log.warn("Usage fetch failed", { error: String(err) });
    return { status: 0, parsed: null };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Fetch + persist quota for one account. Respects a {@link QUOTA_REFRESH_TTL_MS}
 * TTL so a burst of `findNextReadyAsync` calls doesn't hammer Anthropic.
 * Returns the merged {@link AccountQuota} on success, null on skip or
 * irrecoverable failure.
 *
 * 401 path: token was rotated on another machine since we last read it.
 * Force a refresh via {@link refreshAccessToken} and retry exactly once.
 *
 * Skipped accounts:
 *   - `status` in {`expired`, `error`} — refresh_token revoked or known bad.
 *   - `skipInRotation = true` — user has opted this row out; also don't
 *      consume their rate-limit budget on a background poll.
 */
export async function refreshAccountUsage(
  accountId: string,
  opts: { force?: boolean } = {},
): Promise<AccountQuota | null> {
  const db = getDb();
  const row = db
    .select({
      id: accounts.id,
      status: accounts.status,
      skipInRotation: accounts.skipInRotation,
      quotaFetchedAt: accounts.quotaFetchedAt,
      label: accounts.label,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();

  if (!row) {
    log.debug("refreshAccountUsage: account not found", { accountId });
    return null;
  }

  if (row.status === "expired" || row.status === "error") {
    log.debug("Skipping usage refresh — account not usable", {
      accountId,
      status: row.status,
    });
    return null;
  }
  if (row.skipInRotation) {
    log.debug("Skipping usage refresh — skipInRotation", { accountId });
    return null;
  }

  // TTL guard: don't hammer Anthropic if we already have a fresh value.
  if (!opts.force && row.quotaFetchedAt) {
    const fetchedAtMs =
      row.quotaFetchedAt instanceof Date
        ? row.quotaFetchedAt.getTime()
        : Number(row.quotaFetchedAt);
    const age = Date.now() - fetchedAtMs;
    if (age < QUOTA_REFRESH_TTL_MS) {
      log.debug("Usage refresh skipped — within TTL", { accountId, ageMs: age });
      return null;
    }
  }

  let token = await getAccessToken(accountId);
  if (!token) {
    log.debug("refreshAccountUsage: could not obtain access token", { accountId });
    return null;
  }

  let { status, parsed } = await fetchAccountUsage(token);
  if (status === 401) {
    // Cross-machine refresh rotation: our stored access token may itself
    // be stale even though it hadn't expired locally. Force a refresh and
    // retry ONCE; if still 401, the refresh_token has been revoked and
    // oauth-token-service will have already emitted account:expired.
    const fresh = await refreshAccessToken(accountId);
    if (fresh && fresh !== token) {
      token = fresh;
      ({ status, parsed } = await fetchAccountUsage(token));
    }
  }

  if (!parsed) {
    log.warn("Usage fetch did not yield a parseable body", { accountId, status });
    return null;
  }

  const quota = persistUsage(accountId, parsed);
  // Privacy: log only booleans — utilization is business-sensitive.
  log.info("Account usage refreshed", {
    accountId,
    hasFiveHour: !!quota.fiveHour,
    hasSevenDay: !!quota.sevenDay,
    hasOpus: !!quota.sevenDayOpus,
    hasSonnet: !!quota.sevenDaySonnet,
    overage: quota.overageStatus ?? null,
  });
  return quota;
}

/**
 * Fire-and-forget refresh — never blocks the caller. Errors are logged
 * inside {@link refreshAccountUsage}; this wrapper only catches unhandled
 * rejections that escape the `try/catch` in the fetcher.
 */
export function refreshAccountUsageAsync(
  accountId: string,
  opts: { force?: boolean } = {},
): void {
  void refreshAccountUsage(accountId, opts).catch((err) => {
    log.warn("refreshAccountUsageAsync unexpected error", {
      accountId,
      error: String(err),
    });
  });
}

// ─── Mapping ────────────────────────────────────────────────────────────────

/**
 * Convert one Anthropic window block into our shared-types shape. Anthropic
 * returns `resets_at` in unix **seconds**; we multiply by 1000 so every
 * timestamp stored on `accounts` is unix ms.
 */
function mapWindow(
  window: UsageResponse["five_hour"],
): AccountQuotaWindow | null {
  if (!window) return null;
  const util = window.utilization;
  const resetsSec = window.resets_at;
  if (typeof util !== "number" || typeof resetsSec !== "number") return null;
  return { util, resetsAt: resetsSec * 1_000 };
}

// ─── Bulk staleness refresher (Phase 2 JIT) ────────────────────────────────

/** Default concurrency for {@link refreshStaleQuotas}. */
export const DEFAULT_QUOTA_REFRESH_CONCURRENCY = 3;

/** Per-call timeout budget for {@link refreshStaleQuotas}. Bounds session-start latency. */
export const DEFAULT_QUOTA_REFRESH_TIMEOUT_MS = 2_000;

export interface RefreshStaleQuotasResult {
  scanned: number;
  refreshed: number;
  failed: number;
}

/**
 * Refresh quota for every `ready` account whose `quota_fetched_at` is null
 * or older than `maxAgeMs`. Parallelized with a concurrency cap so the
 * JIT refresh called from `findNextReadyAsync` doesn't stampede Anthropic.
 * Individual calls are wrapped in a racing `setTimeout` so one slow host
 * never blocks the whole pick.
 *
 * Skips accounts with `status` in (`expired`, `error`) or `skipInRotation`
 * = true — those are already filtered by the inner `refreshAccountUsage`,
 * but we also drop them here to keep the active worker set tight.
 */
export async function refreshStaleQuotas(
  maxAgeMs: number = QUOTA_STALE_AFTER_MS,
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<RefreshStaleQuotasResult> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_QUOTA_REFRESH_CONCURRENCY);
  const perCallTimeoutMs = opts.timeoutMs ?? DEFAULT_QUOTA_REFRESH_TIMEOUT_MS;
  const db = getDb();
  const staleBefore = new Date(Date.now() - maxAgeMs);

  const rows = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.status, "ready"),
        eq(accounts.skipInRotation, false),
        or(isNull(accounts.quotaFetchedAt), lt(accounts.quotaFetchedAt, staleBefore)),
      ),
    )
    .all();

  if (rows.length === 0) return { scanned: 0, refreshed: 0, failed: 0 };

  let refreshed = 0;
  let failed = 0;
  const queue = rows.map((r) => r.id);

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      const winner = await Promise.race([
        refreshAccountUsage(id).then((q) => ({ kind: "done" as const, quota: q })),
        new Promise<{ kind: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), perCallTimeoutMs),
        ),
      ]);
      if (winner.kind === "timeout") {
        failed++;
        log.warn("Quota refresh timeout — falling back to stale data", { accountId: id });
      } else if (winner.quota) {
        refreshed++;
      } else {
        // No-op (TTL hit, skipped account, expired status) — don't count as failure.
      }
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(concurrency, rows.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);

  log.info("refreshStaleQuotas complete", {
    scanned: rows.length,
    refreshed,
    failed,
    maxAgeMs,
  });
  return { scanned: rows.length, refreshed, failed };
}

// ─── DB row → AccountQuota mapper ───────────────────────────────────────────

/** Shape-compatible subset of an accounts row needed to rebuild AccountQuota. */
export interface AccountQuotaRow {
  quotaFiveHourUtil: number | null;
  quotaFiveHourResetsAt: Date | number | null;
  quotaSevenDayUtil: number | null;
  quotaSevenDayResetsAt: Date | number | null;
  quotaSevenDayOpusUtil: number | null;
  quotaSevenDayOpusResetsAt: Date | number | null;
  quotaSevenDaySonnetUtil: number | null;
  quotaSevenDaySonnetResetsAt: Date | number | null;
  quotaOverageStatus: string | null;
  quotaFetchedAt: Date | number | null;
}

function toMs(v: Date | number | null): number | null {
  if (v == null) return null;
  return v instanceof Date ? v.getTime() : Number(v);
}

function buildWindow(
  util: number | null,
  resetsAt: Date | number | null,
): AccountQuotaWindow | null {
  if (typeof util !== "number") return null;
  const ms = toMs(resetsAt);
  if (ms == null) return null;
  return { util, resetsAt: ms };
}

/**
 * Reconstruct an `AccountQuota` from a raw DB row. Returns null when we've
 * never successfully fetched for this account (so callers can distinguish
 * "unknown" from "known-zero"). Shared by `routes/accounts.ts` (list payload)
 * and `credential-manager.toAccountInfo`.
 */
export function rowToAccountQuota(row: AccountQuotaRow): AccountQuota | null {
  const fetchedAt = toMs(row.quotaFetchedAt);
  if (fetchedAt == null) return null;

  return {
    fiveHour: buildWindow(row.quotaFiveHourUtil, row.quotaFiveHourResetsAt),
    sevenDay: buildWindow(row.quotaSevenDayUtil, row.quotaSevenDayResetsAt),
    sevenDayOpus: buildWindow(row.quotaSevenDayOpusUtil, row.quotaSevenDayOpusResetsAt),
    sevenDaySonnet: buildWindow(row.quotaSevenDaySonnetUtil, row.quotaSevenDaySonnetResetsAt),
    overageStatus: (row.quotaOverageStatus as AccountOverageStatus | null) ?? null,
    fetchedAt,
  };
}

/** Write all 4 window pairs + overage + fetched_at in one UPDATE. */
function persistUsage(accountId: string, res: UsageResponse): AccountQuota {
  const fiveHour = mapWindow(res.five_hour);
  const sevenDay = mapWindow(res.seven_day);
  const sevenDayOpus = mapWindow(res.seven_day_opus);
  const sevenDaySonnet = mapWindow(res.seven_day_sonnet);
  const overageStatus: AccountOverageStatus | null = res.overage?.status ?? null;
  const fetchedAt = Date.now();

  const db = getDb();
  db.update(accounts)
    .set({
      quotaFiveHourUtil: fiveHour?.util ?? null,
      quotaFiveHourResetsAt: fiveHour ? new Date(fiveHour.resetsAt) : null,
      quotaSevenDayUtil: sevenDay?.util ?? null,
      quotaSevenDayResetsAt: sevenDay ? new Date(sevenDay.resetsAt) : null,
      quotaSevenDayOpusUtil: sevenDayOpus?.util ?? null,
      quotaSevenDayOpusResetsAt: sevenDayOpus ? new Date(sevenDayOpus.resetsAt) : null,
      quotaSevenDaySonnetUtil: sevenDaySonnet?.util ?? null,
      quotaSevenDaySonnetResetsAt: sevenDaySonnet ? new Date(sevenDaySonnet.resetsAt) : null,
      quotaOverageStatus: overageStatus,
      quotaFetchedAt: new Date(fetchedAt),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId))
    .run();

  return {
    fiveHour,
    sevenDay,
    sevenDayOpus,
    sevenDaySonnet,
    overageStatus,
    fetchedAt,
  };
}
