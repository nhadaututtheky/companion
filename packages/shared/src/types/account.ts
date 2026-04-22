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

// ─── Threshold settings (Phase 2) ───────────────────────────────────────────

/** Settings keys for the two quota thresholds. Shared between server + web. */
export const ACCOUNT_WARN_THRESHOLD_KEY = "accounts.warnThreshold";
export const ACCOUNT_SWITCH_THRESHOLD_KEY = "accounts.switchThreshold";

/** Default thresholds (0..1). `switch` drives rotation gating; `warn` is UI-only. */
export const DEFAULT_ACCOUNT_WARN_THRESHOLD = 0.7;
export const DEFAULT_ACCOUNT_SWITCH_THRESHOLD = 0.9;

/** Slider min / max / step used by UI AND echoed by server validator. */
export const ACCOUNT_THRESHOLD_MIN = 0.5;
export const ACCOUNT_THRESHOLD_MAX = 0.95;
export const ACCOUNT_THRESHOLD_STEP = 0.05;

/** Minimum gap between `warn` and `switch` thresholds so the two can't alias. */
export const ACCOUNT_THRESHOLD_MIN_GAP = 0.05;

export interface AccountThresholds {
  warnThreshold: number;
  switchThreshold: number;
}

/**
 * Normalize one threshold value: clamp to [MIN, MAX] and snap to the
 * nearest STEP multiple. Pure function — exported so the UI can mirror
 * server's final state without an extra round trip.
 */
export function normalizeThreshold(value: number): number {
  // NaN → treat as MIN (safe default). +Infinity / -Infinity get clamped
  // naturally by Math.min/max so "1.5 → MAX", "-1 → MIN" still hold.
  const coerced = Number.isNaN(value) ? ACCOUNT_THRESHOLD_MIN : value;
  const clamped = Math.min(
    ACCOUNT_THRESHOLD_MAX,
    Math.max(ACCOUNT_THRESHOLD_MIN, coerced),
  );
  const steps = Math.round(clamped / ACCOUNT_THRESHOLD_STEP);
  return Math.round(steps * ACCOUNT_THRESHOLD_STEP * 100) / 100;
}

/**
 * Normalize a `{ warn, switch }` pair. Individually clamps/snaps each,
 * then enforces `warn + MIN_GAP <= switch` by adjusting the side the
 * caller flagged as most-recently-changed (`lastChanged`). Default behavior
 * keeps whichever slider the user just dragged and nudges the other.
 */
export function normalizeThresholdPair(
  input: Partial<AccountThresholds>,
  opts: { lastChanged?: "warn" | "switch" } = {},
): AccountThresholds {
  let warn = normalizeThreshold(input.warnThreshold ?? DEFAULT_ACCOUNT_WARN_THRESHOLD);
  let sw = normalizeThreshold(input.switchThreshold ?? DEFAULT_ACCOUNT_SWITCH_THRESHOLD);

  if (sw - warn >= ACCOUNT_THRESHOLD_MIN_GAP - 1e-9) {
    return { warnThreshold: warn, switchThreshold: sw };
  }

  // Pair violates the min-gap. Strategy: keep whichever slider the user
  // just dragged and nudge the other. Check the RAW target against the
  // bound before clamping — otherwise `normalizeThreshold` silently floors
  // the bump and we ship a no-op. Falls back to nudging the other side so
  // the final pair always satisfies `warn + gap <= switch` AND both stay
  // in bounds.
  if (opts.lastChanged === "warn") {
    const rawTarget = warn + ACCOUNT_THRESHOLD_MIN_GAP;
    if (rawTarget <= ACCOUNT_THRESHOLD_MAX + 1e-9) {
      sw = normalizeThreshold(rawTarget);
    } else {
      sw = ACCOUNT_THRESHOLD_MAX;
      warn = normalizeThreshold(sw - ACCOUNT_THRESHOLD_MIN_GAP);
    }
    return { warnThreshold: warn, switchThreshold: sw };
  }
  // Default (or lastChanged=switch): keep `switch`, pull `warn` down.
  const rawTarget = sw - ACCOUNT_THRESHOLD_MIN_GAP;
  if (rawTarget >= ACCOUNT_THRESHOLD_MIN - 1e-9) {
    warn = normalizeThreshold(rawTarget);
  } else {
    warn = ACCOUNT_THRESHOLD_MIN;
    sw = normalizeThreshold(warn + ACCOUNT_THRESHOLD_MIN_GAP);
  }
  return { warnThreshold: warn, switchThreshold: sw };
}

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
