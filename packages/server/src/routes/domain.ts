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
  sslMode: z.enum(["manual", "letsencrypt"]).optional(),
  letsencryptEmail: z.string().email().optional(),
});

// Settings keys
const KEYS = {
  mode: "domain.mode",
  hostname: "domain.hostname",
  tunnelToken: "domain.tunnelToken",
  sslMode: "domain.sslMode", // "manual" | "letsencrypt"
  letsencryptEmail: "domain.letsencryptEmail",
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
  const sslMode = getSetting(KEYS.sslMode) ?? "manual";
  const letsencryptEmail = getSetting(KEYS.letsencryptEmail) ?? "";

  return c.json({
    success: true,
    data: {
      mode,
      hostname,
      hasTunnelToken: !!tunnelToken,
      tunnelToken: tunnelToken ? tunnelToken.slice(0, 8) + "***" : "",
      sslMode,
      letsencryptEmail,
    },
  } satisfies ApiResponse);
});

// PUT /domain — save config + generate files
domainRoutes.put("/", zValidator("json", domainSchema), (c) => {
  const body = c.req.valid("json");

  setSetting(KEYS.mode, body.mode);
  if (body.hostname) setSetting(KEYS.hostname, body.hostname);
  if (body.tunnelToken) setSetting(KEYS.tunnelToken, body.tunnelToken);
  if (body.sslMode) setSetting(KEYS.sslMode, body.sslMode);
  if (body.letsencryptEmail) setSetting(KEYS.letsencryptEmail, body.letsencryptEmail);

  // Generate config files
  if (body.mode !== "off" && body.hostname) {
    try {
      const sslMode = body.sslMode ?? (getSetting(KEYS.sslMode) as "manual" | "letsencrypt" | undefined) ?? "manual";
      const email = body.letsencryptEmail ?? getSetting(KEYS.letsencryptEmail);
      generateConfigs(body.mode, body.hostname, body.tunnelToken, sslMode, email);
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

  // Find project root for docker compose
  const possibleRoots = ["/app", join(process.cwd(), ".."), process.cwd()];
  let projectRoot = possibleRoots[0]!;
  for (const root of possibleRoots) {
    if (existsSync(join(root, "docker-compose.yml"))) {
      projectRoot = root;
      break;
    }
  }

  // Try docker compose up -d via shell
  try {
    const proc = Bun.spawn(["docker", "compose", "up", "-d"], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode === 0) {
      log.info("Docker compose applied successfully", { stdout: stdout.trim() });
      return c.json({
        success: true,
        data: { applied: true, output: (stdout + stderr).trim() },
      } satisfies ApiResponse);
    }

    // docker command exists but failed
    log.warn("Docker compose failed", { exitCode, stderr: stderr.trim() });
    return c.json({
      success: true,
      data: {
        applied: false,
        manual: true,
        command: "docker compose up -d",
        message: stderr.trim() || "Docker compose failed. Run the command manually on the host.",
      },
    } satisfies ApiResponse);
  } catch {
    // docker not available at all
    return c.json({
      success: true,
      data: {
        applied: false,
        manual: true,
        command: "docker compose up -d",
        message: "Docker CLI not available. Run the command manually on the host.",
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

// POST /domain/issue-cert — trigger initial Let's Encrypt certificate issuance
domainRoutes.post("/issue-cert", async (c) => {
  const hostname = getSetting(KEYS.hostname);
  const sslMode = getSetting(KEYS.sslMode);
  const email = getSetting(KEYS.letsencryptEmail);

  if (!hostname || sslMode !== "letsencrypt") {
    return c.json({
      success: false,
      error: "Let's Encrypt not configured. Save domain settings first.",
    } satisfies ApiResponse, 400);
  }

  const emailFlag = email ? `--email ${email}` : "--register-unsafely-without-email";

  try {
    const proc = Bun.spawn(
      [
        "docker", "compose", "run", "--rm", "certbot",
        "certbot", "certonly", "--webroot",
        "-w", "/var/www/certbot",
        "-d", hostname,
        emailFlag,
        "--agree-tos",
        "--non-interactive",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = (stdout + stderr).trim();

    if (exitCode === 0) {
      log.info("Let's Encrypt certificate issued", { hostname });

      // Reload nginx to pick up new cert
      try {
        await Bun.spawn(["docker", "exec", "companion-gateway", "nginx", "-s", "reload"], {
          stdout: "ignore",
          stderr: "ignore",
        }).exited;
      } catch {
        // Non-critical — user can restart manually
      }

      return c.json({
        success: true,
        data: { issued: true, hostname, output },
      } satisfies ApiResponse);
    }

    log.warn("Certbot failed", { exitCode, output });
    return c.json({
      success: false,
      error: output || "Certbot failed — check that your domain points to this server.",
    } satisfies ApiResponse, 500);
  } catch (err) {
    return c.json({
      success: false,
      error: `Docker not available: ${String(err)}`,
    } satisfies ApiResponse, 500);
  }
});

// ── File generation ───────────────────────────────────────────────────────────

function generateConfigs(
  mode: string,
  hostname: string,
  tunnelToken?: string,
  sslMode?: string,
  letsencryptEmail?: string,
): void {
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

  const useLetsEncrypt = mode === "nginx" && sslMode === "letsencrypt";

  // 1. Generate gateway.conf (always needed for routing)
  const gatewayConf = generateGatewayConf(hostname, useLetsEncrypt);
  writeFileSync(join(nginxDir, "gateway.conf"), gatewayConf, "utf-8");

  // 2. Ensure certs dir exists for Let's Encrypt volume mount
  const certsDir = join(projectRoot, "nginx", "certs");
  if (!existsSync(certsDir)) {
    mkdirSync(certsDir, { recursive: true });
  }

  // 3. Generate docker-compose.override.yml
  const override = generateComposeOverride(mode, tunnelToken, useLetsEncrypt, hostname, letsencryptEmail);
  writeFileSync(join(projectRoot, "docker-compose.override.yml"), override, "utf-8");

  log.info("Generated domain config files", { mode, hostname, projectRoot });
}

function generateGatewayConf(hostname: string, letsEncrypt = false): string {
  const proxyLocations = `
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

    client_max_body_size 50M;`;

  if (!letsEncrypt) {
    return `# Auto-generated by Companion Settings UI
# Domain: ${hostname}

server {
    listen 80;
    server_name ${hostname};
${proxyLocations}
}
`;
  }

  // Let's Encrypt: HTTP server for ACME + HTTPS with certbot certs
  return `# Auto-generated by Companion Settings UI
# Domain: ${hostname} — Let's Encrypt SSL

# HTTP → ACME challenge + redirect
server {
    listen 80;
    server_name ${hostname};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl;
    server_name ${hostname};

    ssl_certificate /etc/letsencrypt/live/${hostname}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${hostname}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
${proxyLocations}
}
`;
}

function generateComposeOverride(
  mode: string,
  tunnelToken?: string,
  letsEncrypt = false,
  hostname?: string,
  letsencryptEmail?: string,
): string {
  const services: string[] = [];

  if (mode === "tunnel") {
    // Tunnel mode: gateway + cloudflared
    services.push(`  gateway:
    image: nginx:alpine
    container_name: companion-gateway
    restart: unless-stopped
    volumes:
      - ./nginx/conf.d/gateway.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - companion`);

    if (tunnelToken) {
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
  }

  if (mode === "nginx") {
    if (letsEncrypt && hostname) {
      // Let's Encrypt: nginx with certbot volumes + certbot service
      const _emailFlag = letsencryptEmail ? `--email ${letsencryptEmail}` : "--register-unsafely-without-email";
      services.push(`  gateway:
    image: nginx:alpine
    container_name: companion-gateway
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d/gateway.conf:/etc/nginx/conf.d/default.conf:ro
      - certbot-webroot:/var/www/certbot:ro
      - certbot-certs:/etc/letsencrypt:ro
    depends_on:
      - companion`);

      /* eslint-disable no-useless-escape -- escapes required inside template literal to prevent ${} interpolation */
      services.push(`  certbot:
    image: certbot/certbot:latest
    container_name: companion-certbot
    volumes:
      - certbot-webroot:/var/www/certbot
      - certbot-certs:/etc/letsencrypt
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot --quiet; sleep 12h & wait \$\$\{!\}; done'"
    depends_on:
      - gateway`);
      /* eslint-enable no-useless-escape */
    } else {
      // Manual SSL: mount certs directory
      services.push(`  gateway:
    image: nginx:alpine
    container_name: companion-gateway
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d/gateway.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - companion`);
    }
  }

  // Docker volumes for Let's Encrypt
  const volumes = letsEncrypt
    ? `\nvolumes:\n  certbot-webroot:\n  certbot-certs:\n`
    : "";

  return `# Auto-generated by Companion Settings UI — do not edit manually
# Apply: docker compose up -d

services:
${services.join("\n\n")}
${volumes}`;
}
