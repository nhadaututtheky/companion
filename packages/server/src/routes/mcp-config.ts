/**
 * MCP Server Configuration routes.
 * Manages MCP server entries stored in the settings KV table.
 *
 * Each MCP server config is stored as: mcp.servers.<id> = JSON string
 *
 * GET    /api/mcp-config/servers        — list all configured servers
 * GET    /api/mcp-config/servers/:id    — get single server config
 * PUT    /api/mcp-config/servers/:id    — create/update server config
 * DELETE /api/mcp-config/servers/:id    — delete server config
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, like } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import type { ApiResponse } from "@companion/shared";

const MCP_PREFIX = "mcp.servers.";

// ── Schema ─────────────────────────────────────────────────────────────

const mcpServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["stdio", "streamableHttp", "sse"]),
  /** For stdio: the command to run */
  command: z.string().optional(),
  /** For stdio: command arguments */
  args: z.array(z.string()).optional(),
  /** For streamableHttp/sse: the URL */
  url: z.string().optional(),
  /** Environment variables */
  env: z.record(z.string()).optional(),
  /** HTTP headers (for streamableHttp/sse) */
  headers: z.record(z.string()).optional(),
  /** Whether this server is enabled */
  enabled: z.boolean().default(true),
  /** Optional description */
  description: z.string().optional(),
});

type McpServerConfig = z.infer<typeof mcpServerSchema> & { id: string };

// ── Helpers ────────────────────────────────────────────────────────────

function maskSecrets(config: McpServerConfig): McpServerConfig {
  const masked = { ...config };

  // Mask env values that look like secrets
  if (masked.env) {
    masked.env = { ...masked.env };
    for (const [key, val] of Object.entries(masked.env)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("key") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password")
      ) {
        masked.env[key] = val.length > 8 ? val.slice(0, 4) + "***" + val.slice(-4) : "***";
      }
    }
  }

  // Mask auth headers
  if (masked.headers) {
    masked.headers = { ...masked.headers };
    for (const [key, val] of Object.entries(masked.headers)) {
      if (key.toLowerCase() === "authorization") {
        masked.headers[key] = val.length > 12 ? val.slice(0, 8) + "***" + val.slice(-4) : "***";
      }
    }
  }

  return masked;
}

// ── Routes ─────────────────────────────────────────────────────────────

export const mcpConfigRoutes = new Hono();

// List all MCP servers
mcpConfigRoutes.get("/servers", (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(like(settings.key, `${MCP_PREFIX}%`))
    .all();

  const servers: McpServerConfig[] = rows
    .map((row) => {
      try {
        const config = JSON.parse(row.value) as McpServerConfig;
        config.id = row.key.replace(MCP_PREFIX, "");
        return maskSecrets(config);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as McpServerConfig[];

  return c.json({ success: true, data: servers } satisfies ApiResponse);
});

// Get single MCP server
mcpConfigRoutes.get("/servers/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, `${MCP_PREFIX}${id}`))
    .get();

  if (!row) {
    return c.json({ success: false, error: "MCP server not found" } satisfies ApiResponse, 404);
  }

  try {
    const config = JSON.parse(row.value) as McpServerConfig;
    config.id = id;
    return c.json({ success: true, data: maskSecrets(config) } satisfies ApiResponse);
  } catch {
    return c.json({ success: false, error: "Invalid server config" } satisfies ApiResponse, 500);
  }
});

// Create/update MCP server
mcpConfigRoutes.put("/servers/:id", zValidator("json", mcpServerSchema), (c) => {
  const id = c.req.param("id");
  const config = c.req.valid("json");
  const key = `${MCP_PREFIX}${id}`;
  const db = getDb();

  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  // If updating, merge env/headers to preserve masked secrets
  if (existing) {
    try {
      const prev = JSON.parse(existing.value) as McpServerConfig;
      // Restore masked env values from previous config
      if (config.env && prev.env) {
        for (const [k, v] of Object.entries(config.env)) {
          if (v.includes("***") && prev.env[k]) {
            config.env[k] = prev.env[k];
          }
        }
      }
      if (config.headers && prev.headers) {
        for (const [k, v] of Object.entries(config.headers)) {
          if (v.includes("***") && prev.headers[k]) {
            config.headers[k] = prev.headers[k];
          }
        }
      }
    } catch {
      // ignore merge errors
    }

    db.update(settings)
      .set({ value: JSON.stringify(config), updatedAt: new Date() })
      .where(eq(settings.key, key))
      .run();
  } else {
    db.insert(settings)
      .values({ key, value: JSON.stringify(config), updatedAt: new Date() })
      .run();
  }

  return c.json({ success: true, data: { id } } satisfies ApiResponse);
});

// Delete MCP server
mcpConfigRoutes.delete("/servers/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  db.delete(settings)
    .where(eq(settings.key, `${MCP_PREFIX}${id}`))
    .run();

  return c.json({ success: true } satisfies ApiResponse);
});
