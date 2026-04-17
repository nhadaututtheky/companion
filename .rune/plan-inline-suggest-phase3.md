# Phase 3: MCP Tools Provider

## Goal

Surface MCP tools inline so users discover capabilities they already
installed. Biggest discovery gap in Claude Code — users install MCP
servers, forget what's in them, never invoke most of the tools.

## Tasks

- [ ] Extend `GET /api/registry` with `/mcp-tools` endpoint:
  - Read MCP server list from Claude Code config (`~/.claude.json` `mcpServers` or equivalent)
  - For each server, fetch tool list via MCP protocol (`tools/list`) — cache in server memory with 10min TTL
  - Return `{ server: string, tools: { name, description, schema }[] }[]`
- [ ] Extend `registry-store` with `mcpTools` slice + `fetchMcpTools()`
- [ ] Create `packages/web/src/lib/suggest/providers/mcp.provider.ts`:
  - Match prompt keywords against tool name + description
  - Common intent → server hints:
    - "docs", "library", "API reference" → context7
    - "remember", "recall", "memory" → neural-memory
    - "screenshot", "browser", "navigate", "click" → playwright
    - "design", "figma-like", ".pen" → pencil
    - "deploy firebase", "firestore" → firebase
  - Score: 0.5-0.75 range (lower than skills/agents since MCP tools are usually called by agent, not user)
  - Action: `{ type: 'custom', payload: { kind: 'mcp-hint', server, tool } }` — inserts a comment hint like `<!-- hint: use mcp__<server>__<tool> -->` rather than direct call (agent will pick it up)
- [ ] Add server-side cache invalidation endpoint: `POST /api/registry/mcp-tools/refresh`
- [ ] Unit tests: MCP parser, keyword matching, cache TTL

## Acceptance Criteria

- [ ] Typing "find React 19 docs" surfaces context7 MCP hint
- [ ] Typing "remember this decision" surfaces neural-memory hint
- [ ] Typing "take screenshot of landing" surfaces playwright hint
- [ ] MCP tools from runtime-registered servers appear (not just static config)
- [ ] Server-side cache hit on repeat requests within 10min
- [ ] Typecheck clean, 4+ tests pass

## Files Touched

### New
- `packages/web/src/lib/suggest/providers/mcp.provider.ts`
- `packages/server/src/lib/registry/mcp-client.ts` — minimal MCP `tools/list` caller
- `packages/web/src/lib/suggest/__tests__/mcp.test.ts`

### Modified
- `packages/server/src/routes/registry.ts` — add `/mcp-tools` + refresh endpoint
- `packages/web/src/lib/suggest/registry-store.ts` — add mcpTools slice
- `packages/web/src/lib/suggest/index.ts` — export provider

## Dependencies

- Phase 1 foundation
- Knowledge of MCP protocol `tools/list` endpoint (stdio or HTTP transport)

## Design notes

**MCP discovery method** — two paths depending on server transport:
- **stdio servers** — spawn + send `tools/list` JSON-RPC, capture response, kill process. Expensive but cacheable.
- **HTTP servers** — GET on `tools/list` endpoint (if exposed). Cheaper.

Start with stdio since that's what Claude Code defaults to. Fallback: parse static MCP manifests if server doesn't respond.

**Privacy** — some MCP servers require credentials to list tools. If `tools/list` fails with auth error, skip server silently (don't surface broken providers).

**Why hints, not direct calls** — the user is drafting a prompt for an agent. The agent will execute tools. We can't call MCP tools directly from web. Inserting a comment hint signals to the agent which tool to consider.

**Ranking collision** — if prompt matches both a skill AND an MCP tool (e.g., "deploy" → `/ship` + firebase), show both but skill wins tie (higher score).

## Out of scope

- MCP server install/uninstall UI (separate feature)
- Tool schema preview in drawer (defer to full Agents Hub)
- Per-tool usage stats (defer to Phase 4 telemetry)
