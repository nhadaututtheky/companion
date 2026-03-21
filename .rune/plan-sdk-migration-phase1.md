# Phase 1: Core Engine Swap — cli-launcher → SDK query()

## Goal
Replace `Bun.spawn` + NDJSON parsing with `@anthropic-ai/claude-agent-sdk` `query()`.
Keep ws-bridge message routing intact — only change the engine layer.

## Problems with current approach (from user feedback)
1. **Stuck sessions** — CLI process hangs silently, no SDK-level timeout
2. **Unlimited RAM** — messageHistory grows unbounded, no cap
3. **NDJSON parsing fragile** — partial lines, buffer overflow, non-JSON stderr mixed in
4. **No abort** — killing a stuck process is not clean

## Tasks
- [x] Install `@anthropic-ai/claude-agent-sdk`
- [x] Create `sdk-engine.ts` — wraps SDK `query()` as async session runner
- [x] Wire `canUseTool` callback → permission bridge (Promise+Map pattern)
- [x] Add AbortController per session for clean cancellation
- [x] Cap messageHistory to 500 entries (FIFO eviction via `pushMessageHistory`)
- [x] Add per-session memory tracking (approx token count → warn at threshold)
- [x] Update ws-bridge.ts `startSession()` to use sdk-engine instead of cli-launcher
- [x] Wire `handlePermissionResponse` → resolve SDK permission Promises
- [x] Wire `handleUserMessage` → SDK resume (new query with `resume: cliSessionId`)
- [x] Wire `handleInterrupt` → `query.interrupt()`
- [x] Update `addBrowser` → check sdkHandles for connected status
- [x] Update `cleanupZombieSessions` → check sdkHandles
- [x] Fix duplicate `const session` in `killSession`
- [x] Keep cli-launcher.ts as fallback (feature flag `USE_SDK_ENGINE`)
- [x] Type check passes

## Performance safeguards (CRITICAL)
1. **messageHistory cap**: Max 500 entries, FIFO eviction of oldest entries
2. **AbortController**: Every session gets one, used for clean cancel on kill/timeout
3. **Idle timeout**: Existing idle timer + SDK `maxTurns` as hard cap
4. **Stuck detection**: If no message received in 5 minutes → abort + error status
5. **Budget cap**: Pass `maxBudgetUsd` from session settings to SDK

## Files
- `packages/server/src/services/sdk-engine.ts` — new
- `packages/server/src/services/ws-bridge.ts` — modify startSession()
- `packages/server/src/services/cli-launcher.ts` — keep, add deprecation comment
- `packages/server/package.json` — add sdk dependency

## Acceptance criteria
- [x] Sessions start and stream messages via SDK
- [x] Permission prompts route to browser WebSocket and back
- [x] Session kill cleanly aborts SDK query
- [x] messageHistory stays under 500 entries (pushMessageHistory FIFO)
- [x] Stuck sessions auto-abort after 5 min inactivity (sdk-engine watchdog)
- [x] Fallback to cli-launcher via env flag (USE_SDK_ENGINE=1)
- [x] Follow-up user messages resume via new query (cliSessionId)
- [x] Interrupt routes to query.interrupt() for SDK sessions
