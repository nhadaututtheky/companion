/**
 * Domain/proxy configuration routes.
 * Manages Cloudflare Tunnel + Nginx gateway setup from the Settings UI.
 *
 * GET  /api/domain        — Get current domain config
 * PUT  /api/domain        — Save domain config + generate nginx/docker files
 * POST /api/domain/apply  — Attempt to apply config (restart containers via Docker API if socket available)
 * GET  /api/domain/status — Check if gateway + tunnel are running
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { createLogger } from "../logger.js";
import type { ApiResponse } from "@companion/shared";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const log = createLogger("routes:domain");

const domainSchema = z.object({
  mode: z.enum(["off", "tunnel", "nginx"]),
  hostname: z.string().min(1).max(253).optional(),
  tunnelToken: z.string().optional(),
});

// Settings keys
const KEYS = {
  mode: "domain.mode",
  hostname: "domain.hostname",
  tunnelToken: "domain.tunnelToken",
};

function getSetting(key: string): string | undefined {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

function setSetting(key: string, value: string): void {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value, updatedAt: new Date() }).run();
  }
}

export const domainRoutes = new Hono();

// GET /domain — current config
domainRoutes.get("/", (c) => {
  const mode = getSetting(KEYS.mode) ?? "off";
  const hostname = getSetting(KEYS.hostname) ?? "";
  const tunnelToken = getSetting(KEYS.tunnelToken);

  return c.json({
    success: true,
    data: {
      mode,
      hostname,
      hasTunnelToken: !!tunnelToken,
      tunnelToken: tunnelToken ? tunnelToken.slice(0, 8) + "***" : "",
    },
  } satisfies ApiResponse);
});

// PUT /domain — save config + generate files
domainRoutes.put("/", zValidator("json", domainSchema), (c) => {
  const body = c.req.valid("json");

  setSetting(KEYS.mode, body.mode);
  if (body.hostname) setSetting(KEYS.hostname, body.hostname);
  if (body.tunnelToken) setSetting(KEYS.tunnelToken, body.tunnelToken);

  // Generate config files
  if (body.mode !== "off" && body.hostname) {
    try {
      generateConfigs(body.mode, body.hostname, body.tunnelToken);
    } catch (err) {
      log.error("Failed to generate domain configs", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Config saved but failed to generate files",
        } satisfies ApiResponse,
        500,
      );
    }
  }

  log.info("Domain config updated", { mode: body.mode, hostname: body.hostname });

  return c.json({
    success: true,
    data: {
      mode: body.mode,
      hostname: body.hostname,
      filesGenerated: body.mode !== "off",
    },
  } satisfies ApiResponse);
});

// POST /domain/apply — try to apply via Docker API
domainRoutes.post("/apply", async (c) => {
  const mode = getSetting(KEYS.mode) ?? "off";

  if (mode === "off") {
    return c.json({ success: false, error: "Domain not configured" } satisfies ApiResponse, 400);
  }

  // Check if Docker socket is available
  const dockerSocket = "/var/run/docker.sock";
  const hasDocker = existsSync(dockerSocket);

  if (!hasDocker) {
    return c.json({
      success: true,
      data: {
        applied: false,
        manual: true,
        command: "docker compose up -d",
        message: "Docker socket not mounted. Run the command manually on the host.",
      },
    } satisfies ApiResponse);
  }

  // Try to restart via Docker API
  try {
    const containers = ["companion-gateway", "cloudflared"];
    const results: Array<{ name: string; status: string }> = [];

    for (const name of containers) {
      try {
        const res = await fetch(`http://localhost/containers/${name}/restart`, {
          method: "POST",
          // @ts-expect-error — Node fetch supports unix socket via dispatcher
          dispatcher: undefined, // Would need undici for unix socket
        });
        results.push({ name, status: res.ok ? "restarted" : "failed" });
      } catch {
        results.push({ name, status: "not_found" });
      }
    }

    return c.json({
      success: true,
      data: { applied: true, containers: results },
    } satisfies ApiResponse);
  } catch {
    return c.json({
      success: true,
      data: {
        applied: false,
        manual: true,
        command: "docker compose up -d",
        message: "Failed to restart containers. Run the command manually.",
      },
    } satisfies ApiResponse);
  }
});

// GET /domain/status — check if services are running
domainRoutes.get("/status", async (c) => {
  const mode = getSetting(KEYS.mode) ?? "off";
  const hostname = getSetting(KEYS.hostname) ?? "";

  if (mode === "off") {
    return c.json({
      success: true,
      data: { mode: "off", gateway: "off", tunnel: "off" },
    } satisfies ApiResponse);
  }

  // Try to ping the gateway
  let gatewayStatus: string;
  try {
    const res = await fetch("http://companion-gateway:80/api/health", {
      signal: AbortSignal.timeout(3000),
    });
    gatewayStatus = res.ok ? "running" : "error";
  } catch {
    gatewayStatus = "offline";
  }

  return c.json({
    success: true,
    data: {
      mode,
      hostname,
      gateway: gatewayStatus,
      tunnel: mode === "tunnel" ? "configured" : "n/a",
    },
  } satisfies ApiResponse);
});

// ── File generation ───────────────────────────────────────────────────────────

function generateConfigs(mode: string, hostname: string, tunnelToken?: string): void {
  // Find project root — navigate up from server package
  // In Docker: /app/nginx/  On host: D:/Project/Companion/nginx/
  const possibleRoots = [
    "/app", // Docker
    join(process.cwd(), ".."), // Dev (from packages/server)
    process.cwd(), // Dev (from root)
  ];

  let projectRoot = possibleRoots[0]!;
  for (const root of possibleRoots) {
    if (existsSync(join(root, "docker-compose.yml"))) {
      projectRoot = root;
      break;
    }
  }

  const nginxDir = join(projectRoot, "nginx", "conf.d");
  if (!existsSync(nginxDir)) {
    mkdirSync(nginxDir, { recursive: true });
  }

  // 1. Generate gateway.conf (always needed for routing)
  const gatewayConf = generateGatewayConf(hostname);
  writeFileSync(join(nginxDir, "gateway.conf"), gatewayConf, "utf-8");

  // 2. Generate docker-compose.override.yml
  const override = generateComposeOverride(mode, tunnelToken);
  writeFileSync(join(projectRoot, "docker-compose.override.yml"), override, "utf-8");

  log.info("Generated domain config files", { mode, hostname, projectRoot });
}

function generateGatewayConf(hostname: string): string {
  return `# Auto-generated by Companion Settings UI
# Domain: ${hostname}

server {
    listen 80;
    server_name ${hostname};

    location /api/ {
        proxy_pass http://companion:3579/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /ws/ {
        proxy_pass http://companion:3579/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        proxy_pass http://companion:3580;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    client_max_body_size 50M;
}
`;
}

function generateComposeOverride(mode: string, tunnelToken?: string): string {
  const services: string[] = [];

  // Gateway is always needed
  services.push(`  gateway:
    image: nginx:alpine
    container_name: companion-gateway
    restart: unless-stopped
    volumes:
      - ./nginx/conf.d/gateway.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - companion`);

  if (mode === "tunnel" && tunnelToken) {
    services.push(`  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${tunnelToken}
    depends_on:
      - gateway`);
  }

  if (mode === "nginx") {
    services.push(`  nginx:
    image: nginx:alpine
    container_name: companion-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - companion`);
  }

  return `# Auto-generated by Companion Settings UI — do not edit manually
# Apply: docker compose up -d

services:
${services.join("\n\n")}
`;
}
