# Phase 7: Activity Terminal

## Goal
Add a collapsible terminal panel at the bottom of the dashboard showing realtime agent activity logs across all sessions — thinking status, tool usage, results, token costs. Like a dev console for AI agents.

## Tasks

### 7.1 Create Activity Log Store
- [x] Create `packages/web/src/lib/stores/activity-store.ts`
- [x] Shape: `{ logs: ActivityLog[], addLog, clearLogs, maxLogs: 500 }`
- [x] `ActivityLog`: `{ id, sessionId, timestamp, type, content, meta? }`
- [x] Types: `thinking`, `tool_use`, `tool_result`, `result`, `error`, `permission`, `cost`

### 7.2 Feed Events into Activity Store
- [x] In `useSession` hook: on `tool_progress` → addLog type `tool_use`
- [x] On `assistant` with tool_use blocks → addLog with tool name + input summary
- [x] On `stream_event` content_block_start type=thinking → addLog type `thinking`
- [x] On `result` → addLog type `result` with cost/token summary
- [x] On `permission_request` → addLog type `permission`

### 7.3 Create Activity Terminal Component
- [x] Create `packages/web/src/components/activity/activity-terminal.tsx`
- [x] Collapsible bottom panel (drag handle or toggle button)
- [x] Default height: 200px, min 100px, max 400px
- [x] Dark terminal aesthetic: near-black bg, monospace font, colored log lines
- [x] Log line format: `[HH:MM:SS] [session-name] icon message`
- [x] Color coding: thinking=purple, tool_use=blue, result=green, error=red, cost=yellow
- [x] Auto-scroll to bottom, pause on manual scroll up
- [x] Clear button, filter by session, filter by type

### 7.4 Integrate into Dashboard Layout
- [x] Add ActivityTerminal below the session grid in page.tsx
- [x] Toggle button in header (Terminal icon from Phosphor)
- [x] Persist open/closed state in uiStore
- [x] Keyboard shortcut: Ctrl+` to toggle

## Acceptance Criteria
- [x] Terminal shows realtime logs from all active sessions
- [x] Each log line has timestamp, session name, colored icon, message
- [x] Panel is collapsible and resizable
- [x] Ctrl+` toggles the panel
- [x] Auto-scrolls but pauses when user scrolls up

## Files Touched
- `packages/web/src/lib/stores/activity-store.ts` — new
- `packages/web/src/components/activity/activity-terminal.tsx` — new
- `packages/web/src/hooks/use-session.ts` — feed events to activity store
- `packages/web/src/app/page.tsx` — add terminal to layout
- `packages/web/src/lib/stores/ui-store.ts` — add activityTerminalOpen state

## Dependencies
- Phase 2 completed (grid layout established)
