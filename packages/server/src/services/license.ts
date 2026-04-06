/**
 * License verification — checks key against pay.theio.vn
 * Supports: license key verification, 7-day free trial, offline caching.
 */

import { createLogger } from "../logger.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { hostname as getHostname } from "node:os";
import { APP_VERSION } from "@companion/shared";

const log = createLogger("license");

const VERIFY_URL = process.env.COMPANION_VERIFY_URL ?? "https://pay.theio.vn/verify";
const TRIAL_URL = process.env.COMPANION_TRIAL_URL ?? "https://pay.theio.vn/trial";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DATA_DIR = process.env.DATABASE_PATH ? join(process.env.DATABASE_PATH, "..") : "./data";

export type LicenseTier = "free" | "trial" | "starter" | "pro";

export interface LicenseInfo {
  valid: boolean;
  tier: LicenseTier;
  email: string;
  expiresAt: string;
  maxSessions: number;
  features: string[];
  cachedAt: number;
  daysLeft?: number;
  error?: string;
}

/** Extended cache record with metadata to prevent cross-key/cross-source collisions */
interface CachedLicenseRecord extends LicenseInfo {
  source: "trial" | "license";
  licenseKeyHash?: string;
  machineId: string;
}

// ── Feature definitions by tier ─────────────────────────────────────────────

const FREE_FEATURES = [
  "web_terminal",
  "basic_commands",
  "multi_session",
  "telegram_bot",
  "magic_ring",
  "stream_bridge",
  "permission_gate_telegram",
  "templates",
  "debate_mode",
  "desktop_app",
  "thinking_mode",
  "rtk_basic",
];

const STARTER_FEATURES = [...FREE_FEATURES, "shared_context", "rtk_pro"];

const FREE_LICENSE: LicenseInfo = {
  valid: false,
  tier: "free",
  email: "",
  expiresAt: "",
  maxSessions: 2,
  features: FREE_FEATURES,
  cachedAt: Date.now(),
};

// Trial gets starter-level features for 7 days
const TRIAL_FEATURES = STARTER_FEATURES;

// In-memory cache
let cachedLicense: CachedLicenseRecord | null = null;

// ── Machine ID ──────────────────────────────────────────────────────────────

/** Generate a stable machine ID based on hostname + platform */
function getMachineId(): string {
  const hostname = getHostname();
  const platform = process.platform;
  const raw = `companion:${hostname}:${platform}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Hash a license key for cache matching (never store raw key) */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

// ── Cache persistence (survives restarts) ───────────────────────────────────

function getCachePath(): string {
  return join(DATA_DIR, ".license-cache.json");
}

function loadCachedLicense(): CachedLicenseRecord | null {
  try {
    const cachePath = getCachePath();
    if (!existsSync(cachePath)) return null;
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (data && data.cachedAt && Date.now() - data.cachedAt < CACHE_TTL_MS) {
      return data as CachedLicenseRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function saveLicenseCache(record: CachedLicenseRecord): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(getCachePath(), JSON.stringify(record, null, 2));
  } catch (err) {
    log.warn("Failed to persist license cache", { error: String(err) });
  }
}

function clearLicenseCache(): void {
  try {
    const cachePath = getCachePath();
    if (existsSync(cachePath)) {
      unlinkSync(cachePath);
      log.info("License cache cleared");
    }
  } catch (err) {
    log.warn("Failed to clear license cache", { error: String(err) });
  }
}

/**
 * Check if cached record matches the current verification context.
 * Prevents trial cache from being used for paid key verification and vice versa.
 */
function isCacheValidFor(
  record: CachedLicenseRecord,
  source: "trial" | "license",
  keyHash?: string,
): boolean {
  if (!record.valid) return false;
  if (Date.now() - record.cachedAt >= CACHE_TTL_MS) return false;
  if (record.machineId !== getMachineId()) return false;
  // Source must match — trial cache cannot serve paid license verification
  if (record.source !== source) return false;
  // For paid licenses, the key hash must match
  if (source === "license" && record.licenseKeyHash !== keyHash) return false;
  return true;
}

// ── License verification ────────────────────────────────────────────────────

/**
 * Verify license key against the cloud API.
 * Returns cached result only if it matches the same key + source.
 */
export async function verifyLicense(
  key: string,
  options?: { skipCache?: boolean },
): Promise<LicenseInfo> {
  const keyH = hashKey(key);
  const mid = getMachineId();

  // Check cache — only reuse if same key + same source + same machine
  if (!options?.skipCache) {
    if (cachedLicense && isCacheValidFor(cachedLicense, "license", keyH)) {
      return cachedLicense;
    }

    const persisted = loadCachedLicense();
    if (persisted && isCacheValidFor(persisted, "license", keyH)) {
      cachedLicense = persisted;
      return persisted;
    }
  }

  try {
    const res = await fetch(
      `${VERIFY_URL}?key=${encodeURIComponent(key)}&mid=${encodeURIComponent(mid)}`,
      {
        headers: { "User-Agent": `Companion/${APP_VERSION}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    const data = (await res.json()) as {
      valid: boolean;
      tier?: string;
      email?: string;
      expiresAt?: string;
      maxSessions?: number;
      features?: string[];
      daysLeft?: number;
      error?: string;
    };

    const record: CachedLicenseRecord = {
      valid: data.valid,
      tier: (data.tier as LicenseTier) ?? "free",
      email: data.email ?? "",
      expiresAt: data.expiresAt ?? "",
      maxSessions: data.maxSessions ?? 1,
      features: data.features ?? [],
      cachedAt: Date.now(),
      daysLeft: data.daysLeft,
      error: data.error,
      source: "license",
      licenseKeyHash: keyH,
      machineId: mid,
    };

    if (record.valid) {
      cachedLicense = record;
      saveLicenseCache(record);
      log.info("License verified", {
        tier: record.tier,
        email: record.email,
        expiresAt: record.expiresAt,
        maxSessions: record.maxSessions,
      });
    } else {
      // Key invalid — clear any stale cache and log clearly
      clearLicenseCache();
      cachedLicense = null;
      log.warn("License key rejected by verify endpoint", {
        error: record.error,
        tierFallback: "trial",
      });
    }

    return record;
  } catch (err) {
    log.error("License verification failed — using cached or free tier", { error: String(err) });

    // Offline fallback — only use cache if it's for the SAME key
    if (cachedLicense && isCacheValidFor(cachedLicense, "license", keyH)) {
      log.info("Using cached license (offline mode)", { tier: cachedLicense.tier });
      return cachedLicense;
    }

    const persisted = loadCachedLicense();
    if (persisted && isCacheValidFor(persisted, "license", keyH)) {
      cachedLicense = persisted;
      log.info("Using persisted license cache (offline mode)", { tier: persisted.tier });
      return persisted;
    }

    return { ...FREE_LICENSE, cachedAt: Date.now(), error: "Cannot reach license server" };
  }
}

