/**
 * In-memory fixed-window rate limiter — Hono middleware.
 *
 * Design:
 *  - Map<key, { count, windowStart }> — one entry per (IP, bucket) pair
 *  - Key bucket = first 3 path segments (e.g. /api/sessions)
 *  - Cleanup runs every 5 minutes to evict expired windows
 *  - Localhost IPs are always bypassed
 *  - Sets Retry-After header (seconds) on 429 responses
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { createLogger } from "../logger.js";

const log = createLogger("rate-limit");

interface WindowEntry {
  count: number;
  windowStart: number;
}

interface RateLimitOptions {
  /** Maximum requests allowed per window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /**
   * Optional HTTP method filter. When set, the limiter only fires for that
   * method; all other methods pass through unchecked.
   */
  method?: string;
}

// ─── Stores (one per middleware instance) ────────────────────────────────────

// We use a module-level factory so each createRateLimit() call gets its own
// isolated Map and cleanup timer — no cross-contamination between the general
// limiter and the strict session limiter.

function makeStore() {
  const store = new Map<string, WindowEntry>();

  // Cleanup: evict entries whose window has fully expired (2x max window)
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 120_000) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);

  // Allow the process to exit without waiting for the timer
  if (timer.unref) timer.unref();

  return store;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

/** Bucket key: IP + first-3-segments of path (e.g. /api/sessions). */
function makeKey(ip: string, pathname: string): string {
  const bucket = pathname.split("/").slice(0, 3).join("/");
  return `${ip}::${bucket}`;
}

/** Extract the best available IP from the Hono context. */
function resolveIp(c: Context): { ip: string; isLocal: boolean } {
  const envIp = (c.env as Record<string, unknown>)?.ip as { address?: string } | undefined;
  const socketIp = envIp?.address;
  const ip = socketIp ?? c.req.header("x-real-ip") ?? "unknown";
  return { ip, isLocal: !!socketIp && isLocalhost(socketIp) };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a fixed-window rate-limit middleware.
 *
 * @example
 * // General: 100 req/min on all API routes
 * app.use("/api/*", createRateLimit({ max: 100, windowMs: 60_000 }));
 *
 * // Strict: 10 POST /api/sessions per minute
 * app.post("/api/sessions", createRateLimit({ max: 10, windowMs: 60_000, method: "POST" }));
 */
export function createRateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { max, windowMs, method } = options;
  const store = makeStore();
  return async (c: Context, next: Next) => {
    // Method filter — skip if this request's method doesn't match
    if (method && c.req.method !== method) {
      return next();
    }

    const { ip, isLocal } = resolveIp(c);

    // Always bypass localhost (dev / health checks from same host)
    if (isLocal) {
      return next();
    }

    const pathname = new URL(c.req.url).pathname;
    const key = makeKey(ip, pathname);
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      // New window
      store.set(key, { count: 1, windowStart: now });
      return next();
    }

    if (entry.count >= max) {
      const elapsed = now - entry.windowStart;
      const remaining = Math.ceil((windowMs - elapsed) / 1000);

      log.warn("Rate limit exceeded", { ip, path: pathname, count: entry.count, max });

      c.res = new Response(
        JSON.stringify({
          success: false,
          error: "Too many requests",
          retryAfter: remaining,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(remaining),
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil((entry.windowStart + windowMs) / 1000)),
          },
        },
      );
      return;
    }

    // Increment within current window
    store.set(key, { count: entry.count + 1, windowStart: entry.windowStart });
    return next();
  };
}
