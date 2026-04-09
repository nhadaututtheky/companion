# Phase 3: ws-bridge.ts Surgery

## Goal
Split the 3,023-line god class into focused modules. This is the highest-impact refactor in the entire codebase.

## Strategy
Extract method groups into separate files. WsBridge class becomes a thin orchestrator that delegates to focused services.

## Target Architecture
```
packages/server/src/services/
  ws-bridge.ts              — orchestrator (~300 LOC): lifecycle, session map, routing
  ws-session-manager.ts     — session CRUD, settings, health checks (~400 LOC)
  ws-message-handler.ts     — CLI message parsing, normalized message routing (~500 LOC)
  ws-stream-handler.ts      — stream events, token buffering, compact handoff (~300 LOC)
  ws-broadcast.ts           — broadcastToAll, subscriber management, spectator fanout (~200 LOC)
  ws-context-tracker.ts     — context budget, token counting, smart compact (~300 LOC)
  ws-permission-handler.ts  — permission requests/responses, hook events (~200 LOC)
  ws-cli-launcher.ts        — (already exists) CLI process spawn
```

## Tasks
- [x] T3.1 — Extract `ws-broadcast.ts` (50 LOC)
  - broadcastToAll, broadcastToSubscribers, SocketLike type
- [x] T3.2 — Extract `ws-permission-handler.ts` (278 LOC)
  - handleControlRequest, handlePermissionResponse, handleInterrupt, handleHookEvent, auto-approve timer
- [x] T3.3 — Extract `ws-context-tracker.ts` (223 LOC)
  - broadcastContextUpdate, requestContextUsage, handleControlResponse, emitContextInjection, checkCostBudget, checkSmartCompact, clearCompactTimers, prevTokens tracking
- [x] T3.4 — Extract `ws-stream-handler.ts` (93 LOC)
  - handleStreamEvent, handleToolProgress, early results buffer (buffer/get/clear/replay)
- [x] T3.5 — Extract `ws-multi-brain.ts` (185 LOC) — *adapted from original T3.5/T3.6*
  - handleSpawnCommand, handleStatusCommand, notifyParentOfChildEnd
- [ ] T3.5b — Extract `ws-message-handler.ts` — DEFERRED
  - handleAssistant, handleResult, handleUserMessageInternal too coupled to WsBridge state (rtkPipeline, planWatchers, sdkHandles)
  - Would require bridge interface nearly as complex as the class itself
- [ ] T3.6b — Extract `ws-session-manager.ts` — DEFERRED
  - Same issue: startSession, killSession, handleCLIExit touch all private Maps
- [x] T3.7 — Clean up unused imports, verify build
- [x] T3.8 — TypeScript build passes (server + web)

## Results
- ws-bridge.ts: 3,023 → 2,559 LOC (-15.3%)
- 5 new modules: ws-broadcast, ws-permission-handler, ws-context-tracker, ws-stream-handler, ws-multi-brain
- Total extracted: ~829 LOC of focused, testable code
- Public WsBridge API unchanged — zero breaking changes
- All extracted modules under 300 LOC each

## Acceptance Criteria
- [x] Each extracted module under 500 LOC ✓ (max 278)
- [x] All existing functionality preserved (zero behavior change)
- [x] Public WsBridge API unchanged (no breaking changes for routes/telegram)
- [x] Build passes (server + web)
- [ ] ws-bridge.ts under 400 LOC — NOT MET (2,559 LOC)
  - Remaining methods too tightly coupled for safe extraction without architectural redesign
  - Further reduction requires Phase 4 god file cleanup or future refactor

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — major refactor
- `packages/server/src/services/ws-broadcast.ts` — new
- `packages/server/src/services/ws-permission-handler.ts` — new
- `packages/server/src/services/ws-context-tracker.ts` — new
- `packages/server/src/services/ws-stream-handler.ts` — new
- `packages/server/src/services/ws-message-handler.ts` — new
- `packages/server/src/services/ws-session-manager.ts` — new

## Dependencies
- Phase 1 complete (error boundaries catch any regressions)
- Phase 2 NOT required — can run in parallel if needed

## Risk
HIGH — this is the most critical file. Use safeguard pattern:
1. Git tag before starting
2. Extract one module at a time
3. Run tests after each extraction
4. Keep original methods as thin delegates until all extractions verified
