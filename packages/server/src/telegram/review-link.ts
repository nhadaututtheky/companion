/**
 * Generate review URLs for Telegram plan notifications.
 *
 * Priority: publicUrl setting → LAN IP auto-detect → localhost.
 */

import { networkInterfaces } from "os";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";

const SERVER_PORT = process.env.PORT ?? "3579";

/** Get LAN IP (first non-internal IPv4) */
function getLanIp(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/** Build the base URL from settings or auto-detect */
function getBaseUrl(): string {
  // 1. Check publicUrl setting
  try {
    const db = getDb();
    const row = db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "review.publicUrl"))
      .get();
    if (row?.value && row.value.trim()) {
      return row.value.trim().replace(/\/+$/, "");
    }
  } catch {
    // DB not ready — fallback
  }

  // 2. LAN IP auto-detect
  const lanIp = getLanIp();
  if (lanIp) {
    return `http://${lanIp}:${SERVER_PORT}`;
  }

  // 3. Localhost fallback
  return `http://localhost:${SERVER_PORT}`;
}

/**
 * Generate a review URL for a plan file.
 * Returns the full URL to open in browser, or null if unavailable.
 */
export async function getReviewUrl(projectSlug: string, filePath: string): Promise<string | null> {
  try {
    const base = getBaseUrl();
    const params = new URLSearchParams({
      project: projectSlug,
      file: filePath,
    });
    return `${base}/review?${params.toString()}`;
  } catch {
    return null;
  }
}
