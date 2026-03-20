import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getSqlite } from "../db/client.js";
import { APP_VERSION } from "@companion/shared";
import { countActiveSessions } from "../services/session-store.js";
import { getLicense, getMaxSessions, verifyLicense } from "../services/license.js";
import { createLogger } from "../logger.js";
import type { HealthResponse } from "@companion/shared";

const log = createLogger("routes:license");

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  let dbStatus: "connected" | "error" = "error";
  let tableCount = 0;

  try {
    const sqlite = getSqlite();
    const result = sqlite
      .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'")
      .get() as { count: number } | undefined;
    tableCount = result?.count ?? 0;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  const response: HealthResponse = {
    status: dbStatus === "connected" ? "ok" : "error",
    version: APP_VERSION,
    uptime: Date.now() - startTime,
    db: {
      status: dbStatus,
      tables: tableCount,
    },
    sessions: {
      active: countActiveSessions(),
      total: 0,
    },
  };

  return c.json(response, dbStatus === "connected" ? 200 : 503);
});

// License status endpoint — for web UI to show trial banner etc.
healthRoutes.get("/license", (c) => {
  const license = getLicense();
  return c.json({
    tier: license.tier,
    valid: license.valid,
    maxSessions: license.maxSessions,
    features: license.features,
    expiresAt: license.expiresAt,
    daysLeft: license.daysLeft,
  });
});

// ── License activation (mounted under protected /api/license) ──────────────
export const licenseActivateRoute = new Hono();

const activateSchema = z.object({
  key: z.string().min(10).max(100),
});

licenseActivateRoute.post("/activate", zValidator("json", activateSchema), async (c) => {
  const { key } = c.req.valid("json");

  log.info("License activation attempt", { keyPrefix: key.slice(0, 12) + "..." });

  const license = await verifyLicense(key, { skipCache: true });

  if (!license.valid) {
    log.warn("License activation failed", { error: license.error });
    return c.json({
      success: false,
      error: license.error ?? "Invalid or expired license key",
      tier: "free",
    }, 400);
  }

  log.info("License activated!", {
    tier: license.tier,
    maxSessions: license.maxSessions,
    expiresAt: license.expiresAt,
  });

  return c.json({
    success: true,
    tier: license.tier,
    maxSessions: license.maxSessions,
    features: license.features,
    expiresAt: license.expiresAt,
    daysLeft: license.daysLeft,
    message: `Pro activated! ${license.maxSessions} sessions, expires ${license.expiresAt?.split("T")[0]}`,
  });
});
