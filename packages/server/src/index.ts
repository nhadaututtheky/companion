import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRoutes } from "./routes/index.js";
import { createRateLimit } from "./middleware/rate-limit.js";
import { getDb, getSqlite, closeDb } from "./db/client.js";
import { eq } from "drizzle-orm";
import { sessions as sessionsTable } from "./db/schema.js";
import { runMigrations } from "./db/migrate.js";
import { WsBridge } from "./services/ws-bridge.js";
import { BotRegistry } from "./telegram/bot-registry.js";
import { createLogger } from "./logger.js";
import { bulkEndSessions, flushAllWriters } from "./services/session-store.js";
import { terminalLock } from "./services/terminal-lock.js";
import { verifyLicense, checkOrActivateTrial } from "./services/license.js";
import { seedDefaultTemplates } from "./services/templates.js";
import { seedWorkflowTemplates } from "./services/workflow-templates.js";
import { DEFAULT_PORT, APP_VERSION } from "@companion/shared";
import { timingSafeEqual } from "node:crypto";
import { getAccessCredential, warnIfNoAuth } from "./middleware/auth.js";
import { terminalManager } from "./services/terminal-manager.js";
import { cleanupAllHooks, cleanupOrphanHooks } from "./services/adapters/claude-adapter.js";
import * as spectatorBridge from "./services/spectator-bridge.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import { initWorkspaceRuntime } from "./services/workspace-store.js";
import { validateShareToken } from "./services/share-manager.js";
import { registerGlobalErrorHandlers, flushErrors } from "./services/error-tracker.js";
import { join, resolve, dirname } from "node:path";
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
// API_KEY is optional — only needed when exposing server to network.
// License system (Free/Trial/Pro) handles feature gating.
if (process.env.API_KEY) {
  log.info("API_KEY is set — HTTP/WS endpoints require authentication");
} else {
  log.info("No API_KEY configured — all requests allowed (local-only access)");
}

// Initialize DB and run pending migrations
getDb();
runMigrations();

// Seed default session templates + workflow templates
seedDefaultTemplates();
seedWorkflowTemplates();

// Register global error handlers for tracking
registerGlobalErrorHandlers();

// Warn if no auth credentials configured
warnIfNoAuth();

// Initialize workspace runtime state from DB
initWorkspaceRuntime();

// On startup, mark all non-terminal sessions as ended (server restarted, all in-memory state gone)
const startupCleaned = bulkEndSessions();
if (startupCleaned > 0) {
  log.info("Startup cleanup: marked zombie sessions as ended", { count: startupCleaned });
}

// Cleanup orphan hooks from previous runs (prevents ECONNREFUSED in standalone Claude Code)
try {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare("SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL")
    .all() as Array<{ cwd: string }>;
  const dirs = rows.map((r) => r.cwd).filter(Boolean);
  if (dirs.length > 0) {
    const orphansCleaned = cleanupOrphanHooks(dirs);
    if (orphansCleaned > 0) {
      log.info("Startup cleanup: removed orphan hooks", { count: orphansCleaned });
    }
  }
} catch {
  // DB might not have sessions table yet — skip
}

// ── License / Trial verification ────────────────────────────────────────────
const licenseKey = process.env.COMPANION_LICENSE_KEY;
if (licenseKey) {
  // Force skip cache when key is explicitly set — always verify against server
  verifyLicense(licenseKey, { skipCache: true })
    .then((license) => {
      if (license.valid) {
        log.info(
          `License: ${license.tier.toUpperCase()} — max ${license.maxSessions} sessions, expires ${license.expiresAt}`,
        );
      } else {
        log.warn(`License invalid: ${license.error ?? "unknown"} — falling back to trial`);
        return checkOrActivateTrial();
      }
    })
    .catch(() => {
      log.warn("License check failed — activating trial");
      checkOrActivateTrial();
    });
} else {
  // No license key — check or activate 7-day free trial
  checkOrActivateTrial()
    .then((trial) => {
      if (trial.tier === "trial") {
        log.info(`Free trial: ${trial.daysLeft} days left — all Pro features unlocked`);
      } else {
        log.info(
          "Trial expired — free mode (2 sessions). Get a license at https://companion.theio.vn",
        );
      }
    })
    .catch(() => {
      log.info("No license, no trial — free mode (2 sessions)");
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
      } catch {
        /* ignore */
      }

      const eventType =
        status === "error" ? ("session_error" as const) : ("session_complete" as const);

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

// Wire spectator count changes → broadcast to session browsers
spectatorBridge.onSpectatorCountChange((sessionId, count) => {
  const session = bridge.getSession(sessionId);
  if (session) {
    for (const ws of session.browserSockets) {
      try {
        ws.send(JSON.stringify({ type: "spectator_count", count }));
      } catch {
        /* socket error */
      }
    }
  }
});

// ─── Hono App ────────────────────────────────────────────────────────────────

const app = new Hono();

// Global middleware — restrict CORS to known origins
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ??
  `http://localhost:${port},http://localhost:3580,http://localhost:3000`
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  }),
);

// Security headers — X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("X-XSS-Protection", "0");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self' http://localhost:* ws://localhost:*",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
      "style-src 'self' 'unsafe-inline' http://localhost:*",
      "img-src 'self' data: blob: http://localhost:*",
      "connect-src 'self' ws://localhost:* wss: http://localhost:*",
      "font-src 'self' data: http://localhost:*",
    ].join("; ") + ";",
  );
});

