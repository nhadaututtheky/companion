# Phase 3: Multi-CLI Connect — Shared Context Injection

## Goal
When a CLI connects to a workspace, auto-inject shared context (Wiki KB, CodeGraph, project rules). Support spawn-on-demand and auto-connect modes.

## Tasks
- [x] Extend `ws-bridge.ts` session creation to accept `workspaceId`
- [x] On session start: look up workspace → inject shared context into CLI prompt
- [x] Context injection: workspace meta + wiki KB + CodeGraph (unified prompt prepend)
- [ ] Per-CLI adapter injection (--system-prompt for Claude, env for Codex) — deferred to Phase 4
- [ ] Auto-connect: when workspace opens + `autoConnect=true`, spawn configured CLIs — deferred
- [ ] Lazy connect: spawn CLI only on first @mention or manual click — Phase 4
- [x] Track session→workspace mapping in runtime + DB (cliPlatform in Drizzle schema)
- [ ] Workspace-level context-budget.ts integration: shared budget across CLIs — deferred
- [x] Reconnect logic: on server restart, re-map active sessions to workspaces
- [x] Connect/disconnect REST API routes
- [x] Web API client connect/disconnect methods

## Context Injection Strategy
```
Session starts in workspace →
  1. Load workspace config
  2. Gather context:
     a. Wiki KB L0 (core rules) — from workspace.wikiDomain
     b. CodeGraph summary — from workspace.projectPath
     c. CLAUDE.md / project rules — from workspace.projectPath
     d. Workspace meta: "You are [CLI type] in workspace [name]. Other CLIs: [list]"
  3. Inject via CLI-specific adapter method
  4. Set session.workspaceId in DB
```

## Acceptance Criteria
- [ ] Session created with workspaceId gets shared context injected
- [ ] Wiki KB, CodeGraph, project rules flow to ALL CLI types
- [ ] Auto-connect spawns all configured CLIs when workspace opens
- [ ] Server restart reconnects existing sessions to their workspace
- [ ] Context budget respected: shared context doesn't exceed per-CLI limits

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — workspace-aware session creation
- `packages/server/src/services/context-budget.ts` — workspace context gathering
- `packages/server/src/services/workspace-store.ts` — connect/disconnect/reconnect logic
- `packages/server/src/services/adapters/claude-adapter.ts` — workspace context injection
- `packages/server/src/services/adapters/codex-adapter.ts` — workspace context injection
- `packages/server/src/services/adapters/gemini-adapter.ts` — workspace context injection
- `packages/server/src/services/adapters/opencode-adapter.ts` — workspace context injection

## Dependencies
- Phase 1 (data model)
- Phase 2 (sidebar UI to trigger connect/disconnect)
