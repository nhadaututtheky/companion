/**
 * MCP config injection — shared across CLI adapters.
 *
 * Writes a `.mcp.json` file at the project root that tells the CLI
 * (Claude Code, and any other MCP-capable CLI) how to spawn the Companion
 * slim MCP server (`companion-agent`). The server exposes Wiki KB + CodeGraph
 * tools so agents can retrieve domain context and impact analysis on demand.
 *
 * Previously this lived inside claude-adapter.ts. Extracted so Codex, Gemini,
 * OpenCode and future MCP-capable adapters can share the same behaviour.
 *
 * Returns a cleanup function that restores the original `.mcp.json` state
 * (or removes the file if we created it).
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "../../logger.js";

const log = createLogger("mcp-injection");

/** Path to the slim MCP server entry point (resolved at module load). */
const AGENT_MCP_ENTRY = resolve(import.meta.dir, "../../mcp/index-agent.ts");

/** Server key we own in the merged `.mcp.json`. */
export const COMPANION_MCP_SERVER_KEY = "companion-agent";

interface McpConfigShape {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Inject `.mcp.json` in the project directory so the CLI discovers
 * the Companion slim MCP server.
 *
 * Safe to call when a user-maintained `.mcp.json` already exists — existing
 * entries are preserved and only our `companion-agent` key is added/removed.
 *
 * @param cwd          Project directory where `.mcp.json` lives.
 * @param apiUrl       Companion server base URL the MCP server connects back to.
 * @param apiKey       API key for authenticated MCP calls.
 * @param projectSlug  Project slug used to scope MCP queries.
 * @returns            Cleanup function that removes only our server key,
 *                     restoring the original file state.
 */
export function injectCompanionMcp(
  cwd: string,
  apiUrl: string,
  apiKey: string,
  projectSlug: string,
): () => void {
  const mcpJsonPath = join(cwd, ".mcp.json");

  // Preserve existing .mcp.json content
  let existing: McpConfigShape = {};
  let hadExisting = false;
  try {
    if (existsSync(mcpJsonPath)) {
      existing = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpConfigShape;
      hadExisting = true;
    }
  } catch {
    // corrupt file — start fresh (cleanup below treats this as "we created it")
  }

  const originalServers = existing.mcpServers ? { ...existing.mcpServers } : undefined;

  const mcpConfig: McpConfigShape = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      [COMPANION_MCP_SERVER_KEY]: {
        command: "bun",
        args: ["run", AGENT_MCP_ENTRY],
        env: {
          COMPANION_API_URL: apiUrl,
          API_KEY: apiKey,
          PROJECT_SLUG: projectSlug,
        },
      },
    },
  };

  writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
  log.info("Injected MCP config", { mcpJsonPath, projectSlug });

  return () => {
    try {
      if (!existsSync(mcpJsonPath)) return;

      if (originalServers !== undefined) {
        // Restore original servers — remove only our key
        const current = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpConfigShape;
        const servers = { ...(current.mcpServers ?? {}) };
        delete servers[COMPANION_MCP_SERVER_KEY];
        if (Object.keys(servers).length > 0) {
          writeFileSync(
            mcpJsonPath,
            JSON.stringify({ ...current, mcpServers: servers }, null, 2),
            "utf-8",
          );
        } else if (hadExisting) {
          const { mcpServers: _, ...rest } = current;
          if (Object.keys(rest).length > 0) {
            writeFileSync(mcpJsonPath, JSON.stringify(rest, null, 2), "utf-8");
          } else {
            unlinkSync(mcpJsonPath);
          }
        } else {
          unlinkSync(mcpJsonPath);
        }
      } else if (!hadExisting) {
        // We created the file — remove it entirely
        unlinkSync(mcpJsonPath);
      } else {
        // Had existing but no mcpServers — restore original
        const current = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpConfigShape;
        const { mcpServers: _, ...rest } = current;
        writeFileSync(mcpJsonPath, JSON.stringify(rest, null, 2), "utf-8");
      }
      log.debug("Cleaned up MCP config", { mcpJsonPath });
    } catch (err) {
      log.warn("Failed to clean up MCP config", { error: String(err) });
    }
  };
}
