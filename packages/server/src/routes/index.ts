import { Hono } from "hono";
import { healthRoutes, licenseActivateRoute } from "./health.js";
import { sessionRoutes } from "./sessions.js";
import { projectRoutes } from "./projects.js";
import { telegramRoutes } from "./telegram.js";
import { filesystemRoutes } from "./filesystem.js";
import { channelRoutes } from "./channels.js";
import { settingsRoutes } from "./settings.js";
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
  protectedApi.route("/sessions", sessionRoutes(bridge));
  protectedApi.route("/projects", projectRoutes);
  protectedApi.route("/telegram", telegramRoutes(botRegistry));
  protectedApi.route("/fs", filesystemRoutes);
  protectedApi.route("/channels", channelRoutes);
  protectedApi.route("/settings", settingsRoutes);

  // License activation (protected — only authenticated users can activate)
  protectedApi.route("/license", licenseActivateRoute);

  api.route("/api", protectedApi);

  return api;
}
