// In-memory sliding window rate limiter — Hono middleware

import type { Context, Next } from "hono";
import { createLogger } from "../logger.js";

const log = createLogger("rate-limit");

interface WindowEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = { max: 60, windowMs: 60_000 };

const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  "/api/sessions": { max: 30, windowMs: 60_000 },
  "/api/telegram": { max: 30, windowMs: 60_000 },
  "/api/channels": { max: 30, windowMs: 60_000 },
};

const store = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    const fresh = entry.timestamps.filter((t) => now - t < 120_000);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, { timestamps: fresh });
    }
  }
}, 5 * 60_000);

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function getConfig(path: string): RateLimitConfig {
  for (const [prefix, config] of Object.entries(ROUTE_LIMITS)) {
    if (path.startsWith(prefix)) return config;
  }
  return DEFAULT_CONFIG;
}

export function rateLimiter() {
  return async (c: Context, next: Next) => {
    // Use socket IP from Bun server (passed via env), fall back to x-real-ip only if from trusted proxy
    const envIp = (c.env as Record<string, unknown>)?.ip as { address?: string } | undefined;
    const socketIp = envIp?.address;
    const ip = socketIp ?? c.req.header("x-real-ip") ?? "unknown";

    if (socketIp && isLocalhost(socketIp)) {
      return next();
    }

    const path = new URL(c.req.url).pathname;
    const config = getConfig(path);
    const key = `${ip}:${path.split("/").slice(0, 3).join("/")}`;
    const now = Date.now();

    const entry = store.get(key) ?? { timestamps: [] };
    const windowStart = now - config.windowMs;
    const fresh = entry.timestamps.filter((t) => t > windowStart);

    if (fresh.length >= config.max) {
      log.warn("Rate limit exceeded", {
        ip,
        path,
        count: fresh.length,
        max: config.max,
      });
      return c.json(
        {
          error: "Too many requests",
          retryAfter: Math.ceil(config.windowMs / 1000),
        },
        429,
      );
    }

    store.set(key, { timestamps: [...fresh, now] });
    return next();
  };
}