// ── Trial activation ────────────────────────────────────────────────────────

/**
 * Check or activate 7-day free trial.
 * Called when no license key is set.
 */
export async function checkOrActivateTrial(): Promise<LicenseInfo> {
  const machineId = getMachineId();

  // Check persistent cache — only reuse if it's a trial cache for this machine
  const persisted = loadCachedLicense();
  if (persisted && isCacheValidFor(persisted, "trial")) {
    cachedLicense = persisted;
    return persisted;
  }

  try {
    const res = await fetch(`${TRIAL_URL}?mid=${encodeURIComponent(machineId)}`, {
      headers: { "User-Agent": `Companion/${APP_VERSION}` },
      signal: AbortSignal.timeout(10000),
    });

    const data = (await res.json()) as {
      valid: boolean;
      tier?: string;
      expiresAt?: string;
      maxSessions?: number;
      features?: string[];
      daysLeft?: number;
    };

    const record: CachedLicenseRecord = {
      valid: data.valid,
      tier: (data.tier as LicenseTier) ?? "free",
      email: "",
      expiresAt: data.expiresAt ?? "",
      maxSessions: data.maxSessions ?? 1,
      features: data.features ?? [],
      cachedAt: Date.now(),
      daysLeft: data.daysLeft,
      source: "trial",
      machineId,
    };

    cachedLicense = record;
    saveLicenseCache(record);

    if (record.valid && record.tier === "trial") {
      log.info(`Trial active — ${record.daysLeft} days remaining`, {
        expiresAt: record.expiresAt,
        maxSessions: record.maxSessions,
      });
    } else {
      log.info(`Trial expired — free mode (${FREE_LICENSE.maxSessions} sessions)`);
    }

    return record;
  } catch (err) {
    log.warn("Trial check failed — checking local cache", { error: String(err) });

    // Offline: if we have a cached trial, use it
    if (persisted && persisted.source === "trial") {
      const expiry = new Date(persisted.expiresAt);
      if (expiry > new Date()) {
        cachedLicense = persisted;
        return persisted;
      }
    }

    // No cache, no server — first-time offline users get 7-day local trial
    const localTrialPath = join(DATA_DIR, ".trial");
    let trialStart: Date;

    try {
      if (existsSync(localTrialPath)) {
        trialStart = new Date(readFileSync(localTrialPath, "utf-8").trim());
      } else {
        trialStart = new Date();
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(localTrialPath, trialStart.toISOString());
      }
    } catch {
      trialStart = new Date();
    }

    const trialEnd = new Date(trialStart.getTime() + 7 * 86400000);
    const isValid = trialEnd > new Date();
    const daysLeft = isValid ? Math.ceil((trialEnd.getTime() - Date.now()) / 86400000) : 0;

    const localTrial: CachedLicenseRecord = {
      valid: isValid,
      tier: isValid ? "trial" : "free",
      email: "",
      expiresAt: trialEnd.toISOString(),
      maxSessions: isValid ? 6 : 2,
      features: isValid ? TRIAL_FEATURES : FREE_LICENSE.features,
      cachedAt: Date.now(),
      daysLeft,
      source: "trial",
      machineId,
    };

    cachedLicense = localTrial;
    saveLicenseCache(localTrial);

    if (isValid) {
      log.info(`Local trial active — ${daysLeft} days remaining (offline mode)`);
    } else {
      log.info("Local trial expired — free mode");
    }

    return localTrial;
  }
}

// ── Getters ─────────────────────────────────────────────────────────────────

/** Get current license info (cached, no network call) */
export function getLicense(): LicenseInfo {
  return cachedLicense ?? FREE_LICENSE;
}

/** Check if a feature is unlocked */
export function hasFeature(feature: string): boolean {
  const license = getLicense();
  return license.features.includes(feature);
}

/** Get max allowed sessions based on license (-1 = unlimited) */
export function getMaxSessions(): number {
  const max = getLicense().maxSessions;
  return max < 0 ? Infinity : max;
}

/** Check if current plan is at least the given tier */
export function isAtLeast(tier: LicenseTier): boolean {
  const order: LicenseTier[] = ["free", "trial", "starter", "pro"];
  const current = getLicense().tier;
  return order.indexOf(current) >= order.indexOf(tier);
}
