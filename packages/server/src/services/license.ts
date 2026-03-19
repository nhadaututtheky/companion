/**
 * License verification — checks key against companion.theio.vn
 * Caches result for 24h to allow offline usage.
 */

import { createLogger } from "../logger.js";

const log = createLogger("license");

const VERIFY_URL = process.env.COMPANION_VERIFY_URL ?? "https://companion.theio.vn/verify";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface LicenseInfo {
  valid: boolean;
  tier: "free" | "pro" | "team";
  email: string;
  expiresAt: string;
  maxSessions: number;
  features: string[];
  cachedAt: number;
  error?: string;
}

// In-memory cache
let cachedLicense: LicenseInfo | null = null;

/**
 * Verify license key against the cloud API.
 * Returns cached result if still valid.
 */
export async function verifyLicense(key: string): Promise<LicenseInfo> {
  // Check cache first
  if (cachedLicense && cachedLicense.valid && Date.now() - cachedLicense.cachedAt < CACHE_TTL_MS) {
    return cachedLicense;
  }

  try {
    const res = await fetch(`${VERIFY_URL}?key=${encodeURIComponent(key)}`, {
      headers: { "User-Agent": "Companion/0.2.0" },
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json() as {
      valid: boolean;
      tier?: string;
      email?: string;
      expiresAt?: string;
      maxSessions?: number;
      features?: string[];
      error?: string;
    };

    const license: LicenseInfo = {
      valid: data.valid,
      tier: (data.tier as LicenseInfo["tier"]) ?? "free",
      email: data.email ?? "",
      expiresAt: data.expiresAt ?? "",
      maxSessions: data.maxSessions ?? 1,
      features: data.features ?? [],
      cachedAt: Date.now(),
      error: data.error,
    };

    if (license.valid) {
      cachedLicense = license;
      log.info("License verified", { tier: license.tier, email: license.email, expiresAt: license.expiresAt });
    } else {
      log.warn("License invalid", { error: license.error });
    }

    return license;
  } catch (err) {
    log.error("License verification failed — using cached or free tier", { error: String(err) });

    // If we have a cached valid license, keep using it (offline grace period)
    if (cachedLicense?.valid) {
      log.info("Using cached license (offline mode)", { tier: cachedLicense.tier });
      return cachedLicense;
    }

    // No cache, no connection — default to free tier
    return {
      valid: false,
      tier: "free",
      email: "",
      expiresAt: "",
      maxSessions: 1,
      features: ["web_terminal", "basic_commands"],
      cachedAt: Date.now(),
      error: "Cannot reach license server — running in free mode",
    };
  }
}

/** Get current license info (cached, no network call) */
export function getLicense(): LicenseInfo | null {
  return cachedLicense;
}

/** Check if a feature is unlocked */
export function hasFeature(feature: string): boolean {
  if (!cachedLicense) return false;
  return cachedLicense.features.includes(feature);
}

/** Get max allowed sessions based on license */
export function getMaxSessions(): number {
  return cachedLicense?.maxSessions ?? 1;
}
