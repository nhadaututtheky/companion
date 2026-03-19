import { Hono } from "hono";
import { healthRoutes } from "./health.js";
import { sessionRoutes } from "./sessions.js";
import { projectRoutes } from "./projects.js";
import { telegramRoutes } from "./telegram.js";
import { filesystemRoutes } from "./filesystem.js";
import { channelRoutes } from "./channels.js";
import { settingsRoutes } from "./settings.js";
import { apiKeyAuth } from "../middleware/auth.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BotRegistry } from "../telegram/bot-registry.js";

export function createRoutes(bridge: WsBridge, botRegistry: BotRegistry): Hono {
  const api = new Hono();

  // Public routes
  api.route("/api", healthRoutes);

  // Protected routes
  const protectedApi = new Hono();
  protectedApi.use("*", apiKeyAuth());
  protectedApi.route("/sessions", sessionRoutes(bridge));
  protectedApi.route("/projects", projectRoutes);
  protectedApi.route("/telegram", telegramRoutes(botRegistry));
  protectedApi.route("/fs", filesystemRoutes);
  protectedApi.route("/channels", channelRoutes);
  protectedApi.route("/settings", settingsRoutes);

  api.route("/api", protectedApi);

  return api;
}
