# Phase 1: Quick Wins — Bug Fixes & Low-Effort High-Impact ✅ DONE

## Goal

Fix confirmed bugs and apply low-effort improvements that reduce friction immediately. No new features — only fixes and cleanup.

## Tasks

### Bugs
- [x] Fix `/model` callback data mismatch — inline keyboard sends short names (haiku/sonnet/opus) but handler expects full model IDs → map short→full in callback handler
  - `packages/server/src/telegram/commands/info.ts` (lines 146-149)
  - `packages/server/src/telegram/commands/panel.ts` (lines 27-29, reference for correct pattern)
- [x] Fix auto-connect race condition — replace `setTimeout(2000)` with `waitForSessionReady()` + queue user message
  - `packages/server/src/telegram/telegram-bridge.ts` (lines 1051-1060)
  - `waitForSessionReady` already exists at lines 777-792
- [x] Fix memory leak — clear `autoApproveTimers` in `killSession` method
  - `packages/server/src/telegram/telegram-bridge.ts` (line 636-672)
  - `packages/server/src/services/session-store.ts` (line 35)
- [x] Audit callback_data sizes — ensure all Telegram callbacks stay under 64 bytes
  - Grep for `callback_data` across all telegram/ files
  - Shorten any patterns that exceed 50 bytes (leave 14-byte margin)

### Cleanup
- [x] Sync version numbers — update `constants.ts` and all `package.json` to v0.4.0
  - `packages/shared/src/constants.ts`
  - `packages/server/package.json`
  - `packages/web/package.json`
  - Root `package.json`
- [x] Fix README mount path docs — change `/root/.claude` references to `/home/companion/.claude`
- [x] Quick session model — read from user preference or env var instead of hardcoded `claude-sonnet-4-6`
  - `packages/server/src/telegram/commands/session.ts` (lines 411-413)

### Context token display fix
- [x] Fix context usage calculation — show estimated current window size, not cumulative total
  - `packages/server/src/telegram/telegram-bridge.ts` (lines 538-543)
  - Option A: Use `context_window_tokens` from CLI if available
  - Option B: Add disclaimer "cumulative, not current window"

## Acceptance Criteria

- [ ] `/model` correctly switches between haiku/sonnet/opus from inline keyboard
- [ ] Auto-connect delivers first message reliably (no 2s race)
- [ ] No orphaned timers after session kill
- [ ] All callback_data < 64 bytes
- [ ] Version shows v0.4.0 consistently
- [ ] README matches actual Docker paths

## Files Touched

- `packages/server/src/telegram/commands/info.ts` — fix model callback
- `packages/server/src/telegram/telegram-bridge.ts` — race condition, timers, context display
- `packages/server/src/telegram/commands/session.ts` — dynamic model default
- `packages/shared/src/constants.ts` — version bump
- `packages/server/package.json` — version
- `packages/web/package.json` — version
- `package.json` (root) — version
- `README.md` — fix mount path docs

## Review Gate

- [ ] `bun run build` passes
- [ ] Manual test: create session via Telegram `/model` → switch models
- [ ] Manual test: send message to new project → no lost messages
- [ ] Manual test: kill session → check no timer warnings in logs
