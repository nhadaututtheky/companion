# Phase 2: CLI Bridge

## Goal
Port the core session management system: WsBridge, CLILauncher, and SessionStore backed by SQLite. After this phase, Companion can launch Claude Code processes and relay messages over WebSocket.

## Tasks
- [x] Port SessionStore to use Drizzle/SQLite (rewrite from file-based JSON)
- [x] Port WsBridge (adapt to use new SessionStore, remove MyTrend-specific calls)
  - [x] Remove `extractIdeaFromMessage` calls
  - [x] Remove `saveSessionSummary` Neural Memory call (or make optional via env)
  - [x] Keep subscriber system, permission handling, auto-approve logic
- [x] Port CLILauncher (adapt process spawning, keep NDJSON pipe logic)
  - [x] Fix Plan Mode stuck bug: implement robust exitplan mechanism
    - [x] Retry logic: send exitplan, wait 2s, check state, retry up to 3x
    - [x] Force interrupt: if exitplan fails after retries, send SIGINT + re-inject exitplan
    - [x] State tracking: track `isInPlanMode` flag from CLI output parsing
    - [x] Watchdog: if plan mode active >5min without progress, auto-attempt exit
    - [x] Telegram command `/exitplan` sends exitplan + interrupt combo (not just one)
- [x] Port ProjectProfileStore (use SQLite instead of PocketBase sync)
- [x] Create REST routes for sessions:
  - [x] `GET /api/sessions` -- list all sessions
  - [x] `POST /api/sessions` -- create/launch new session
  - [x] `GET /api/sessions/:id` -- get session detail
  - [x] `POST /api/sessions/:id/message` -- inject user message
  - [x] `POST /api/sessions/:id/stop` -- stop session
  - [x] `POST /api/sessions/:id/interrupt` -- send interrupt
  - [x] `DELETE /api/sessions/:id` -- force-end session
- [x] Create REST routes for projects:
  - [x] `GET /api/projects` -- list projects
  - [x] `POST /api/projects` -- add project
  - [x] `PUT /api/projects/:slug` -- update project config
  - [x] `DELETE /api/projects/:slug` -- remove project
- [x] Wire WebSocket upgrade in Bun.serve for `/ws/browser/:sessionId`
- [x] Port auth-middleware.ts (API key based, no PocketBase)
- [x] Port context-snapshot.ts
- [x] Write cost aggregation logic (on session end, update daily_costs table)
- [x] Test: launch a real Claude Code session, send message, receive response

## Acceptance Criteria
- [x] Can create a session via REST API
- [x] Claude Code CLI process spawns and connects via NDJSON pipe
- [x] Browser WebSocket receives session_init, assistant messages, result
- [x] Permission requests flow from CLI to browser and back
- [x] Sessions persist in SQLite across server restarts
- [x] Session list shows active and ended sessions
- [x] Cost data aggregated in daily_costs table after session ends

## Files Touched
- `packages/server/src/services/session-store.ts` -- new (rewrite)
- `packages/server/src/services/ws-bridge.ts` -- new (port + adapt)
- `packages/server/src/services/cli-launcher.ts` -- new (port + adapt)
- `packages/server/src/services/project-profiles.ts` -- new (rewrite)
- `packages/server/src/routes/sessions.ts` -- new
- `packages/server/src/routes/projects.ts` -- new
- `packages/server/src/routes/index.ts` -- modify (add routes)
- `packages/server/src/middleware/auth.ts` -- new (port + adapt)
- `packages/server/src/context-snapshot.ts` -- new (port)
- `packages/server/src/index.ts` -- modify (add WS upgrade)

## Dependencies
- Requires Phase 1 completed (DB schema, Hono skeleton)
