/**
 * MCP config injection — shared across CLI adapters.
 *
 * Each CLI uses a different config format and path for MCP server registration:
 *   - Claude Code  → `.mcp.json`              (project root)  JSON, top-level `mcpServers`
 *   - Gemini CLI   → `.gemini/settings.json`  (project root)  JSON, top-level `mcpServers`
 *   - OpenCode CLI → `opencode.json`          (project root)  JSON, nested `mcp.servers`
 *   - Codex CLI    → `.codex/config.toml`     (project root)  TOML, `[mcp_servers.<key>]`
 *
 * All four write project-scoped files (never ~/.*), so cleanup cannot damage
 * user global configuration. Each returns a cleanup function that restores
 * the original state (or deletes the file we created).
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createLogger } from "../../logger.js";

const log = createLogger("mcp-injection");

/** Path to the slim MCP server entry point (resolved at module load). */
const AGENT_MCP_ENTRY = resolve(import.meta.dir, "../../mcp/index-agent.ts");

/** Server key we own in every CLI's MCP config. */
export const COMPANION_MCP_SERVER_KEY = "companion-agent";

interface ServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** Build the common `companion-agent` server block used across all formats. */
function buildServerConfig(apiUrl: string, apiKey: string, projectSlug: string): ServerConfig {
  return {
    command: "bun",
    args: ["run", AGENT_MCP_ENTRY],
    env: {
      COMPANION_API_URL: apiUrl,
      API_KEY: apiKey,
      PROJECT_SLUG: projectSlug,
    },
  };
}

// ─── Generic JSON injector ──────────────────────────────────────────────────

