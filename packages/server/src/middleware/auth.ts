/**
 * Auth middleware — PIN-based or legacy API_KEY authentication.
 * Uses timing-safe comparison to prevent oracle attacks.
 *
 * Priority: DB access_pin > env API_KEY. If neither set, all requests allowed.
 */

import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "crypto";
import { createLogger } from "../logger.js";
import { getSetting } from "../services/settings-helpers.js";

const log = createLogger("auth");

/** Constant-time string comparison to prevent timing oracle attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const padded = Buffer.alloc(b.length);
    timingSafeEqual(Buffer.from(a.padEnd(b.length, "\0")), padded);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Get the configured access credential — PIN from DB, or fallback to env API_KEY */
export function getAccessCredential(): string | undefined {
  return getSetting("access_pin") || process.env.API_KEY || undefined;
}

/**
 * Log a warning at startup if no auth credentials are configured.
 * Called once during server initialization.
 */
export function warnIfNoAuth(): void {
  const credential = getAccessCredential();
  if (!credential) {
    log.warn(
      "No authentication configured (no access_pin in DB, no API_KEY env). " +
        "All API requests will be allowed. Set a PIN in Settings > General, " +
        "or set API_KEY env var to secure your instance.",
    );
  }
}

export const apiKeyAuth = () =>
  createMiddleware(async (c, next) => {
    const configuredKey = getAccessCredential();

    // No PIN or API_KEY configured = allow all (local-only access)
    if (!configuredKey) {
      await next();
      return;
    }

    // Check Authorization: Bearer <key>
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      if (safeEqual(authHeader.slice(7), configuredKey)) {
        await next();
        return;
      }
    }

    // Check X-API-Key header (also used for PIN)
    const apiKeyHeader = c.req.header("X-API-Key") ?? "";
    if (apiKeyHeader && safeEqual(apiKeyHeader, configuredKey)) {
      await next();
      return;
    }

    log.warn("Unauthorized request", {
      path: c.req.path,
      ip: c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for") ?? "unknown",
    });

    return c.json({ success: false, error: "Unauthorized" }, 401);
  });
