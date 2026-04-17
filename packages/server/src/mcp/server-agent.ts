/**
 * Slim MCP Server for agent sessions.
 *
 * Registers only tools agents CANNOT replicate with built-in tools.
 * Context overhead: ~3K tokens (vs ~15K for full tool set).
 *
 * Used by Companion when launching Claude Code CLI sessions —
 * injected via .mcp.json in the project directory.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAgentTools } from "./tools-agent.js";

const VERSION = process.env.COMPANION_MCP_VERSION ?? "0.21.0";

export function createAgentMcpServer(): McpServer {
  const server = new McpServer({
    name: "companion-agent",
    version: VERSION,
  });

  registerAgentTools(server);

  return server;
}

export async function startAgentStdioServer(): Promise<void> {
  const server = createAgentMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`[companion-mcp-agent] Server started (v${VERSION})\n`);
}
