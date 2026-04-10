# Phase 6: Test Coverage (15% → 60%+)

## Goal
Add tests for all critical paths. Focus on the modules that handle session lifecycle, messaging, and cross-system integration. Target: 60%+ coverage on critical paths.

## Strategy
After Phase 3-4 splits, the extracted modules are small and testable. Write unit tests for each extracted module, then integration tests for the orchestrators.

## Tasks

### 6A — ws-bridge module tests (post-Phase 3 split)
- [x] T6.1 — `ws-broadcast.test.ts` — 7 tests: broadcast to sockets, subscriber management, error resilience
- [x] T6.2 — `ws-stream-handler.test.ts` — 9 tests: early results buffer (CRUD, replay, overwrite), stream events, tool progress
- [x] T6.3 — `ws-context-tracker.test.ts` — 10 tests: token tracking, context update deltas, control response, cost budget (warning/critical/no-refire), injection
- [x] T6.4 — `ws-permission-handler.test.ts` — 12 tests: permission response (SDK resolver, CLI NDJSON, deny, timer clear, broadcast), control request (auto-approve, normal, bypass), interrupt (CLI/SDK), hook events

### 6B — Debate & Mention tests
- [x] T6.5 — `debate-engine.test.ts` — 8 tests: state tracking, all 4 formats, custom config, active listing, human injection
- [x] T6.6 — `mention-router.test.ts` — 10 tests: parse single/multi mentions, self-mention ignore, dedup, clean message, debate agent resolve, routing

### 6C — Telegram tests (post-Phase 4 split)
- [x] T6.7 — `formatter.test.ts` — 38 tests: HTML escaping, markdown conversion (code/bold/italic/links/headings/strikethrough/unclosed fences), split message, expandable, strip tags, format helpers, danger detection, permission formatting, tool actions

### 6D — Deferred (out of scope this session)
- [ ] T6.8-T6.15 — Web component tests (design-preview-panel, message-feed, error-boundary)
- [ ] T6.16-T6.18 — E2E critical paths
- [ ] T6.19 — Coverage report

## Results
- **94 new tests across 7 files, 0 failures**
- All critical server modules covered: ws-broadcast, ws-stream-handler, ws-context-tracker, ws-permission-handler, mention-router, debate-engine, telegram formatter
- 28 pre-existing test failures (project-profiles, share-manager, workflow-templates) — not introduced by this phase

## Acceptance Criteria
- [x] ws-bridge modules: core functions tested (broadcast, stream, context, permission)
- [x] debate-engine: state management + format definitions tested
- [x] mention-router: parsing + routing tested
- [x] telegram formatter: 38 tests covering all public functions
- [ ] Web component tests (deferred)
- [ ] E2E tests (deferred)

## Files Touched
- `packages/server/src/services/ws-broadcast.test.ts` — new (7 tests)
- `packages/server/src/services/ws-stream-handler.test.ts` — new (9 tests)
- `packages/server/src/services/ws-context-tracker.test.ts` — new (10 tests)
- `packages/server/src/services/ws-permission-handler.test.ts` — new (12 tests)
- `packages/server/src/services/mention-router.test.ts` — new (10 tests)
- `packages/server/src/services/debate-engine.test.ts` — new (8 tests)
- `packages/server/src/telegram/formatter.test.ts` — new (38 tests)

## Dependencies
- Phase 3 complete (ws-bridge split — tests target extracted modules) ✅
- Phase 4 complete (telegram split — tests target extracted modules) ✅
- Phase 1 complete (error boundary — test the boundary itself) ✅
