# Phase 1: DB Migration — New Session Fields

## Goal
Add schema fields for rename, cost budget, and compact mode so subsequent phases have the data layer ready.

## Tasks
- [ ] Add migration file `0007_session_management.sql`
- [ ] Add `name` (text, nullable) — user-defined session name
- [ ] Add `costBudgetUsd` (real, nullable) — max cost warning threshold
- [ ] Add `costWarned` (integer, default 0) — whether budget warning was sent
- [ ] Add `compactMode` (text, default 'manual') — manual | smart | aggressive
- [ ] Add `compactThreshold` (integer, default 75) — % context to trigger compact
- [ ] Update Drizzle schema in `packages/server/src/db/schema.ts`
- [ ] Update shared types `SessionState` in `packages/shared/src/types/session.ts`
- [ ] Update `createSessionRecord` to accept new fields
- [ ] Update `listSessions` / `listResumableSessions` to return name
- [ ] Run migration + type-check

## Acceptance Criteria
- [ ] Migration runs idempotently
- [ ] New fields visible in session list API response
- [ ] Type-check passes
- [ ] Existing sessions unaffected (nullable/default values)

## Files Touched
- `packages/server/src/db/migrations/0007_session_management.sql` — new
- `packages/server/src/db/schema.ts` — modify
- `packages/shared/src/types/session.ts` — modify
- `packages/server/src/services/session-store.ts` — modify

## Dependencies
- None (foundation phase)
