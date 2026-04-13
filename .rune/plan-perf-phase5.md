# Phase 5: Server Batching + Memory Leaks

## Goal
Reduce WS message throughput from server and fix memory leaks for long-running instances.

## Tasks
- [ ] Add server-side stream event batching in `ws-stream-handler.ts`
  - Buffer `stream_event` messages for 30ms before broadcasting
  - Concatenate text deltas in buffer window
  - Send single batched message per interval instead of 50–100 individual messages
  - Only batch `stream_event` type — other messages (assistant, result, etc.) send immediately
- [ ] Fix `sessionSettings` leak in `handleCLIExit` (`ws-bridge.ts`)
  - Add `this.sessionSettings.delete(sessionId)` to `handleCLIExit`
- [ ] Fix `pulse-estimator` leak in `handleCLIExit`
  - Add `cleanupPulse(sessionId)` call to `handleCLIExit`
- [ ] Add max retry count to WS reconnect (`use-websocket.ts`)
  - Max 10 retries for same connection
  - On permanent close codes (4001, 4004): don't retry at all
  - Reset retry count on successful connection
- [ ] Add periodic sweep for expired `earlyResults` entries (nice-to-have)

## Acceptance Criteria
- [ ] Network tab: stream events arrive at ~30 messages/sec instead of 100+
- [ ] Server memory stable after 50+ session start/stop cycles
- [ ] WS stops retrying after session is ended (close code 4004)
- [ ] No visual latency increase from batching (30ms is below perception)

## Files Touched
- `packages/server/src/services/ws-stream-handler.ts` — add batching
- `packages/server/src/services/ws-bridge.ts` — fix handleCLIExit cleanup
- `packages/web/src/hooks/use-websocket.ts` — max retries + close code handling

## Dependencies
- Phase 1 (WS singleton) reduces the impact of batching since fewer connections
- But batching still valuable for Telegram + spectator connections
