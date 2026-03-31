import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRoutes } from "./routes/index.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { getDb, closeDb } from "./db/client.js";
import { eq } from "drizzle-orm";
import { sessions as sessionsTable } from "./db/schema.js";
import { runMigrations } from "./db/migrate.js";
import { WsBridge } from "./services/ws-bridge.js";
import { BotRegistry } from "./telegram/bot-registry.js";
import { createLogger } from "./logger.js";
import { bulkEndSessions } from "./services/session-store.js";
import { verifyLicense, checkOrActivateTrial } from "./services/license.js";
import { seedDefaultTemplates } from "./services/templates.js";
import { DEFAULT_PORT, APP_VERSION } from "@companion/shared";
import { timingSafeEqual } from "node:crypto";
import { terminalManager } from "./services/terminal-manager.js";
import { join, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

const log = createLogger("server");

/** Timing-safe string comparison for auth — prevents oracle attacks */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const padded = Buffer.alloc(b.length);
    timingSafeEqual(Buffer.from(a.padEnd(b.length, "\0")), padded);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

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

// Seed default session templates
seedDefaultTemplates();

// On startup, mark all non-terminal sessions as ended (server restarted, all in-memory state gone)
const startupCleaned = bulkEndSessions();
if (startupCleaned > 0) {
  log.info("Startup cleanup: marked zombie sessions as ended", { count: startupCleaned });
}

// ── License / Trial verification ────────────────────────────────────────────
const licenseKey = process.env.COMPANION_LICENSE_KEY;
if (licenseKey) {
  verifyLicense(licenseKey).then((license) => {
    if (license.valid) {
      log.info(`License: ${license.tier.toUpperCase()} — max ${license.maxSessions} sessions, expires ${license.expiresAt}`);
    } else {
      log.warn(`License invalid: ${license.error ?? "unknown"} — falling back to trial`);
      return checkOrActivateTrial();
    }
  }).catch(() => {
    log.warn("License check failed — activating trial");
    checkOrActivateTrial();
  });
} else {
  // No license key — check or activate 7-day free trial
  checkOrActivateTrial().then((trial) => {
    if (trial.tier === "trial") {
      log.info(`Free trial: ${trial.daysLeft} days left — all Pro features unlocked`);
    } else {
      log.info("Trial expired — free mode (1 session). Get a license at https://companion.theio.vn — buy at https://pay.theio.vn");
    }
  }).catch(() => {
    log.info("No license, no trial — free mode (1 session)");
  });
}

// ─── WsBridge ────────────────────────────────────────────────────────────────

// Declared before WsBridge so the onStatusChange closure can reference it safely.
// eslint-disable-next-line prefer-const
let botRegistry: BotRegistry;

const bridge = new WsBridge({
  onStatusChange: (sessionId, status) => {
    log.debug("Session status changed", { sessionId, status });

    // Send Telegram notifications on terminal states
    if (status === "ended" || status === "error") {
      if (!botRegistry) return; // guard: registry not yet initialized

      const session = bridge.getSession(sessionId);
      if (!session) return;

      const s = session.state;
      const durationMs = Date.now() - s.started_at;

      // Look up projectSlug from DB (not on SessionState)
      let projectSlug: string | undefined;
      try {
        const row = getDb()
          .select({ projectSlug: sessionsTable.projectSlug })
          .from(sessionsTable)
          .where(eq(sessionsTable.id, sessionId))
          .get();
        projectSlug = row?.projectSlug ?? undefined;
      } catch { /* ignore */ }

      const eventType =
        status === "error"
          ? "session_error" as const
          : "session_complete" as const;

      void botRegistry.sendNotification({
        type: eventType,
        sessionId,
        shortId: s.short_id,
        projectSlug,
        model: s.model,
        costUsd: s.total_cost_usd,
        turns: s.num_turns,
        durationMs,
        reason: status === "error" ? session.lastStderrLines?.join("\n")?.slice(0, 200) : undefined,
      });
    }
  },
});

// ─── Telegram Bot Registry ───────────────────────────────────────────────────

botRegistry = new BotRegistry(bridge);

// Auto-start bots (non-blocking)
botRegistry.autoStart().catch((err) => {
  log.error("Failed to auto-start Telegram bots", { error: String(err) });
});

// ─── Hono App ────────────────────────────────────────────────────────────────

const app = new Hono();

// Global middleware — restrict CORS to known origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? `http://localhost:${port},http://localhost:3580,http://localhost:3000`)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use("*", cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : null,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  credentials: true,
}));

// Security headers — X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("X-XSS-Protection", "0");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.res.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:;");
});

app.use("/api/*", rateLimiter());

// Mount routes
const routes = createRoutes(bridge, botRegistry);
app.route("/", routes);

// ─── Static web UI (production) ──────────────────────────────────────────────
// Serve the pre-built Next.js static export from packages/web/out/.
// In dev mode the Next.js dev server runs separately on port 3580.

const WEB_OUT_DIR = join(import.meta.dir, "../../../packages/web/out");
const WEB_ENABLED = existsSync(WEB_OUT_DIR);

