/**
 * Per-account Anthropic rate-limit quota shape.
 *
 * Mirrors the response of `GET https://api.anthropic.com/api/oauth/usage`
 * (reverse-engineered from the Claude Code CLI). Pro/Max accounts return
 * `five_hour` + `seven_day`. Team/Enterprise accounts return `five_hour` +
 * `seven_day_opus` + `seven_day_sonnet`. Consumers MUST treat every window
 * as optional.
 *
 * `resetsAt` values are unix **milliseconds** (the server writer converts
 * from Anthropic's `resets_at` seconds before storing, so every timestamp
 * on `accounts` is uniform). `util` is a 0..1 fraction.
 */

/** One rate-limit window. */
export interface AccountQuotaWindow {
  util: number;
  resetsAt: number;
}

/** All quota windows the Anthropic API might return. Every field nullable. */
export interface AccountQuota {
  fiveHour: AccountQuotaWindow | null;
  sevenDay: AccountQuotaWindow | null;
  sevenDayOpus: AccountQuotaWindow | null;
  sevenDaySonnet: AccountQuotaWindow | null;
  /** Anthropic overage allowance state. */
  overageStatus: AccountOverageStatus | null;
  /** Unix ms — when this row was last successfully refreshed. */
  fetchedAt: number;
}

export type AccountOverageStatus = "allowed" | "allowed_warning" | "rejected";

/** Stale threshold (ms) used by round-robin to decide "trust quota vs fall back to reactive path". */
export const QUOTA_STALE_AFTER_MS = 5 * 60 * 1_000;

/** TTL for refresh no-op — usage-fetcher skips network if last call < this. */
export const QUOTA_REFRESH_TTL_MS = 60 * 1_000;

/**
 * Compute MAX utilization across every non-null window. Single number lets
 * the round-robin gate compare against one `switchThreshold` without needing
 * per-window threshold UI. Returns `null` when no window has been fetched yet.
 */
export function maxQuotaUtil(quota: AccountQuota | null): number | null {
  if (!quota) return null;
  const vals = [
    quota.fiveHour?.util,
    quota.sevenDay?.util,
    quota.sevenDayOpus?.util,
    quota.sevenDaySonnet?.util,
  ].filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return Math.max(...vals);
}
