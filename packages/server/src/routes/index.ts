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
import { webintelRoutes } from "./webintel.js";
import { codegraphRoutes } from "./codegraph.js";
import { hookRoutes } from "./hooks.js";
import { shareRoutes, publicShareRoutes } from "./share.js";
import { promptRoutes } from "./prompts.js";
import { errorRoutes } from "./errors.js";
import { workflowTemplateRoutes } from "./workflow-templates.js";
import { workflowRoutes } from "./workflows.js";
import { mcpConfigRoutes } from "./mcp-config.js";
import { scheduleRoutes } from "./schedules.js";
import { savedPromptRoutes } from "./saved-prompts.js";
import { modelRoutes } from "./models.js";
import { customPersonaRoutes } from "./custom-personas.js";
import { skillsRoutes } from "./skills.js";
import cliPlatformRoutes from "./cli-platforms.js";
import { createWikiRoutes } from "./wiki.js";
import { workspaceRoutes } from "./workspaces.js";
import { initWorkflowEngine } from "../services/workflow-engine.js";
import { apiKeyAuth } from "../middleware/auth.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { getLicense, hasFeature } from "../services/license.js";
import type { WsBridge } from "../services/ws-bridge.js";
import type { BotRegistry } from "../telegram/bot-registry.js";
import type { ApiResponse } from "@companion/shared";

// General rate limit: 100 req/min per IP on all /api/* routes.
// Excludes WebSocket upgrade requests (they don't pass through Hono middleware)
// and the health endpoint (which has no path prefix match issue but is cheap).
const generalRateLimit = createRateLimit({ max: 100, windowMs: 60_000 });

// Strict rate limit: 10 POST /api/sessions per minute (session creation).
const sessionCreateRateLimit = createRateLimit({
  max: 10,
  windowMs: 60_000,
  method: "POST",
});

/** Middleware: require a specific feature to be unlocked */
function requireFeature(feature: string) {
  return async (
    c: { json: (body: ApiResponse, status: number) => Response },
    next: () => Promise<void>,
  ) => {
    if (!hasFeature(feature)) {
      return c.json(
        {
          success: false,
          error: `This feature requires Companion Pro. Upgrade to unlock.`,
        } satisfies ApiResponse,
        403,
      );
    }
    return next();
  };
}

export function createRoutes(bridge: WsBridge, botRegistry: BotRegistry): Hono {
  const api = new Hono();

  // Apply general rate limit to all /api/* routes except /api/health
  api.use("/api/*", async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    // Skip health endpoint — cheap, no auth, used by uptime monitors
    if (pathname === "/api/health") return next();
    return generalRateLimit(c, next);
  });

  // Strict rate limit specifically for session creation
  api.use("/api/sessions", sessionCreateRateLimit);

  // Public routes
  api.route("/api", healthRoutes);

  // Hook receiver — no auth (Claude Code CLI posts directly)
  api.route("/api/hooks", hookRoutes(bridge));

  // Public share validation (no auth — spectators use this)
  api.route("/api", publicShareRoutes);

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
  protectedApi.route("/channels", channelRoutes(bridge));
  protectedApi.route("/settings", settingsRoutes);
  protectedApi.route("/templates", templateRoutes());
  // PRO-gated routes
  const domainGated = new Hono();
  domainGated.use("*", requireFeature("domain_config"));
  domainGated.route("/", domainRoutes);
  protectedApi.route("/domain", domainGated);

  protectedApi.route("/terminal", terminalRoutes);
  protectedApi.route("/stats", statsRoutes);

  const webintelGated = new Hono();
  webintelGated.use("*", requireFeature("web_intel"));
  webintelGated.route("/", webintelRoutes);
  protectedApi.route("/webintel", webintelGated);

  const codegraphGated = new Hono();
  codegraphGated.use("*", requireFeature("codegraph"));
  codegraphGated.route("/", codegraphRoutes);
  protectedApi.route("/codegraph", codegraphGated);
  protectedApi.route("/", shareRoutes);
  protectedApi.route("/prompts", promptRoutes(bridge));
  protectedApi.route("/errors", errorRoutes);
  protectedApi.route("/workflow-templates", workflowTemplateRoutes);
  protectedApi.route("/workflows", workflowRoutes(bridge));
  protectedApi.route("/mcp-config", mcpConfigRoutes);
  protectedApi.route("/schedules", scheduleRoutes(bridge));
  protectedApi.route("/saved-prompts", savedPromptRoutes);
  protectedApi.route("/models", modelRoutes);
  const personasGated = new Hono();
  personasGated.use("*", requireFeature("personas"));
  personasGated.route("/", customPersonaRoutes());
  protectedApi.route("/custom-personas", personasGated);
  protectedApi.route("/skills", skillsRoutes);
  protectedApi.route("/cli-platforms", cliPlatformRoutes);
  protectedApi.route("/wiki", createWikiRoutes());
  protectedApi.route("/workspaces", workspaceRoutes());

  // Initialize workflow engine with bridge reference
  initWorkflowEngine(bridge);

  // License activation (protected — only authenticated users can activate)
  protectedApi.route("/license", licenseActivateRoute);

  api.route("/api", protectedApi);

  return api;
}