interface JsonInjectionSchema {
  /** Config file path relative to project root. */
  relPath: string;
  /** Extract the servers map from a parsed config (or return undefined if absent). */
  getServers: (cfg: Record<string, unknown>) => Record<string, unknown> | undefined;
  /** Return a new config with `servers` installed at the schema-specific location. */
  setServers: (
    cfg: Record<string, unknown>,
    servers: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Return a new config with the servers-holding branch removed entirely. */
  stripServers: (cfg: Record<string, unknown>) => Record<string, unknown>;
}

function injectJsonMcp(
  cwd: string,
  schema: JsonInjectionSchema,
  server: ServerConfig,
): () => void {
  const configPath = join(cwd, schema.relPath);
  const configDir = dirname(configPath);

  let existing: Record<string, unknown> = {};
  let hadExisting = false;
  try {
    if (existsSync(configPath)) {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      hadExisting = true;
    }
  } catch {
    // corrupt file — treat as if we created it
  }

  const originalServers = schema.getServers(existing);
  const preservedServers = originalServers ? { ...originalServers } : undefined;

  const mergedServers = {
    ...originalServers,
    [COMPANION_MCP_SERVER_KEY]: server,
  };

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const newCfg = schema.setServers(existing, mergedServers);
  writeFileSync(configPath, JSON.stringify(newCfg, null, 2), "utf-8");
  log.info("Injected MCP config", { configPath });

  return () => {
    try {
      if (!existsSync(configPath)) return;

      if (preservedServers === undefined) {
        // Had no servers branch before — remove the branch or the whole file
        if (!hadExisting) {
          unlinkSync(configPath);
          return;
        }
        const current = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        const stripped = schema.stripServers(current);
        if (Object.keys(stripped).length === 0) {
          unlinkSync(configPath);
        } else {
          writeFileSync(configPath, JSON.stringify(stripped, null, 2), "utf-8");
        }
        return;
      }

      // Restore original servers — remove only our key
      const current = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const servers = { ...preservedServers };
      delete servers[COMPANION_MCP_SERVER_KEY];
      const restored =
        Object.keys(servers).length > 0
          ? schema.setServers(current, servers)
          : schema.stripServers(current);
      if (Object.keys(restored).length === 0) {
        unlinkSync(configPath);
      } else {
        writeFileSync(configPath, JSON.stringify(restored, null, 2), "utf-8");
      }
    } catch (err) {
      log.warn("Failed to clean up MCP config", { configPath, error: String(err) });
    }
  };
}

// ─── Claude Code — .mcp.json, top-level `mcpServers` ────────────────────────

const CLAUDE_SCHEMA: JsonInjectionSchema = {
  relPath: ".mcp.json",
  getServers: (cfg) => cfg.mcpServers as Record<string, unknown> | undefined,
  setServers: (cfg, servers) => ({ ...cfg, mcpServers: servers }),
  stripServers: (cfg) => {
    const { mcpServers: _, ...rest } = cfg;
    return rest;
  },
};

/**
 * Inject `.mcp.json` for Claude Code.
 *
 * Safe to call when a user-maintained `.mcp.json` already exists — existing
 * entries are preserved and only our `companion-agent` key is added/removed.
 */
export function injectCompanionMcp(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectSlug: string,
): () => void {
  return injectJsonMcp(cwd, CLAUDE_SCHEMA, buildServerConfig(apiUrl, apiKey, projectSlug));
}

// ─── Gemini CLI — .gemini/settings.json, top-level `mcpServers` ─────────────

const GEMINI_SCHEMA: JsonInjectionSchema = {
  relPath: ".gemini/settings.json",
  getServers: (cfg) => cfg.mcpServers as Record<string, unknown> | undefined,
  setServers: (cfg, servers) => ({ ...cfg, mcpServers: servers }),
  stripServers: (cfg) => {
    const { mcpServers: _, ...rest } = cfg;
    return rest;
  },
};

/** Inject `.gemini/settings.json` for Gemini CLI. */
export function injectCompanionMcpGemini(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectSlug: string,
): () => void {
  return injectJsonMcp(cwd, GEMINI_SCHEMA, buildServerConfig(apiUrl, apiKey, projectSlug));
}

// ─── OpenCode CLI — opencode.json, nested `mcp.servers` ─────────────────────

const OPENCODE_SCHEMA: JsonInjectionSchema = {
  relPath: "opencode.json",
  getServers: (cfg) => {
    const mcp = cfg.mcp as { servers?: Record<string, unknown> } | undefined;
    return mcp?.servers;
  },
  setServers: (cfg, servers) => {
    const mcp = (cfg.mcp as Record<string, unknown> | undefined) ?? {};
    return { ...cfg, mcp: { ...mcp, servers } };
  },
  stripServers: (cfg) => {
    const { mcp, ...rest } = cfg as { mcp?: Record<string, unknown>; [k: string]: unknown };
    if (!mcp) return rest;
    const { servers: _, ...mcpRest } = mcp;
    if (Object.keys(mcpRest).length === 0) return rest;
    return { ...rest, mcp: mcpRest };
  },
};

/** Inject `opencode.json` for OpenCode CLI. */
export function injectCompanionMcpOpenCode(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectSlug: string,
): () => void {
  return injectJsonMcp(cwd, OPENCODE_SCHEMA, buildServerConfig(apiUrl, apiKey, projectSlug));
}

// ─── Codex CLI — .codex/config.toml ─────────────────────────────────────────

/**
 * The Codex config block we own. Delimited by markers so cleanup can strip
 * exactly our section without a full TOML parser.
 */
const CODEX_MARKER_BEGIN = `# >>> companion-agent >>> (managed by Companion — do not edit)`;
const CODEX_MARKER_END = `# <<< companion-agent <<<`;

function buildCodexBlock(server: ServerConfig): string {
  const escape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const argsInline = server.args.map((a) => `"${escape(a)}"`).join(", ");
  const envLines = Object.entries(server.env)
    .map(([k, v]) => `${k} = "${escape(v)}"`)
    .join("\n");
  return [
    CODEX_MARKER_BEGIN,
    `[mcp_servers.${COMPANION_MCP_SERVER_KEY}]`,
    `command = "${escape(server.command)}"`,
    `args = [${argsInline}]`,
    "",
    `[mcp_servers.${COMPANION_MCP_SERVER_KEY}.env]`,
    envLines,
    CODEX_MARKER_END,
  ].join("\n");
}

/** Strip our marker-delimited block from a Codex TOML, return remainder. */
function stripCodexBlock(content: string): string {
  const beginIdx = content.indexOf(CODEX_MARKER_BEGIN);
  if (beginIdx === -1) return content;
  const endIdx = content.indexOf(CODEX_MARKER_END, beginIdx);
  if (endIdx === -1) return content;
  const afterEnd = endIdx + CODEX_MARKER_END.length;
  const before = content.slice(0, beginIdx).replace(/\s+$/, "");
  const after = content.slice(afterEnd).replace(/^\s+/, "");
  if (before && after) return `${before}\n\n${after}`;
  return before || after;
}

/**
 * Inject `.codex/config.toml` for Codex CLI. Uses marker-delimited block
 * insertion so we can add/remove our section without a TOML parser.
 *
 * If the file already contains our section (previous unclean shutdown),
 * we replace it. Cleanup removes only the marker-delimited region.
 */
export function injectCompanionMcpCodex(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectSlug: string,
): () => void {
  const server = buildServerConfig(apiUrl, apiKey, projectSlug);
  const configPath = join(cwd, ".codex", "config.toml");
  const configDir = dirname(configPath);

  let existing = "";
  let hadExisting = false;
  try {
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, "utf-8");
      hadExisting = true;
    }
  } catch {
    // unreadable — treat as new
  }

  // Strip any stale companion block before appending fresh one
  const base = stripCodexBlock(existing).replace(/\s+$/, "");
  const block = buildCodexBlock(server);
  const merged = base ? `${base}\n\n${block}\n` : `${block}\n`;

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, merged, "utf-8");
  log.info("Injected MCP config", { configPath });

  return () => {
    try {
      if (!existsSync(configPath)) return;

      const current = readFileSync(configPath, "utf-8");
      const stripped = stripCodexBlock(current).replace(/\s+$/, "");

      if (!stripped) {
        if (!hadExisting) {
          unlinkSync(configPath);
          return;
        }
        // Original file was entirely our block — shouldn't happen, but safe fallback
        unlinkSync(configPath);
        return;
      }

      writeFileSync(configPath, `${stripped}\n`, "utf-8");
    } catch (err) {
      log.warn("Failed to clean up MCP config", { configPath, error: String(err) });
    }
  };
}
