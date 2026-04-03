# Agent SDK Migration — Master Plan

> Goal: Replace `Bun.spawn` CLI wrapping with `@anthropic-ai/claude-agent-sdk`
> Priority: P1 — eliminates NDJSON parsing, typed messages, proper error handling
> Status: ✅ COMPLETE

## Phases

| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Core engine swap | ✅ Done | SDK query(), typed routing, permission bridge, interrupt |
| 2 | Polish & edge cases | ✅ Done | Model switching via setModel(), env vars passthrough |
| 3 | Session features | ✅ Done | Resume, fork, budget caps — already implemented in Phase 1 |

## Key decisions

- Keep `ws-bridge.ts` as the WebSocket layer — SDK feeds messages into it
- `cli-launcher.ts` → `sdk-engine.ts` (old file kept for rollback)
- Permission callback uses Promise + Map pattern (store resolve fn, keyed by requestId)
- Auto-approve integrates cleanly — handleControlRequest flow works for both CLI + SDK
- Feature flag: `USE_SDK_ENGINE=1` to enable SDK mode (CLI is still default)

## What's implemented

- `sdk-engine.ts`: typed async generator loop, inactivity watchdog, permission bridge
- `ws-bridge.ts`: dual CLI/SDK paths for all operations:
  - Session start: `startSessionWithSdk()` / `startSessionWithCli()`
  - User messages: `sendToEngine()` routes to SDK or CLI
  - Model switching: `handleSetModel()` uses `sdkQuery.setModel()` for SDK
  - Interrupt: `handleInterrupt()` uses `sdkQuery.interrupt()` for SDK
  - Permissions: `requestPermission` callback → `handleControlRequest` → auto-approve timer
  - Env vars: merged with process.env and passed to SDK
