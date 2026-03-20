# Phase 5A: MCP Server Core

## Goal
Make Companion an MCP server that Claude Code can connect to. Claude gains tools to spawn sessions, list sessions, send messages, and read context — enabling self-orchestration.

## Tasks
- [ ] Install `@modelcontextprotocol/sdk` in packages/server
- [ ] Create `packages/server/src/mcp/server.ts` — MCP server with stdio transport
- [ ] Create `packages/server/src/mcp/tools.ts` — tool definitions + handlers
- [ ] Implement MCP tools:
  - [ ] `companion_spawn_session` — create new session (project, model, role, prompt, channelId)
  - [ ] `companion_list_sessions` — list active sessions with status, cost, model
  - [ ] `companion_send_message` — send message to another session by ID
  - [ ] `companion_get_session` — get session state + recent messages
  - [ ] `companion_get_project_context` — project info, recent sessions, active channels
  - [ ] `companion_create_channel` — create shared channel (debate/review/brainstorm)
  - [ ] `companion_send_to_channel` — post message to shared channel with role
  - [ ] `companion_read_channel` — get channel messages with pagination
- [ ] Create `packages/server/src/mcp/index.ts` — entry point for `bun run mcp`
- [ ] Add `mcp` script to package.json: `"mcp": "bun run src/mcp/index.ts"`
- [ ] Create Claude Code MCP config snippet for user to add to settings
- [ ] Test: Claude Code connects → `tools/list` returns all 8 tools

## Acceptance Criteria
- [ ] `bun run mcp` starts stdio MCP server
- [ ] Claude Code can discover 8 Companion tools
- [ ] `companion_spawn_session` creates a real session (visible in web UI)
- [ ] `companion_send_message` delivers message to session (appears in terminal)
- [ ] `companion_create_channel` creates channel in DB
- [ ] Error responses are clear (session not found, project not found, etc.)

## Files
- `packages/server/src/mcp/server.ts` — new
- `packages/server/src/mcp/tools.ts` — new
- `packages/server/src/mcp/index.ts` — new
- `packages/server/package.json` — modify (add dep + script)

## Architecture Notes
- MCP server imports WsBridge + ChannelManager directly (same process? no — it runs as separate process)
- MCP server communicates with Companion server via HTTP API (localhost:3460)
- This keeps MCP server stateless and decoupled
- Auth: MCP server reads API_KEY from env, sends as X-API-Key header
- Future: add HTTP/SSE transport for remote agents (Phase 6+)

## Dependencies
- Phase 1-4 done ✅
- `@modelcontextprotocol/sdk` package
- Companion server running on localhost for MCP tools to call
