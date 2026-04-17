#!/usr/bin/env bun
/**
 * Entry point for Companion slim MCP server (agent sessions).
 *
 * Only exposes tools agents cannot replicate (wiki KB, codegraph impact).
 * Injected automatically via .mcp.json when Companion launches CLI sessions.
 *
 * Required env vars:
 *   COMPANION_API_URL — Base URL of Companion API (default: http://localhost:3579)
 *   API_KEY           — API key for authentication
 *   PROJECT_SLUG      — Project slug for wiki/codegraph defaults
 */

import { startAgentStdioServer } from "./server-agent.js";

startAgentStdioServer().catch((err) => {
  process.stderr.write(`[companion-mcp-agent] Fatal: ${String(err)}\n`);
  process.exit(1);
});
