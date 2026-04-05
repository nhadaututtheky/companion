# Phase 2: Live Session Debates in Workrooms

## Goal
`/debate` inside a workroom uses joined live Claude Code sessions instead of API-only agents.

## Tasks
- [ ] Add `startLiveDebate()` to debate-engine.ts — routes prompts to live sessions
- [ ] Extend `DebateAgent` interface with optional `sessionId` + `shortId` fields
- [ ] Add `injectSessionResponse(channelId, shortId, content)` for collecting responses
- [ ] Emit `session:result` event from ws-bridge when session completes a turn
- [ ] Add `startWorkroomDebate()` to workroom-manager.ts — orchestrates assignments
- [ ] Modify `/debate` handler: detect workroom context, use live sessions if available
- [ ] Add 30s timeout per agent per round with partial response fallback

## Acceptance Criteria
- [ ] `/debate review #fox #bear` inside workroom starts debate using live sessions
- [ ] Each session receives its role-specific prompt and responds as Claude Code
- [ ] Responses are collected and posted to the channel with round tracking
- [ ] Convergence detection still works (reuses existing detector)
- [ ] Timeout handles slow/stuck sessions gracefully
- [ ] Verdict is posted to the workroom topic when debate concludes

## Files Touched
- `packages/server/src/services/debate-engine.ts` — modify (~120 LOC)
- `packages/server/src/services/workroom-manager.ts` — modify (~50 LOC)
- `packages/server/src/services/ws-bridge.ts` — modify (~10 LOC event emission)
- `packages/server/src/telegram/commands/config.ts` — modify (~40 LOC)

## Dependencies
- Requires Phase 1 completed (workroom lifecycle + fan-out)