if (WEB_ENABLED) {
  log.info("Serving web UI from static export", { dir: WEB_OUT_DIR });

  app.get("*", async (c) => {
    const pathname = new URL(c.req.url).pathname;

    // Strip trailing slash (except root) to find the actual file
    const cleanPath = pathname === "/" ? "/" : pathname.replace(/\/$/, "");

    // Build candidate file paths (Next.js trailingSlash:true uses index.html)
    const candidates: string[] = [];

    if (cleanPath === "/") {
      candidates.push(join(WEB_OUT_DIR, "index.html"));
    } else {
      candidates.push(join(WEB_OUT_DIR, cleanPath));
      candidates.push(join(WEB_OUT_DIR, `${cleanPath}.html`));
      candidates.push(join(WEB_OUT_DIR, cleanPath, "index.html"));
    }

    const resolvedBase = resolve(WEB_OUT_DIR);
    for (const candidate of candidates) {
      const resolvedCandidate = resolve(candidate);
      if (!resolvedCandidate.startsWith(resolvedBase + "/") && resolvedCandidate !== resolvedBase) {
        continue; // path traversal attempt — skip
      }
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        const file = Bun.file(candidate);
        return new Response(file, {
          headers: { "Content-Type": file.type },
        });
      }
    }

    // SPA fallback — serve index.html for unknown paths (client-side routing)
    const indexHtml = Bun.file(join(WEB_OUT_DIR, "index.html"));
    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
} else {
  // Dev mode fallback: redirect to Next.js dev server hint
  app.get("/", (c) => c.redirect("/api/health"));
}

// ─── WebSocket data attached to each connection ──────────────────────────────

interface SocketData {
  sessionId: string;
  type: "session" | "terminal";
  terminalId?: string;
}

// ─── Bun.serve with WebSocket upgrade ────────────────────────────────────────

const server = Bun.serve<SocketData>({
  port,
  fetch(req, server) {
    const url = new URL(req.url);

    // Terminal WebSocket: /ws/terminal/:id — must be checked before the generic /ws/ path
    if (url.pathname.startsWith("/ws/terminal/")) {
      const terminalId = url.pathname.split("/ws/terminal/")[1];
      if (!terminalId) {
        return new Response("Missing terminal ID", { status: 400 });
      }

      const configuredKey = process.env.API_KEY;
      if (configuredKey) {
        const wsKey =
          req.headers.get("Sec-WebSocket-Protocol") ??
          req.headers.get("Authorization")?.replace("Bearer ", "");
        if (!wsKey || !safeCompare(wsKey, configuredKey)) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const upgraded = server.upgrade(req, {
        data: { sessionId: "", type: "terminal" as const, terminalId },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Session WebSocket: /ws/:sessionId
    if (url.pathname.startsWith("/ws/")) {
      const sessionId = url.pathname.split("/ws/")[1];
      if (!sessionId) {
        return new Response("Missing session ID", { status: 400 });
      }

      // Authenticate WebSocket — check Sec-WebSocket-Protocol, Authorization header, or query param (fallback)
      const configuredKey = process.env.API_KEY;
      if (configuredKey) {
        const wsKey =
          req.headers.get("Sec-WebSocket-Protocol") ??
          req.headers.get("Authorization")?.replace("Bearer ", "");
        if (!wsKey || !safeCompare(wsKey, configuredKey)) {
          return new Response("Unauthorized", { status: 401 });
        }
      }

      const upgraded = server.upgrade(req, {
        data: { sessionId, type: "session" as const },
      });

      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // All other requests go through Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },
  websocket: {
    open(ws) {
      if (ws.data.type === "terminal" && ws.data.terminalId) {
        const subscribed = terminalManager.subscribe(ws.data.terminalId, ws);
        if (!subscribed) {
          ws.close(1008, "Terminal not found");
        }
        return;
      }
      const { sessionId } = ws.data;
      log.debug("WebSocket connected", { sessionId });
      bridge.addBrowser(sessionId, ws);
    },
    message(ws, message) {
      if (ws.data.type === "terminal" && ws.data.terminalId) {
        const msg = String(message);
        try {
          const parsed = JSON.parse(msg) as Record<string, unknown>;
          if (parsed.type === "input" && typeof parsed.data === "string") {
            terminalManager.write(ws.data.terminalId, parsed.data);
          } else if (
            parsed.type === "resize" &&
            typeof parsed.cols === "number" &&
            typeof parsed.rows === "number"
          ) {
            terminalManager.resize(ws.data.terminalId, parsed.cols, parsed.rows);
          }
        } catch {
          // Malformed JSON — ignore
        }
        return;
      }
      const { sessionId } = ws.data;
      const msg = String(message);
      if (msg.length > 100_000) {
        ws.close(1009, "Message too large");
        return;
      }
      bridge.handleBrowserMessage(sessionId, msg);
    },
    close(ws) {
      if (ws.data.type === "terminal" && ws.data.terminalId) {
        terminalManager.unsubscribe(ws.data.terminalId, ws);
        return;
      }
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

  // Kill all active terminal processes
  terminalManager.killAll();

  server.stop();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Export for testing
export { bridge, app };
