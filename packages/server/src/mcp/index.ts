#!/usr/bin/env bun
/**
 * Entry point for Companion MCP server.
 *
 * Usage:
 *   bun run packages/server/src/mcp/index.ts
 *
 * Claude Code config (~/.claude.json or project .mcp.json):
 *   {
 *     "mcpServers": {
 *       "companion": {
 *         "command": "bun",
 *         "args": ["run", "<path>/packages/server/src/mcp/index.ts"],
 *         "env": {
 *           "API_KEY": "<your-api-key>",
 *           "PORT": "3579"
 *         }
 *       }
 *     }
 *   }
 */

import { startStdioServer } from "./server.js";

startStdioServer().catch((err) => {
  process.stderr.write(`[companion-mcp] Fatal: ${String(err)}\n`);
  process.exit(1);
});
