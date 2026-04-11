# Phase 2: Sidebar Redesign — Workspace-First Navigation

## Goal
Transform sidebar from flat session list to workspace-centric navigation. Icon rail = workspaces, expanded panel = CLI slots + sessions grouped by CLI type.

## Tasks
- [x] Redesign `project-sidebar.tsx` with workspace support (kept same export for backward compat)
- [x] Icon rail: workspace icons (letter) with active CLI count dot
- [x] Expanded panel: CLI status bar (4-state colored dots) + session list
- [x] "+" button: create new workspace dialog (workspace-create-modal.tsx)
- [ ] "Add CLI" button inside expanded workspace to connect additional CLIs (Phase 3)
- [x] Workspace context menu: rename, delete (configure deferred to Phase 5)
- [ ] Active workspace indicator in header (breadcrumb: Workspace > CLI > Session) (Phase 5)
- [x] Persist last-active workspace in localStorage

## Design

### Icon Rail (left strip, 48px wide)
```
┌────┐
│ 🅒 │  ← Companion workspace (active, 3 CLIs running)
│ •  │
├────┤
│ 🅜 │  ← MyTrend workspace (1 CLI)
│    │
├────┤
│ 🅕 │  ← Future Bot workspace (idle)
│    │
├────┤
│    │
│ ＋ │  ← Create workspace
└────┘
```

### Expanded Panel (200px, slides out on click)
```
┌──────────────────────┐
│ Companion         ⚙  │  ← workspace name + settings
├──────────────────────┤
│ CLI Agents:          │
│ 🟢 Claude Code    ▶  │  ← click to expand sessions
│ 🟡 Codex          ▶  │
│ 🟢 Gemini CLI     ▶  │
│ ⚪ OpenCode    [+] │  ← not connected, click to spawn
├──────────────────────┤
│ Recent Sessions:     │
│  sess-abc (claude)   │
│  sess-def (codex)    │
│  sess-ghi (gemini)   │
└──────────────────────┘
```

### CLI Status Colors
- 🟢 Green: running/active session
- 🟡 Yellow: idle/waiting
- 🔴 Red: error/crashed
- ⚪ Gray: not connected

## Acceptance Criteria
- [ ] Sidebar shows workspaces in icon rail (not projects)
- [ ] Clicking workspace expands to show CLI status + sessions
- [ ] Can create new workspace from "+" button
- [ ] Can connect/disconnect CLIs from expanded panel
- [ ] Active workspace persists across page reloads
- [ ] Backward-compat: sessions without workspace_id show under "Ungrouped"

## Files Touched
- `packages/web/src/components/layout/project-sidebar.tsx` — major rewrite → workspace-sidebar
- `packages/web/src/components/layout/workspace-create-modal.tsx` — new
- `packages/web/src/components/layout/cli-status-bar.tsx` — new
- `packages/web/src/lib/stores/ui-store.ts` — add activeWorkspaceId
- `packages/web/src/lib/stores/workspace-store.ts` — extend with UI state
- `packages/web/src/app/page.tsx` — swap ProjectSidebar → WorkspaceSidebar

## Dependencies
- Phase 1 completed (workspace CRUD API + stores)
