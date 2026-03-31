import { Hono } from "hono";
import { healthRoutes, licenseActivateRoute } from "./health.js";
import { sessionRoutes } from "./sessions.js";
import { projectRoutes } from "./projects.js";
import { telegramRoutes } from "./telegram.js";
import { filesystemRoutes } from "./filesystem.js";
import { channelRoutes } from "./channels.js";
import { settingsRoutes } from "./settings.js";
import { templateRoutes } from "./templates.js";
import { domainRoutes } from "./domain.js";
import { terminalRoutes } from "./terminal.js";
import { statsRoutes } from "./stats.js";
import { apiKeyAuth } from "../middleware/auth.js";
import { getLicense } from "../services/license.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BotRegistry } from "../telegram/bot-registry.js";
import type { ApiResponse } from "@companion/shared";

export function createRoutes(bridge: WsBridge, botRegistry: BotRegistry): Hono {
  const api = new Hono();

  // Public routes
  api.route("/api", healthRoutes);

  // License info (public — so web can check before auth)
  const licenseRoute = new Hono();
  licenseRoute.get("/license", (c) => {
    const license = getLicense();
    return c.json({
      success: true,
      data: license ?? { valid: false, tier: "free", features: [] },
    } satisfies ApiResponse);
  });
  api.route("/api", licenseRoute);

  // Protected routes
  const protectedApi = new Hono();
  protectedApi.use("*", apiKeyAuth());
  protectedApi.route("/sessions", sessionRoutes(bridge, botRegistry));
  protectedApi.route("/projects", projectRoutes);
  protectedApi.route("/telegram", telegramRoutes(botRegistry));
  protectedApi.route("/fs", filesystemRoutes);
  protectedApi.route("/channels", channelRoutes);
  protectedApi.route("/settings", settingsRoutes);
  protectedApi.route("/templates", templateRoutes());
  protectedApi.route("/domain", domainRoutes);
  protectedApi.route("/terminal", terminalRoutes);
  protectedApi.route("/stats", statsRoutes);

  // Anti IDE CDP status
  protectedApi.get("/anti/status", async (c) => {
    try {
      const antiCdp = await import("../services/anti-cdp.js");
      const available = await antiCdp.isAntiAvailable();
      return c.json({ available });
    } catch {
      return c.json({ available: false });
    }
  });

  // License activation (protected — only authenticated users can activate)
  protectedApi.route("/license", licenseActivateRoute);

  api.route("/api", protectedApi);

  return api;
}
