import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRoutes } from "./routes/index.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { getDb, closeDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { WsBridge } from "./services/ws-bridge.js";
import { BotRegistry } from "./telegram/bot-registry.js";
import { createLogger } from "./logger.js";
import { bulkEndSessions } from "./services/session-store.js";
import { verifyLicense, getLicense } from "./services/license.js";
import { DEFAULT_PORT, APP_VERSION } from "@companion/shared";

const log = createLogger("server");

// ─── Initialize ──────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

// ── Startup validation ────────────────────────────────────────────────────────
if (!process.env.API_KEY) {
  if (process.env.NODE_ENV === "production") {
    log.error("API_KEY is not set — refusing to start in production without authentication");
    process.exit(1);
  } else {
    log.warn("⚠️  API_KEY is not set — all requests will be allowed (dev mode only)");
  }
}

// Initialize DB and run pending migrations
getDb();
runMigrations();

// On startup, mark all non-terminal sessions as ended (server restarted, all in-memory state gone)
const startupCleaned = bulkEndSessions();
if (startupCleaned > 0) {
  log.info("Startup cleanup: marked zombie sessions as ended", { count: startupCleaned });
}

// ── License verification ────────────────────────────────────────────────────
const licenseKey = process.env.COMPANION_LICENSE_KEY;
if (licenseKey) {
  verifyLicense(licenseKey).then((license) => {
    if (license.valid) {
      log.info(`License: ${license.tier.toUpperCase()} tier — ${license.features.length} features, max ${license.maxSessions} sessions`);
    } else {
      log.warn(`License invalid: ${license.error ?? "unknown"} — running in free mode`);
    }
  }).catch(() => {
    log.warn("License check failed — running in free mode");
  });
} else {
  log.info("No COMPANION_LICENSE_KEY set — running in free mode (1 session, basic features)");
}

// ─── WsBridge ────────────────────────────────────────────────────────────────

const bridge = new WsBridge({
  onStatusChange: (sessionId, status) => {
    log.debug("Session status changed", { sessionId, status });
  },
});

// ─── Telegram Bot Registry ───────────────────────────────────────────────────

const botRegistry = new BotRegistry(bridge);

// Auto-start bots (non-blocking)
botRegistry.autoStart().catch((err) => {
  log.error("Failed to auto-start Telegram bots", { error: String(err) });
});

// ─── Hono App ────────────────────────────────────────────────────────────────

const app = new Hono();

// Global middleware — restrict CORS to known origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3580,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use("*", cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0]!,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true,
}));
app.use("/api/*", rateLimiter());

// Mount routes
const routes = createRoutes(bridge, botRegistry);
app.route("/", routes);

// Root redirect
app.get("/", (c) => c.redirect("/api/health"));

// ─── WebSocket data attached to each connection ──────────────────────────────

interface SocketData {
  sessionId: string;
}

// ─── Bun.serve with WebSocket upgrade ────────────────────────────────────────

const server = Bun.serve<SocketData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade: /ws/:sessionId
    if (url.pathname.startsWith("/ws/")) {
      const sessionId = url.pathname.split("/ws/")[1];
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 });
      }

      // Authenticate WebSocket — check api_key query param or Authorization header
      const configuredKey = process.env.API_KEY;
      if (configuredKey) {
        const wsKey = url.searchParams.get("api_key") ??
          req.headers.get("Authorization")?.replace("Bearer ", "");
        if (!wsKey || wsKey !== configuredKey) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const upgraded = server.upgrade(req, {
        data: { sessionId },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // All other requests go through Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    open(ws) {
      const { sessionId } = ws.data;
      log.debug("WebSocket connected", { sessionId });
      bridge.addBrowser(sessionId, ws);
    },
    message(ws, message) {
      const { sessionId } = ws.data;
      bridge.handleBrowserMessage(sessionId, String(message));
    },
    close(ws) {
      const { sessionId } = ws.data;
      log.debug("WebSocket disconnected", { sessionId });
      bridge.removeBrowser(sessionId, ws);
    },
  },
});

log.info(`Companion v${APP_VERSION} running`, {
  port,
  url: `http://localhost:${port}`,
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function shutdown() {
  log.info("Shutting down...");

  // Stop health check interval
  bridge.stopHealthCheck();

  // Stop Telegram bots
  botRegistry.stopAll().catch(() => {});

  // Kill all active sessions
  for (const session of bridge.getActiveSessions()) {
    bridge.killSession(session.id);
  }

  server.stop();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Export for testing
export { bridge, app };
