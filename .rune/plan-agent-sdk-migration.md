# Agent SDK Migration — Master Plan

> Goal: Replace `Bun.spawn` CLI wrapping with `@anthropic-ai/claude-agent-sdk`
> Priority: P1 — eliminates NDJSON parsing, typed messages, proper error handling
> Estimated phases: 3

## Why migrate

- SDK wraps the same CLI internally but provides **typed async iterator** — no manual NDJSON parsing
- `canUseTool` callback replaces stdin-based permission forwarding — cleaner WebSocket bridge
- Session resume/fork via `options.resume` / `options.forkSession` — no flag juggling
- Bun explicitly supported (`executable: 'bun'`)
- Future-proof: protocol changes handled by SDK, not us

## Key constraint

SDK still spawns Claude Code CLI internally → `@anthropic-ai/claude-code` must be installed on host.
This is NOT an API-direct client. It's a typed wrapper over the CLI process.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Core engine swap | ✅ Done | plan-sdk-migration-phase1.md | SDK query(), typed routing, messageHistory cap, permission bridge, interrupt |
| 2 | Polish & edge cases | ⬚ Pending | plan-sdk-migration-phase2.md | Error recovery, permission timeout, model switching, env vars passthrough |
| 3 | Session features | ⬚ Pending | plan-sdk-migration-phase3.md | Resume, fork, named sessions, budget caps, UI controls |

## Key decisions

- Keep `ws-bridge.ts` as the WebSocket layer — SDK feeds messages into it
- `cli-launcher.ts` → `sdk-engine.ts` (new file, old file kept for rollback)
- Permission callback uses Promise + Map pattern (store resolve fn, keyed by requestId)
- Telegram bot adapter unchanged — it receives same BrowserIncomingMessage types

## Risks

- Bun + SDK child process: need to verify `executable: 'bun'` actually works (SDK may still spawn Node.js for CLI)
- `canUseTool` blocks the async iterator — if user never responds, session hangs (need timeout)
- SDK version drift vs CLI version — must pin compatible versions

## Verdict gate

Before starting: verify `@anthropic-ai/claude-agent-sdk` works with Bun runtime by running a minimal test script.
