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
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
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

// ── Auto-detect MCP servers from Claude config ─────────────────────────

interface DetectedMcpServer {
  id: string;
  name: string;
  type: "stdio" | "streamableHttp" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  source: string; // e.g. "~/.claude.json (global)", "project: /path/to/project"
  alreadyImported: boolean;
}

/** Read and parse a JSON file, returning null on failure */
function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/** Normalize Claude's MCP type names to Companion's type names */
function normalizeType(type: string | undefined): "stdio" | "streamableHttp" | "sse" {
  if (!type || type === "stdio") return "stdio";
  if (type === "sse") return "sse";
  // "http", "url", "streamableHttp" → streamableHttp
  return "streamableHttp";
}

/** Extract MCP servers from a Claude config object's mcpServers field */
function extractMcpServers(
  obj: Record<string, unknown>,
  source: string,
): Omit<DetectedMcpServer, "alreadyImported">[] {
  const mcpServers = obj.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!mcpServers || typeof mcpServers !== "object") return [];

  const results: Omit<DetectedMcpServer, "alreadyImported">[] = [];

  for (const [id, config] of Object.entries(mcpServers)) {
    if (!config || typeof config !== "object") continue;

    const type = normalizeType(config.type as string | undefined);
    results.push({
      id,
      name: (config.name as string) ?? id,
      type,
      command: config.command as string | undefined,
      args: config.args as string[] | undefined,
      url: config.url as string | undefined,
      env: config.env as Record<string, string> | undefined,
      headers: config.headers as Record<string, string> | undefined,
      source,
    });
  }

  return results;
}

/** GET /api/mcp-config/detected — discover MCP servers from Claude's config files */
mcpConfigRoutes.get("/detected", (c) => {
  const home = homedir();
  const detected: DetectedMcpServer[] = [];

  // Get already-imported server IDs
  const db = getDb();
  const existingRows = db
    .select()
    .from(settings)
    .where(like(settings.key, `${MCP_PREFIX}%`))
    .all();
  const importedIds = new Set(existingRows.map((r) => r.key.replace(MCP_PREFIX, "")));

  // Source 1: ~/.claude.json — global mcpServers
  const claudeJsonPath = join(home, ".claude.json");
  const claudeJson = readJsonFile(claudeJsonPath);
  if (claudeJson) {
    const global = extractMcpServers(claudeJson, "~/.claude.json (global)");
    detected.push(...global.map((s) => ({ ...s, alreadyImported: importedIds.has(s.id) })));

    // Source 2: per-project mcpServers inside ~/.claude.json projects
    const projects = claudeJson.projects as Record<string, Record<string, unknown>> | undefined;
    if (projects && typeof projects === "object") {
      for (const [projectPath, projectConfig] of Object.entries(projects)) {
        if (!projectConfig || typeof projectConfig !== "object") continue;
        const projectServers = extractMcpServers(projectConfig, `project: ${projectPath}`);
        for (const s of projectServers) {
          // Skip duplicates already found in global
          if (detected.some((d) => d.id === s.id)) continue;
          detected.push({ ...s, alreadyImported: importedIds.has(s.id) });
        }
      }
    }
  }

  // Source 3: ~/.claude/settings.json
  const settingsJsonPath = join(home, ".claude", "settings.json");
  const settingsJson = readJsonFile(settingsJsonPath);
  if (settingsJson) {
    const fromSettings = extractMcpServers(settingsJson, "~/.claude/settings.json");
    for (const s of fromSettings) {
      if (detected.some((d) => d.id === s.id)) continue;
      detected.push({ ...s, alreadyImported: importedIds.has(s.id) });
    }
  }

  // Source 4: ~/.claude/settings.local.json
  const localSettingsPath = join(home, ".claude", "settings.local.json");
  const localSettings = readJsonFile(localSettingsPath);
  if (localSettings) {
    const fromLocal = extractMcpServers(localSettings, "~/.claude/settings.local.json");
    for (const s of fromLocal) {
      if (detected.some((d) => d.id === s.id)) continue;
      detected.push({ ...s, alreadyImported: importedIds.has(s.id) });
    }
  }

  // Mask secrets in detected servers before returning
  const maskedDetected = detected.map((s) => {
    const masked = maskSecrets({ ...s, id: s.id, enabled: true } as McpServerConfig);
    return { ...s, env: masked.env, headers: masked.headers };
  });

  return c.json({ success: true, data: maskedDetected } satisfies ApiResponse);
});

/** POST /api/mcp-config/import/:id — import a detected server into Companion */
mcpConfigRoutes.post("/import/:id", (c) => {
  const id = c.req.param("id");
  const home = homedir();
  const key = `${MCP_PREFIX}${id}`;
  const db = getDb();

  // Check if already exists
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    return c.json({ success: false, error: "Server already imported" } satisfies ApiResponse, 409);
  }

  // Find the server in Claude's config files
  const sources = [
    join(home, ".claude.json"),
    join(home, ".claude", "settings.json"),
    join(home, ".claude", "settings.local.json"),
  ];

  for (const sourcePath of sources) {
    const data = readJsonFile(sourcePath);
    if (!data) continue;

    // Check global mcpServers
    const mcpServers = data.mcpServers as Record<string, Record<string, unknown>> | undefined;
    if (mcpServers?.[id]) {
      const config = mcpServers[id];
      const serverConfig = {
        name: (config.name as string) ?? id,
        type: normalizeType(config.type as string | undefined),
        command: config.command as string | undefined,
        args: config.args as string[] | undefined,
        url: config.url as string | undefined,
        env: config.env as Record<string, string> | undefined,
        headers: config.headers as Record<string, string> | undefined,
        enabled: true,
        description: `Imported from Claude config`,
      };

      db.insert(settings)
        .values({ key, value: JSON.stringify(serverConfig), updatedAt: new Date() })
        .run();

      return c.json({ success: true, data: { id } } satisfies ApiResponse);
    }

    // Check per-project mcpServers
    const projects = data.projects as Record<string, Record<string, unknown>> | undefined;
    if (projects) {
      for (const projectConfig of Object.values(projects)) {
        if (!projectConfig || typeof projectConfig !== "object") continue;
        const projMcp = (projectConfig as Record<string, unknown>).mcpServers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (projMcp?.[id]) {
          const config = projMcp[id];
          const serverConfig = {
            name: (config.name as string) ?? id,
            type: normalizeType(config.type as string | undefined),
            command: config.command as string | undefined,
            args: config.args as string[] | undefined,
            url: config.url as string | undefined,
            env: config.env as Record<string, string> | undefined,
            headers: config.headers as Record<string, string> | undefined,
            enabled: true,
            description: `Imported from Claude config`,
          };

          db.insert(settings)
            .values({ key, value: JSON.stringify(serverConfig), updatedAt: new Date() })
            .run();

          return c.json({ success: true, data: { id } } satisfies ApiResponse);
        }
      }
    }
  }

  return c.json(
    { success: false, error: "Server not found in Claude config" } satisfies ApiResponse,
    404,
  );
});
