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
- [ ] T3.1 — Extract `ws-broadcast.ts`
  - Move: `broadcastToAll`, `broadcastToSubscribers`, `addBrowser`, `removeBrowser`, `subscribe`
  - Easiest extraction — pure broadcast logic with no state beyond socket sets
  - `packages/server/src/services/ws-broadcast.ts` — new

- [ ] T3.2 — Extract `ws-permission-handler.ts`
  - Move: `handleControlRequest`, permission response routing, hook event forwarding
  - `packages/server/src/services/ws-permission-handler.ts` — new

- [ ] T3.3 — Extract `ws-context-tracker.ts`
  - Move: `broadcastContextUpdate`, `checkSmartCompact`, context budget integration
  - `packages/server/src/services/ws-context-tracker.ts` — new

- [ ] T3.4 — Extract `ws-stream-handler.ts`
  - Move: `handleStreamEvent`, compact handoff, early results buffer
  - `packages/server/src/services/ws-stream-handler.ts` — new

- [ ] T3.5 — Extract `ws-message-handler.ts`
  - Move: `handleNormalizedMessage`, `handleCLIMessage`, `handleSystemInit`, `handleSystemStatus`, `handleAssistant`, `handleResult`
  - This is the largest extraction — depends on T3.1 (broadcast) and T3.3 (context)
  - `packages/server/src/services/ws-message-handler.ts` — new

- [ ] T3.6 — Extract `ws-session-manager.ts`
  - Move: `startSession`, `getSession`, `getActiveSessions`, `killSession`, health check, cleanup sweep, idle timers
  - `packages/server/src/services/ws-session-manager.ts` — new

- [ ] T3.7 — Slim down `ws-bridge.ts` to orchestrator
  - WsBridge constructor wires up all extracted modules
  - Public API unchanged — external callers don't know about internal split
  - Re-export types for backwards compatibility

- [ ] T3.8 — Verify build + run existing server tests

## Acceptance Criteria
- [ ] ws-bridge.ts under 400 LOC
- [ ] Each extracted module under 500 LOC
- [ ] All existing functionality preserved (zero behavior change)
- [ ] Public WsBridge API unchanged (no breaking changes for routes/telegram)
- [ ] Build passes, existing 22 server tests pass

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
