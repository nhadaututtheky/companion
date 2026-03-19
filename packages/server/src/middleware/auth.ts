/**
 * Auth middleware — API key based authentication.
 * Uses timing-safe comparison to prevent oracle attacks.
 */

import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "crypto";
import { createLogger } from "../logger.js";

const log = createLogger("auth");

/** Constant-time string comparison to prevent timing oracle attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run comparison to avoid length-based oracle
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const apiKeyAuth = () =>
  createMiddleware(async (c, next) => {
    const configuredKey = process.env.API_KEY;

    // Dev mode: no key configured = allow all (warned at startup)
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

    // Check X-API-Key header
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
