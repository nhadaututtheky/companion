# Phase 6: Test Coverage (15% → 60%+)

## Goal
Add tests for all critical paths. Focus on the modules that handle session lifecycle, messaging, and cross-system integration. Target: 60%+ coverage on critical paths.

## Strategy
After Phase 3-4 splits, the extracted modules are small and testable. Write unit tests for each extracted module, then integration tests for the orchestrators.

## Tasks

### 6A — ws-bridge module tests (post-Phase 3 split)
- [ ] T6.1 — `ws-broadcast.test.ts` — broadcast to sockets, subscriber management, spectator fanout
- [ ] T6.2 — `ws-message-handler.test.ts` — CLI message parsing, normalized routing, all message types
- [ ] T6.3 — `ws-session-manager.test.ts` — session CRUD, health check, cleanup, idle detection
- [ ] T6.4 — `ws-context-tracker.test.ts` — token counting, budget allocation, smart compact trigger
- [ ] T6.5 — `ws-permission-handler.test.ts` — permission request/response cycle, hook events
- [ ] T6.6 — `ws-stream-handler.test.ts` — stream buffering, compact handoff, early results
- [ ] T6.7 — `ws-bridge.test.ts` — integration test: full session lifecycle end-to-end

### 6B — Debate & Mention tests
- [ ] T6.8 — `debate-engine.test.ts` — debate round lifecycle, participant management, API calls
- [ ] T6.9 — `mention-router.test.ts` — @mention parsing, routing to sessions, error handling

### 6C — Telegram tests (post-Phase 4 split)
- [ ] T6.10 — `telegram-message-formatter.test.ts` — markdown→HTML, truncation, escaping
- [ ] T6.11 — `telegram-stream-handler.test.ts` — edit-in-place, flush timing, error recovery
- [ ] T6.12 — `telegram-debate-handler.test.ts` — forum topic routing, multi-agent threads

### 6D — Web component tests
- [ ] T6.13 — `design-preview-panel.test.tsx` — artifact rendering, viewport switching, keyboard nav
- [ ] T6.14 — `message-feed.test.tsx` — virtualization, auto-scroll, tool rendering
- [ ] T6.15 — `panel-error-boundary.test.tsx` — error catch, fallback render, recovery

### 6E — E2E critical paths
- [ ] T6.16 — E2E: session create → send message → receive response → stop
- [ ] T6.17 — E2E: design preview panel slide transition → viewport switch → close
- [ ] T6.18 — E2E: settings change → persist → reload → verify

- [ ] T6.19 — Verify all tests pass, generate coverage report

## Acceptance Criteria
- [ ] ws-bridge modules: 80%+ line coverage each
- [ ] debate-engine: 70%+ coverage
- [ ] telegram modules: 70%+ coverage
- [ ] 3 new E2E specs pass
- [ ] Overall: 60%+ server coverage, 30%+ web coverage
- [ ] CI runs all tests on push

## Files Touched
- `packages/server/src/services/__tests__/` — 7 new test files
- `packages/server/src/services/__tests__/` — 2 new (debate, mention)
- `packages/server/src/telegram/__tests__/` — 3 new test files
- `packages/web/src/components/__tests__/` — 3 new test files
- `packages/web/e2e/` — 3 new E2E specs

## Dependencies
- Phase 3 complete (ws-bridge split — tests target extracted modules)
- Phase 4 complete (telegram split — tests target extracted modules)
- Phase 1 complete (error boundary — test the boundary itself)
