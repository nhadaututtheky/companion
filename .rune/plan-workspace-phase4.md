# Phase 4: @CLI Routing — Mention-Based Task Assignment

## Goal
Enable `@claude`, `@codex`, `@gemini`, `@opencode`, `@all` mentions to route messages to specific CLIs within a workspace. Works from both Web UI chat and Telegram.

## Tasks
- [x] Extend `mention-router.ts` with CLI-type aliases (claude, codex, gemini, opencode + variants)
- [x] Priority resolution: @all > @cli-type > @session-shortid > @debate-agent
- [x] `@all` fan-out: send to all active CLIs in workspace (position-deduped)
- [x] `@claude` → find connected session in workspace via in-memory cliConnections
- [x] Workspace-aware routing: only match CLIs within same workspace
- [x] CLI-aware routing context ("Workspace @claude mention from...")
- [ ] If target CLI not connected: prompt "Connect?" — deferred (silent skip for now)
- [ ] Response attribution UI: CLI icon + label in message bubble — deferred to Phase 5
- [ ] Web UI @mention autocomplete for CLIs in chat-input — deferred to Phase 5
- [ ] Telegram: @mention in workspace-linked topics — deferred

## Mention Syntax
```
@claude fix the auth middleware bug          → Claude Code session
@codex review src/services/auth.ts           → Codex session
@gemini benchmark this query against PostgreSQL → Gemini CLI session
@opencode refactor the config parser          → OpenCode session
@all summarize what you've been working on    → fan-out to all active CLIs
```

## Response Attribution UI
```
┌─────────────────────────────────┐
│ 🔵 Claude Code                  │
│ Fixed the auth middleware. The   │
│ issue was in token validation... │
├─────────────────────────────────┤
│ 🟢 Codex                        │
│ Reviewed auth.ts — found 2      │
│ issues: missing null check...   │
└─────────────────────────────────┘
```

## Acceptance Criteria
- [ ] `@claude` routes to Claude Code session in current workspace
- [ ] `@all` fans out to all active CLIs and shows all responses
- [ ] Responses show CLI type attribution (icon + name)
- [ ] Non-connected CLI mention triggers connect prompt
- [ ] Works from both Web UI and Telegram
- [ ] No conflict with existing @session-shortid mentions

## Files Touched
- `packages/server/src/services/mention-router.ts` — extend with CLI aliases
- `packages/server/src/services/workspace-store.ts` — resolve CLI type → session
- `packages/server/src/telegram/telegram-bridge.ts` — workspace @mention handling
- `packages/web/src/components/session/chat-input.tsx` — @mention autocomplete for CLIs
- `packages/web/src/components/session/message-bubble.tsx` — CLI attribution badge
- `packages/shared/src/types.ts` — CLI type enum if not exists

## Dependencies
- Phase 1 (workspace entity)
- Phase 3 (CLIs connected to workspace)
