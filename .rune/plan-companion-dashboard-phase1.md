# Phase 1: Bug Fixes + Foundation

## Goal
Fix known bugs blocking the dashboard, add missing message type handling, build CommandPalette, and add server endpoint for directory browsing. After this phase, the existing UI works correctly and the foundation for new features is ready.

## Tasks

### 1.1 Fix WS Auth Param Mismatch
- [x] In `packages/web/src/hooks/use-websocket.ts` line 37: change `?key=` to `?api_key=`
- [x] Server expects `api_key` (index.ts:97), client sends `key` — causes 401 in production

### 1.2 Handle `session_init` and `message_history` in useSession
- [x] In `packages/web/src/hooks/use-session.ts`, add case for `"session_init"` in handleMessage
  - Parse session state from `msg.session`, call `setSession()` with full state
- [x] Add case for `"message_history"` — replay stored messages into local state
  - Map `msg.messages` array into Message[] format, prepend to existing messages
- [x] Add case for `"cli_connected"` and `"cli_disconnected"` — update wsStatus indicator
- [x] Add case for `"tool_progress"` — track tool execution progress
- [x] Add case for `"permission_cancelled"` — remove from pendingPermissions

### 1.3 Build CommandPalette Component
- [x] Create `packages/web/src/components/layout/command-palette.tsx`
- [x] Use cmdk (`Command` from `cmdk` package — already in deps)
- [x] Actions: switch session, new session, stop session, toggle theme, go to settings
- [x] Wire to `useUiStore.commandPaletteOpen`
- [x] Register global Ctrl+K / Cmd+K shortcut in layout (via command-palette-provider.tsx)
- [x] Style: warm cream bg, blur backdrop, no default indigo

### 1.4 Add Directory Listing API
- [x] Create `packages/server/src/routes/filesystem.ts`
- [x] `GET /api/fs/browse?path=<dir>` — list subdirectories of given path
  - Return `{ dirs: string[], files: string[] }` (dirs only by default, files optional)
  - Validate path exists, is a directory
  - Filter out hidden dirs (`.git`, `node_modules`, `.next`, etc.)
  - Security: optionally restrict to configured base paths via env `ALLOWED_BROWSE_ROOTS`
- [x] `GET /api/fs/roots` — return common project roots (home dir, configured roots)
- [x] Mount in `packages/server/src/routes/index.ts`
- [x] Add `api.fs.browse()` and `api.fs.roots()` to web api-client

### 1.5 Add Session Count Limit
- [x] In `packages/server/src/routes/sessions.ts` POST handler: check `countActiveSessions() < 6`
- [x] Return 429 with message if limit reached
- [x] Export `MAX_ACTIVE_SESSIONS = 6` from `@companion/shared/constants.ts`

## Acceptance Criteria
- [x] WS connects successfully when API_KEY is set
- [x] `session_init` populates session state in store on WS connect
- [x] `message_history` replays previous messages when reconnecting
- [x] Ctrl+K opens command palette with session list and actions
- [x] `GET /api/fs/browse?path=D:/Project` returns directory listing
- [x] Cannot create more than 6 active sessions via API

## Files Touched
- `packages/web/src/hooks/use-websocket.ts` — fix `?key=` to `?api_key=`
- `packages/web/src/hooks/use-session.ts` — add missing message type handlers
- `packages/web/src/components/layout/command-palette.tsx` — new
- `packages/web/src/app/layout.tsx` — add CommandPalette + Ctrl+K listener
- `packages/server/src/routes/filesystem.ts` — new
- `packages/server/src/routes/index.ts` — mount fs routes
- `packages/web/src/lib/api-client.ts` — add fs methods
- `packages/server/src/routes/sessions.ts` — add session limit check
- `packages/shared/src/constants.ts` — add MAX_ACTIVE_SESSIONS

## Dependencies
- None (fixes and foundation only)
