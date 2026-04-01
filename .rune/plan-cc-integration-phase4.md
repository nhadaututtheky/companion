# Phase 4: CLI Flag Optimization

## Goal
Adopt safe CLI flags from Claude Code source analysis: `--replay-user-messages` for session resume, `--bare` mode option, and verify `--include-partial-messages` is already used.

## Current State
- `--include-partial-messages` already used in cli-launcher.ts
- `--replay-user-messages` NOT used — would improve resume experience
- `--bare` NOT used — minimal output mode for cost-sensitive sessions
- `--fork-session` NOT used — could enable branch-from-session feature

## Tasks
- [ ] Task 1 — Add --replay-user-messages flag when resuming sessions
- [ ] Task 2 — Add bare mode option to LaunchOptions + session creation
- [ ] Task 3 — Expose bare mode toggle in session config UI
- [ ] Task 4 — Verify: Type check passes

## Acceptance Criteria
- [ ] Resume sessions replay user messages for better context
- [ ] Bare mode available as option for cost-sensitive sessions
- [ ] Zero type errors

## Files Touched
- `packages/server/src/services/cli-launcher.ts` — modify (add flags)
- `packages/server/src/routes/sessions.ts` — modify (accept bare mode)
- `packages/shared/src/types/session.ts` — modify (bare mode in CreateSessionRequest)
