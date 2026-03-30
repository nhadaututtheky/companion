# Phase 5: Smart Compact Handoff Mode

## Goal
Intelligent auto-compaction that never interrupts active work. 3 modes: manual, smart (handoff at idle), aggressive.

## Smart Handoff Flow
1. Context usage crosses `compactThreshold` (default 75%)
2. Set `compactPending = true` on session
3. Wait for session status transition: `busy → idle`
4. Send handoff message to Claude: "Before compacting, briefly summarize: (1) what you just completed, (2) what tasks remain, (3) your next planned step"
5. Claude responds with summary → save to `.rune/pre-compact-snapshot.md`
6. Send `/compact` command to Claude CLI
7. After compact completes, inject: "Handoff context from before compaction:\n{snapshot}"
8. Clear `compactPending` flag

## Tasks
- [ ] Add `compactPending` flag to ActiveSession in-memory state
- [ ] Monitor context_update events — set compactPending when threshold crossed
- [ ] Listen for status changes (busy→idle) when compactPending=true
- [ ] Implement handoff message send → wait for response → save snapshot
- [ ] Send `/compact` via CLI stdin after snapshot saved
- [ ] Post-compact: detect compact completion, inject snapshot as user message
- [ ] Web: show compact mode indicator in session header (manual/smart/aggressive)
- [ ] Web: "Compact pending..." badge when waiting for idle
- [ ] Telegram: notify when smart compact triggers ("Compacting at idle...")
- [ ] Telegram: `/compact` command respects mode (manual=execute, smart=status)
- [ ] Handle edge case: session ends while compactPending (cancel)
- [ ] Handle edge case: user sends message while compactPending (defer compact)

## Acceptance Criteria
- [ ] Manual mode: only warns, never auto-compacts
- [ ] Smart mode: compacts at idle transition, preserves task context via handoff
- [ ] Aggressive mode: compacts immediately when threshold crossed
- [ ] Handoff snapshot contains meaningful task summary
- [ ] Post-compact Claude continues work seamlessly
- [ ] No compact during active tool use or code generation

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — modify (compact logic, status monitoring)
- `packages/server/src/services/session-store.ts` — modify (compactPending state)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (compact notifications)
- `packages/server/src/telegram/commands/control.ts` — modify (/compact behavior)
- `packages/web/src/components/grid/session-header.tsx` — modify (compact indicator)
- `packages/shared/src/types/session.ts` — modify (compact state types)

## Dependencies
- Phase 1 (compactMode, compactThreshold fields)
