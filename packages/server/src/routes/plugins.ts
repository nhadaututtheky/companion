/**
 * Plugin management routes.
 * GET  /api/plugins         — list installed plugins with metadata + enabled state
 * POST /api/plugins/toggle  — enable/disable a plugin
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import type { ApiResponse } from "@companion/shared";
import { createLogger } from "../logger.js";

const log = createLogger("plugins");

// ── Types ───────────────────────────────────────────────────────────

interface PluginMeta {
  name: string;
  description?: string;
  version?: string;
  author?: { name?: string };
  repository?: string;
  homepage?: string;
  license?: string;
  keywords?: string[];
  premium?: Record<string, unknown>;
}

interface PluginInfo {
  /** Plugin key in settings.json, e.g. "rune@rune-kit" */
  key: string;
  /** Plugin name, e.g. "rune" */
  name: string;
  /** Registry, e.g. "rune-kit" or "claude-plugins-official" */
  registry: string;
  /** Whether plugin is currently enabled */
  enabled: boolean;
  /** Metadata from plugin.json */
  meta: PluginMeta | null;
  /** What the plugin provides */
  provides: {
    agents: string[];
    commands: string[];
    skills: string[];
    mcpServers: string[];
    hooks: boolean;
  };
  /** Path to plugin cache directory */
  cachePath: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const CACHE_DIR = join(homedir(), ".claude", "plugins", "cache");

function readSettings(): Record<string, unknown> {
  try {
    if (existsSync(SETTINGS_PATH)) {
      return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    // corrupted settings
  }
  return {};
}

function writeSettings(settings: Record<string, unknown>): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

function getEnabledPlugins(): Record<string, boolean> {
  const settings = readSettings();
  return (settings.enabledPlugins as Record<string, boolean>) ?? {};
}

/** Validate plugin key format — only safe chars allowed */
const SAFE_KEY_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

/** Find the cached plugin directory (latest version) */
function findPluginCacheDir(registry: string, name: string): string | null {
  const registryDir = join(CACHE_DIR, registry, name);

  // Path confinement — prevent traversal outside CACHE_DIR
  const resolved = resolve(registryDir);
  const cacheRoot = resolve(CACHE_DIR);
  if (!resolved.startsWith(cacheRoot + "\\") && !resolved.startsWith(cacheRoot + "/")) return null;

  if (!existsSync(registryDir)) return null;

  try {
    const versions = readdirSync(registryDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("temp_"))
      .map((e) => e.name);

    if (versions.length === 0) return null;
    // Use last entry (typically latest version or hash)
    return join(registryDir, versions[versions.length - 1]!);
  } catch {
    return null;
  }
}

/** Only allow http(s) URLs — block javascript:, data:, etc. */
function sanitizeUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") return url;
  } catch {
    /* invalid URL */
  }
  return undefined;
}

/** Read plugin.json metadata */
function readPluginMeta(cacheDir: string): PluginMeta | null {
  const metaPath = join(cacheDir, ".claude-plugin", "plugin.json");
  try {
    if (existsSync(metaPath)) {
      const raw = JSON.parse(readFileSync(metaPath, "utf-8")) as PluginMeta;
      // Sanitize URLs to prevent XSS via javascript: href
      raw.homepage = sanitizeUrl(raw.homepage) as string | undefined;
      raw.repository = sanitizeUrl(raw.repository) as string | undefined;
      return raw;
    }
  } catch {
    // invalid json
  }
  return null;
}

/** List directory names (non-hidden) */
function listDirNames(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .map((e) => e.name.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

/** Scan what a plugin provides */
function scanPluginProvides(cacheDir: string): PluginInfo["provides"] {
  let agentFiles: string[] = [];
  try {
    const agentsDir = join(cacheDir, "agents");
    if (existsSync(agentsDir)) {
      agentFiles = readdirSync(agentsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
    }
  } catch {
    // no agents
  }

  let commandFiles: string[] = [];
  try {
    const commandsDir = join(cacheDir, "commands");
    if (existsSync(commandsDir)) {
      commandFiles = readdirSync(commandsDir, { withFileTypes: true })
        .filter((e) => e.name.endsWith(".md") || e.isDirectory())
        .map((e) => e.name.replace(/\.md$/, ""));
    }
  } catch {
    // no commands
  }

  let skillFiles: string[] = [];
  try {
    const skillsDir = join(cacheDir, "skills");
    if (existsSync(skillsDir)) {
      skillFiles = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.name.endsWith(".md"))
        .map((e) => e.name.replace(/\.md$/, ""));
    }
  } catch {
    // no skills
  }

  let mcpServers: string[] = [];
  try {
    const mcpPath = join(cacheDir, ".mcp.json");
    if (existsSync(mcpPath)) {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf-8")) as Record<string, unknown>;
      mcpServers = Object.keys(mcp);
    }
  } catch {
    // no mcp
  }

  const hasHooks = existsSync(join(cacheDir, "hooks"));

  return {
    agents: agentFiles,
    commands: commandFiles,
    skills: skillFiles,
    mcpServers,
    hooks: hasHooks,
  };
}

/** Parse plugin key "name@registry" */
function parsePluginKey(key: string): { name: string; registry: string } {
  const atIdx = key.indexOf("@");
  if (atIdx === -1) return { name: key, registry: "unknown" };
  return { name: key.slice(0, atIdx), registry: key.slice(atIdx + 1) };
}

// ── Route Definitions ───────────────────────────────────────────────

export const pluginsRoutes = new Hono();

/** GET /api/plugins — list all plugins */
pluginsRoutes.get("/", (c) => {
  const enabledPlugins = getEnabledPlugins();
  const plugins: PluginInfo[] = [];

  for (const [key, enabled] of Object.entries(enabledPlugins)) {
    const { name, registry } = parsePluginKey(key);
    const cacheDir = findPluginCacheDir(registry, name);

    const info: PluginInfo = {
      key,
      name,
      registry,
      enabled,
      meta: cacheDir ? readPluginMeta(cacheDir) : null,
      provides: cacheDir
        ? scanPluginProvides(cacheDir)
        : { agents: [], commands: [], skills: [], mcpServers: [], hooks: false },
      cachePath: cacheDir,
    };

    plugins.push(info);
  }

  // Sort: enabled first, then alphabetical
  plugins.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return c.json({ success: true, data: plugins } satisfies ApiResponse);
});

/** POST /api/plugins/toggle — enable/disable a plugin */
pluginsRoutes.post(
  "/toggle",
  zValidator(
    "json",
    z.object({
      key: z.string().min(1).max(200).regex(SAFE_KEY_RE, "Invalid plugin key format"),
      enabled: z.boolean(),
    }),
  ),
  (c) => {
    const { key, enabled } = c.req.valid("json");
    const settings = readSettings();
    const enabledPlugins = (settings.enabledPlugins as Record<string, boolean>) ?? {};

    if (!(key in enabledPlugins)) {
      return c.json(
        { success: false, error: `Plugin "${key}" not found in settings` } satisfies ApiResponse,
        404,
      );
    }

    enabledPlugins[key] = enabled;
    settings.enabledPlugins = enabledPlugins;
    writeSettings(settings);

    log.info("Plugin toggled", { key, enabled });

    return c.json({
      success: true,
      data: { key, enabled, note: "Restart Claude Code sessions for changes to take effect" },
    } satisfies ApiResponse);
  },
);
