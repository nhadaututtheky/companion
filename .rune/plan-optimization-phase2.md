# Phase 2: Architecture Cleanup

## Goal
Break god objects, add missing DB indexes, fix version drift, consolidate error handling. Reduce cognitive load on the two largest files.

## Tasks
- [ ] **A01** — Add DB indexes for hot query paths — `db/schema.ts`, new migration
  - `idx_session_messages_session_ts` on `(sessionId, timestamp)`
  - `idx_daily_costs_date_project` on `(date, projectSlug)` — unique
  - `idx_telegram_mappings_chat_project` on `(chatId, projectSlug)`
- [ ] **A02** — Split `ws-bridge.ts` (2,716 LOC) into focused modules
  - Extract `services/session-lifecycle.ts` — spawn, kill, cleanup, resume
  - Extract `services/message-router.ts` — incoming/outgoing message dispatch
  - Extract `services/context-injector.ts` — CodeGraph, WebIntel, plan mode injection
  - Extract `services/idle-manager.ts` — idle timer, keep-alive, sweep
  - Keep `ws-bridge.ts` as thin orchestrator (~300 LOC)
- [ ] **A03** — Fix version drift — `shared/src/constants.ts`, `services/license.ts`
  - Set `APP_VERSION = "0.7.0"` in shared constants
  - Use `APP_VERSION` in license.ts User-Agent header (not hardcoded)
  - Single source of truth for version string
- [ ] **A04** — Consolidate test directory convention
  - Move `src/services/*.test.ts` → `src/tests/`
  - Remove duplicate `channel-manager.test.ts`
  - Update test runner config if needed
- [ ] **A05** — Fix N+1 query in `findDeadSessionForChat` — `services/session-store.ts:299`
  - Replace per-row SELECT with single JOIN query
- [ ] **A06** — Fix `listResumableSessions` client-side search — `services/session-store.ts:513`
  - Move `search` filter to SQL `LIKE` clause
- [ ] **A07** — Remove `.env` from READABLE_EXTENSIONS — `routes/filesystem.ts`
  - Prevent reading dotenv files from project directories via API

## Acceptance Criteria
- [ ] Query on session_messages by sessionId uses index (EXPLAIN QUERY PLAN)
- [ ] ws-bridge.ts < 400 LOC, extracted modules each < 500 LOC
- [ ] `APP_VERSION` reads from one constant across server
- [ ] All tests pass (existing + moved)
- [ ] No .env files readable via filesystem API

## Files Touched
- `packages/server/src/db/schema.ts` — modify
- `packages/server/src/db/migrations/` — new migration file
- `packages/server/src/services/ws-bridge.ts` — major refactor
- `packages/server/src/services/session-lifecycle.ts` — new
- `packages/server/src/services/message-router.ts` — new
- `packages/server/src/services/context-injector.ts` — new
- `packages/server/src/services/idle-manager.ts` — new
- `packages/shared/src/constants.ts` — modify
- `packages/server/src/services/license.ts` — modify
- `packages/server/src/services/session-store.ts` — modify
- `packages/server/src/routes/filesystem.ts` — modify
- `packages/server/src/tests/` — reorganize

## Dependencies
- Phase 1 completed (security fixes first)
- ws-bridge split is highest-risk — test manually after refactor
