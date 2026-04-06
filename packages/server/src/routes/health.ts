import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getSqlite } from "../db/client.js";

import { countActiveSessions } from "../services/session-store.js";
import { getLicense, verifyLicense } from "../services/license.js";
import { checkForUpdate } from "../services/version-check.js";
import { createLogger } from "../logger.js";
import type { HealthResponse } from "@companion/shared";
import { APP_VERSION } from "@companion/shared";
import { getAccessCredential } from "../middleware/auth.js";

const log = createLogger("routes:license");

const startTime = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  let dbStatus: "connected" | "error" = "error"; // eslint-disable-line no-useless-assignment
  try {
    const sqlite = getSqlite();
    sqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table'").get() as
      | { count: number }
      | undefined;
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  const response: HealthResponse = {
    status: dbStatus === "connected" ? "ok" : "error",
    uptime: Date.now() - startTime,
    db: {
      status: dbStatus,
    },
    sessions: {
      active: countActiveSessions(),
      total: 0,
    },
  };

  return c.json(response, dbStatus === "connected" ? 200 : 503);
});

// Setup status endpoint — public, used by onboarding wizard before auth
healthRoutes.get("/setup-status", (c) => {
  const hasPin = !!getAccessCredential();

  let hasProjects = false;
  let hasSessions = false;
  try {
    const sqlite = getSqlite();
    const projectCount = sqlite.prepare("SELECT count(*) as count FROM projects").get() as
      | { count: number }
      | undefined;
    hasProjects = (projectCount?.count ?? 0) > 0;

    const sessionCount = sqlite.prepare("SELECT count(*) as count FROM sessions").get() as
      | { count: number }
      | undefined;
    hasSessions = (sessionCount?.count ?? 0) > 0;
  } catch {
    // DB may not be ready yet — treat as false
  }

  return c.json({
    hasPin,
    hasProjects,
    hasSessions,
    version: APP_VERSION,
  });
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
    return c.json(
      {
        success: false,
        error: license.error ?? "Invalid or expired license key",
        tier: "free",
      },
      400,
    );
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
    message: `Pro activated! ${license.maxSessions < 0 ? "unlimited" : license.maxSessions} sessions, expires ${license.expiresAt?.split("T")[0]}`,
  });
});

// Update check endpoint — checks GitHub releases for newer version
healthRoutes.get("/update-check", async (c) => {
  const force = c.req.query("force") === "true";
  const info = await checkForUpdate(force);
  return c.json(info);
});
