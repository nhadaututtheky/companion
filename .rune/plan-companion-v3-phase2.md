# Phase 2: Protocol & Capture

## Goal

Clean up WebSocket message protocol with proper namespacing and add virtual screen capture for session snapshots. Foundation for QR sharing in Phase 3.

## Tasks

### 2.1 IPC/WS Message Namespacing — DEFERRED

> **Why deferred**: Refactor touches ~20+ message types across 3 packages (server, web, telegram).
> ws-bridge alone is 2400+ lines. Backward compat layer adds complexity.
> Zero user-visible benefit — protocol works fine as-is.
> High risk of breaking existing functionality for no UX gain.
> Will revisit if protocol becomes a real bottleneck or before v4.

### 2.2 Virtual Screen Capture — DONE
- [x] VirtualScreen instance per session in ActiveSession (session-store.ts)
- [x] Feed CLI output into per-session VirtualScreen (ws-bridge handleCLIMessage)
- [x] `sessionSnapshots` DB table + migration (0012_session_snapshots.sql)
- [x] `POST /api/sessions/:id/snapshots` — capture current terminal screen
- [x] `GET /api/sessions/:id/snapshots` — list snapshots with preview
- [x] `GET /api/sessions/:id/snapshots/:snapshotId` — get full content
- [x] API client methods (`api.snapshots.capture/list/get`)
- [x] SnapshotPanel component in session details — capture button + expandable list + full-content viewer

## Acceptance Criteria

- [x] Snapshot captures full terminal buffer as text
- [x] Snapshots persist across server restart (SQLite)
- [x] Snapshot gallery shows timeline of captures with preview
- [x] Full snapshot content viewable in-place
- [ ] ~~All WS messages follow `namespace:action` format~~ (deferred)

## Status: 2.2 DONE, 2.1 DEFERRED

## Files Created/Modified
- `packages/server/src/db/schema.ts` — modified (sessionSnapshots table)
- `packages/server/src/db/migrations/0012_session_snapshots.sql` — new
- `packages/server/src/services/session-store.ts` — modified (VirtualScreen per session)
- `packages/server/src/services/ws-bridge.ts` — modified (feed CLI output to virtualScreen)
- `packages/server/src/routes/sessions.ts` — modified (snapshot CRUD routes)
- `packages/web/src/lib/api-client.ts` — modified (snapshots API client)
- `packages/web/src/components/session/session-details.tsx` — modified (SnapshotPanel component)
