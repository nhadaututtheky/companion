/**
 * Account Auto-Switch — Listens for rate limit events, marks accounts,
 * finds next available, switches automatically. Also manages cooldown recovery.
 */

import { eventBus } from "./event-bus.js";
import {
  getActiveAccount,
  markRateLimited,
  findNextReady,
  switchAccount,
  resetExpiredCooldowns,
} from "./credential-manager.js";
import { isEncryptionEnabled } from "./crypto.js";
import { getSettingBool } from "./settings-helpers.js";
import { createLogger } from "../logger.js";

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

  // Find next ready account
  const nextAccount = findNextReady(activeAccount.id);
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
