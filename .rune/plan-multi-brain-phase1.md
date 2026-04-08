# Phase 1: Server — Spawn + Wake

## Goal
Add server-side API for one session to spawn child sessions and wake idle children. This is the foundation all other phases build on.

## Existing Infrastructure
- `sessions.parentId` field in DB schema (line 41) — already exists, unused
- `createSessionRecord()` in session-store.ts accepts `parentId` — already wired
- `ws-bridge.startSession()` accepts `parentId` — already wired
- `mention-router.ts` routes @shortId messages cross-session — works today
- `short-id.ts` generates unique shortIds — works today

## Tasks

### 1.1 — Spawn endpoint
- [ ] `POST /api/sessions/:id/spawn` in `packages/server/src/routes/sessions.ts`
- [ ] Request body:
  ```typescript
  {
    name: string;           // "Backend Engineer"
    personaId?: string;     // optional persona
    model?: string;         // default: inherit parent model
    prompt?: string;        // initial task instruction
    role?: string;          // "specialist" | "researcher" | "reviewer"
  }
  ```
- [ ] Validates parent session exists and is active
- [ ] Calls `bridge.startSession()` with `parentId` set
- [ ] Returns `{ sessionId, shortId }` of child
- [ ] Broadcasts `child_spawned` event to parent session subscribers

### 1.2 — Wake endpoint
- [ ] `POST /api/sessions/:id/wake` in sessions.ts
- [ ] Request body: `{ message: string }` — task to wake child with
- [ ] Validates target session exists and is idle (not ended)
- [ ] Calls `bridge.sendUserMessage(targetId, message, "wake")` 
- [ ] If session is ended, returns error suggesting re-spawn

### 1.3 — Parent-child query
- [ ] `GET /api/sessions/:id/children` — list child sessions of a parent
- [ ] Returns array of `{ id, shortId, name, status, model, role, personaId }`
- [ ] `GET /api/sessions/:id/parent` — get parent session info
- [ ] Include `parentId` and `childCount` in session GET response

### 1.4 — Child lifecycle events
- [ ] When child session ends/errors → notify parent via @mention:
  `"[Agent @{childShortId} ({name}) has completed/errored]"`
- [ ] When parent session ends → option to cascade-kill children or let them continue
- [ ] Add `onStatusChange` hook in ws-bridge for child→parent notifications
- [ ] Store `role` and `name` on session record (add to schema if needed)

### 1.5 — CLI tool integration (optional, Phase 1.5)
- [ ] Register `/spawn` as recognized command in CLI message handler
- [ ] When Claude in brain session outputs `/spawn ...`, intercept and call spawn API
- [ ] Return child shortId to brain's conversation context

## Files Touched
- `packages/server/src/routes/sessions.ts` — new endpoints (spawn, wake, children, parent)
- `packages/server/src/services/ws-bridge.ts` — child lifecycle hooks, broadcast events
- `packages/server/src/services/session-store.ts` — query children, include parentId in responses
- `packages/server/src/db/schema.ts` — add `role` column to sessions table (if not exists)
- `packages/shared/src/types.ts` — add spawn/wake types

## Acceptance Criteria
- [ ] Brain session can spawn child via API → child appears with parentId set
- [ ] Brain can wake idle child with a message
- [ ] Children list query returns correct data
- [ ] Child completion notifies parent session
- [ ] Parent end cascades or warns about active children
