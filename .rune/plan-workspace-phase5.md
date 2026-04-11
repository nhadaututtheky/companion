# Phase 5: Workspace Dashboard — Overview Panel

## Goal
Workspace overview panel showing all CLIs status, recent activity, shared context health, and quick actions. The "mission control" for multi-CLI orchestration.

## Tasks
- [x] Create `workspace-dashboard.tsx` panel component
- [x] CLI status cards: live status, cost, turns, uptime, model per CLI
- [x] Cost summary: total workspace cost across all CLIs
- [x] Active sessions list from connected CLIs
- [x] Integrate as right panel option ("workspace" mode, 520px width)
- [x] Add to NavSidebar under "AI" section (GridFour icon)
- [ ] Interleaved activity feed with timestamps per CLI — deferred
- [ ] Shared context health (Wiki KB, CodeGraph, Rules) — deferred
- [ ] Quick connect/disconnect from dashboard cards — deferred
- [ ] Keyboard shortcut — deferred

## Dashboard Layout
```
┌─────────────────────────────────────────┐
│ 🏠 Companion Workspace            ⚙ │
├─────────────────────────────────────────┤
│ CLI Agents                              │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │🔵 Claude │ │🟢 Codex  │ │🟡 Gemini │ │
│ │ Running  │ │ Idle     │ │ Waiting  │ │
│ │ $0.42    │ │ $0.15    │ │ $0.08    │ │
│ │ 12 turns │ │ 3 turns  │ │ 1 turn   │ │
│ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────┤
│ Activity Feed                    Total: $0.65
│ 14:32 🔵 Claude: Fixed auth.ts          │
│ 14:28 🟢 Codex: Reviewed PR #42         │
│ 14:25 🟡 Gemini: Benchmarked queries    │
│ 14:20 🔵 Claude: Refactored config      │
├─────────────────────────────────────────┤
│ Context Health                          │
│ Wiki KB: 12 articles, 3 stale     [↻]  │
│ CodeGraph: 85 files indexed       [↻]  │
│ Rules: CLAUDE.md loaded           ✓    │
└─────────────────────────────────────────┘
```

## Acceptance Criteria
- [ ] Dashboard shows all connected CLIs with live status
- [ ] Activity feed updates in real-time via WebSocket
- [ ] Cost tracking per CLI and total workspace
- [ ] Context health indicators with refresh actions
- [ ] Accessible as right panel from nav menu
- [ ] Quick connect/disconnect from dashboard cards

## Files Touched
- `packages/web/src/components/panels/workspace-dashboard.tsx` — new
- `packages/web/src/components/layout/nav-sidebar.tsx` — add Workspace to panel items
- `packages/web/src/lib/stores/ui-store.ts` — add "workspace" panel mode
- `packages/web/src/app/page.tsx` — render workspace panel
- `packages/server/src/routes/workspaces.ts` — add activity feed endpoint

## Dependencies
- Phase 1-4 completed (full workspace infrastructure)
