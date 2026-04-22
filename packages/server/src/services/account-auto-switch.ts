/**
 * Account Auto-Switch — Listens for rate limit events, marks accounts,
 * finds next available, switches automatically. Also manages cooldown recovery.
 */

import { eventBus } from "./event-bus.js";
import {
  getActiveAccount,
  markRateLimited,
  findNextReadyAsync,
  switchAccount,
  resetExpiredCooldowns,
} from "./credential-manager.js";
import { isEncryptionEnabled } from "./crypto.js";
import { getSettingBool, getSettingNumber } from "./settings-helpers.js";
import { createLogger } from "../logger.js";
import {
  ACCOUNT_SWITCH_THRESHOLD_KEY,
  DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
  maxQuotaUtil,
  QUOTA_STALE_AFTER_MS,
} from "@companion/shared";
import { rowToAccountQuota } from "./usage-fetcher.js";
import { getDb } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { eq } from "drizzle-orm";

/** Settings key: "true" to let the auto-switch system pick a new account on rate-limit. */
export const AUTO_SWITCH_KEY = "accounts.autoSwitchEnabled";

const log = createLogger("account-auto-switch");

const COOLDOWN_CHECK_INTERVAL_MS = 30_000; // Check every 30s

let cooldownTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let unsubRateLimit: (() => void) | null = null;

/** Debounce: ignore duplicate rate-limit events within this window per session */
const recentRateLimits = new Map<string, number>();
const RATE_LIMIT_DEBOUNCE_MS = 10_000;

// ─── Auto-Switch Handler ───────────────────────────────────────────────────

async function handleRateLimited(payload: {
  accountId: string;
  sessionId: string;
  reason: string;
}): Promise<void> {
  const { sessionId, reason } = payload;

  // Debounce: skip if we already handled a rate limit for this session recently
  const lastTime = recentRateLimits.get(sessionId);
  if (lastTime && Date.now() - lastTime < RATE_LIMIT_DEBOUNCE_MS) {
    return;
  }
  recentRateLimits.set(sessionId, Date.now());

  // Find the actual active account (the event's accountId is sessionId as placeholder)
  const activeAccount = getActiveAccount();
  if (!activeAccount) {
    log.warn("Rate limit detected but no active account found");
    return;
  }

  // Phase 2: proactive-miss detector. Before we mark this account rate-limited,
  // check whether our quota gate could have seen this coming. If the account
  // had FRESH quota data below the switch threshold AND still hit a real rate
  // limit, the threshold is too lenient (or Anthropic's util is lagging). This
  // log is the only breadcrumb for tuning defaults in production.
  logProactiveMissIfApplicable(activeAccount.id);

  // Always mark rate-limited (so UI shows correct state + cooldown timer runs)
  // Then gate the actual switch behind the user toggle.
  const cooldownMs = markRateLimited(activeAccount.id);

  if (!getSettingBool(AUTO_SWITCH_KEY, true)) {
    log.info("Auto-switch disabled by setting, skipping account rotation", {
      accountId: activeAccount.id,
      label: activeAccount.label,
    });
    eventBus.emit("account:all_limited", {
      reason: `Account "${activeAccount.label}" hit rate limit. Auto-switch is disabled.`,
    });
    return;
  }

  log.info("Account rate-limited", {
    accountId: activeAccount.id,
    label: activeAccount.label,
    cooldownMs,
    reason: reason.slice(0, 100),
  });

  // Find next ready account (skip-in-rotation filtered out first; fall back to
  // skipped accounts rather than deadlocking if the user has flagged everything).
  // Async variant refreshes stale quotas JIT so the fallback pick isn't itself
  // already over-limit.
  let nextAccount = await findNextReadyAsync(activeAccount.id);
  if (!nextAccount) nextAccount = await findNextReadyAsync(activeAccount.id, true);
  if (!nextAccount) {
    log.warn("All accounts rate-limited — no auto-switch possible");
    eventBus.emit("account:all_limited", {
      reason: `Account "${activeAccount.label}" hit rate limit and no other accounts are available`,
    });
    return;
  }

  // Switch to next account
  const switched = await switchAccount(nextAccount.id);
  if (switched) {
    log.info("Auto-switched to next account", {
      from: activeAccount.label,
      to: nextAccount.label,
    });
  } else {
    log.error("Failed to auto-switch account", { targetId: nextAccount.id });
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

/** Start the auto-switch system. Call on server boot after credential watcher. */
export function startAutoSwitch(): void {
  if (!isEncryptionEnabled()) return; // No multi-account without encryption

  // Listen for rate limit events
  unsubRateLimit = eventBus.on("account:rate_limited", (payload) => {
    handleRateLimited(payload).catch((err) => {
      log.error("Auto-switch handler error", { error: String(err) });
    });
  });

  // Periodic cooldown recovery: reset rate-limited accounts when their cooldown expires
  cooldownTimer = setInterval(() => {
    try {
      const resetCount = resetExpiredCooldowns();
      if (resetCount > 0) {
        log.info("Cooldown recovery: reset accounts to ready", { count: resetCount });
      }
    } catch (err) {
      log.error("Cooldown check error", { error: String(err) });
    }
  }, COOLDOWN_CHECK_INTERVAL_MS);

  // Cleanup stale debounce entries every 60s
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_DEBOUNCE_MS * 2;
    for (const [key, time] of recentRateLimits) {
      if (time < cutoff) recentRateLimits.delete(key);
    }
  }, 60_000);

  log.info("Account auto-switch started");
}

/**
 * If this account's quota was fresh AND under the switch threshold but we
 * still hit a real rate limit, the proactive gate *should* have caught it.
 * Emit a warn log so defaults can be tuned. Silent when quota is stale or
 * missing — that's a known limitation of Alt D (on-demand), not a miss.
 */
function logProactiveMissIfApplicable(accountId: string): void {
  try {
    const db = getDb();
    const row = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (!row) return;
    const quota = rowToAccountQuota(row);
    if (!quota) return;
    const ageMs = Date.now() - quota.fetchedAt;
    if (ageMs >= QUOTA_STALE_AFTER_MS) return; // Stale — expected miss.
    const util = maxQuotaUtil(quota);
    if (util == null) return;
    const switchThreshold = getSettingNumber(
      ACCOUNT_SWITCH_THRESHOLD_KEY,
      DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
    );
    if (util >= switchThreshold) return; // Gate would have fired — not a miss.
    log.warn("Proactive quota miss — rate_limited hit while util below threshold", {
      accountId,
      util,
      switchThreshold,
      quotaAgeMs: ageMs,
    });
  } catch (err) {
    // Non-fatal: this is observability-only.
    log.debug("proactive-miss detector error", { accountId, error: String(err) });
  }
}

/** Stop the auto-switch system. Call on server shutdown. */
export function stopAutoSwitch(): void {
  if (unsubRateLimit) {
    unsubRateLimit();
    unsubRateLimit = null;
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  recentRateLimits.clear();
  log.info("Account auto-switch stopped");
}