app.use("/api/*", createRateLimit({ max: 100, windowMs: 60_000 }));

// Global error handler — sanitize errors, never leak stack traces
app.onError((err, c) => {
  const reqId = c.req.header("x-request-id") ?? "";
  log.error("Unhandled route error", {
    method: c.req.method,
    path: c.req.path,
    error: err.message,
    reqId,
  });
  return c.json({ success: false, error: "Internal server error" }, 500);
});

// Mount routes
const routes = createRoutes(bridge, botRegistry);
app.route("/", routes);

// ─── Static web UI (production) ──────────────────────────────────────────────
// Serve the pre-built Next.js static export from packages/web/out/.
// In dev mode the Next.js dev server runs separately on port 3580.

// Resolve web UI: WEB_PATH env (Tauri), next to executable, or source tree
const WEB_OUT_CANDIDATES: string[] = [
  process.env.WEB_PATH ?? "", // Tauri desktop: resolved resource path
  join(dirname(process.execPath), "web"), // compiled: <install>/web/
  join(import.meta.dir, "../../../packages/web/out"), // dev: source tree
].filter((d) => d.length > 0);
const WEB_OUT_DIR =
  WEB_OUT_CANDIDATES.find((d) => existsSync(d)) ??
  WEB_OUT_CANDIDATES[WEB_OUT_CANDIDATES.length - 1] ??
  "";
const WEB_ENABLED = WEB_OUT_DIR.length > 0 && existsSync(WEB_OUT_DIR);

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
      const sep = process.platform === "win32" ? "\\" : "/";
      if (!resolvedCandidate.startsWith(resolvedBase + sep) && resolvedCandidate !== resolvedBase) {
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
  // Dev mode fallback: show helpful message instead of raw JSON redirect
  app.get("/", (c) => {
    return c.html(`<!DOCTYPE html><html><head><title>Companion</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#f8fafc}
.box{text-align:center;max-width:400px;padding:2rem}.title{font-size:1.5rem;font-weight:700;margin-bottom:1rem}
code{background:#1e293b;padding:2px 8px;border-radius:4px;font-size:0.9rem}
a{color:#60a5fa}</style></head>
<body><div class="box"><div class="title">Companion Server Running</div>
<p>Web UI not found. In dev mode, start the web app separately:</p>
<p><code>bun run dev:web</code></p>
<p style="margin-top:1rem"><a href="/api/health">API Health Check</a></p>
</div></body></html>`);
  });
}

// ─── WebSocket data attached to each connection ──────────────────────────────

interface SocketData {
  sessionId: string;
  type: "session" | "terminal" | "spectator";
  terminalId?: string;
  shareToken?: string;
  sharePermission?: "read-only" | "interactive";
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

      const configuredKey = getAccessCredential();
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

    // Spectator WebSocket: /ws/spectate/:token — no auth, token IS the auth
    if (url.pathname.startsWith("/ws/spectate/")) {
      const token = url.pathname.split("/ws/spectate/")[1];
      if (!token) {
        return new Response("Missing share token", { status: 400 });
      }

      const shareData = validateShareToken(token);
      if (!shareData) {
        return new Response("Invalid or expired share token", { status: 403 });
      }

      const upgraded = server.upgrade(req, {
        data: {
          sessionId: shareData.sessionId,
          type: "spectator" as const,
          shareToken: token,
          sharePermission: shareData.permission,
        },
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
      const configuredKey = getAccessCredential();
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
      if (ws.data.type === "spectator") {
        spectatorBridge.addSpectator(
          ws.data.sessionId,
          ws,
          ws.data.shareToken!,
          ws.data.sharePermission as "read-only" | "interactive",
        );
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
      if (ws.data.type === "spectator") {
        // Interactive spectators can send messages
        if (ws.data.sharePermission !== "interactive") return;
        const msg = String(message);
        if (msg.length > 10_000) return; // Spectator messages limited
        try {
          const parsed = JSON.parse(msg) as { type: string; content?: string };
          if (parsed.type === "user_message" && parsed.content) {
            bridge.sendUserMessage(ws.data.sessionId, parsed.content, "spectator");
          }
        } catch {
          // Malformed — ignore
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
      if (ws.data.type === "spectator") {
        spectatorBridge.removeSpectator(ws.data.sessionId, ws);
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

// Start scheduler for scheduled/recurring sessions
startScheduler(bridge);

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function shutdown() {
  log.info("Shutting down...");

  // Flush all pending DB writes before anything else
  flushAllWriters();
  flushErrors();

  // Stop scheduler
  stopScheduler();

  // Stop health check interval
  bridge.stopHealthCheck();

  // Stop Telegram bots
  botRegistry.stopAll().catch(() => {});

  // Cleanup injected hooks from all project dirs (prevents ECONNREFUSED in standalone Claude Code)
  cleanupAllHooks();

  // Kill all active sessions
  for (const session of bridge.getActiveSessions()) {
    bridge.killSession(session.id);
  }

  // Kill all active terminal processes
  terminalManager.killAll();

  // Release all terminal locks
  terminalLock.releaseAll();

  server.stop();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Export for testing
export { bridge, app };
