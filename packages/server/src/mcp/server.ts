/**
 * Companion MCP Server — Exposes Companion as an MCP server for Claude Code.
 *
 * Architecture: Stateless — communicates with Companion HTTP API.
 * Transport: stdio (for local Claude Code sessions).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { APP_VERSION } from "@companion/shared";
import { registerTools } from "./tools.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "companion",
    version: APP_VERSION,
  });

  registerTools(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  process.stderr.write(`[companion-mcp] Server started (v${APP_VERSION})\n`);
}
