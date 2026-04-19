# Phase 1: Safety net + characterization

## Goal

Document the current behavior of both composers in machine-checkable form so Phases 2-4 cannot regress silently. No production code changes in this phase.

## Tasks

- [x] Read `packages/web/src/components/session/message-composer.tsx` end-to-end
- [x] Read `packages/web/src/components/grid/mini-terminal.tsx` CompactComposer
- [x] Build parity matrix (see below)
- [x] Write characterization tests for shared pure logic (slash regex, send-combo, auto-resize, canSend, button color, slash passthrough)

> **Test strategy revision**: project test infra has no jsdom/happy-dom — convention (see `__tests__/components/button.test.ts`) is **pure-logic tests with duplicated source-of-truth as a contract**. So a single `composer-logic.test.ts` file replaces the two component-level files originally planned. Same coverage, matches the codebase pattern.

## Acceptance Criteria

- [x] Parity matrix committed in this file (see below)
- [x] Test file exists and passes against current implementation
- [x] Tests are GREEN — 33 pass / 0 fail / 39ms runtime
- [x] Divergence (Ctrl+Shift+Enter behavior) explicitly locked with a comment

## Files Touched

- `packages/web/src/components/session/__tests__/composer-logic.test.ts` — new (250 LOC, 33 tests)
- `.rune/plan-composer-unify-phase1.md` — this file (parity matrix)

## Dependencies

- None — pure read + new test files

## Parity Matrix (FILL DURING EXECUTION)

| Behavior | Full | Compact | Notes |
|----------|------|---------|-------|
| Enter sends | ✓ | ✓ | both call onSend then clear |
| Shift+Enter newline | ✓ | ✓ | textarea default |
| Slash menu | ✓ | ✓ | both use SlashCommandMenu |
| Auto-resize | ✓ (max 200) | ✓ (max 72) | hook candidate |
| Voice input | ✓ | ✗ | full only |
| Attachments | ✓ | ✗ | full only |
| Image paste | ✓ | ✗ | full only |
| File drop | ✓ | ✗ | full only |
| Inline suggestions | ✓ | ✗ | full only |
| Dispatch suggestion | ✓ | ✗ | full only |
| Saved prompts | ✓ | ✗ | full only |
| Model bar | ✓ | ✗ | full only |
| Quick actions | ✓ | ✗ | full only |
| Stop button (when running) | ✓ | ✗ | full has dedicated stop btn; compact reuses send |
| Drag-over visual | ✓ | ✗ | full only |
| Footer hint text | ✓ | ✗ | "Enter · Shift+Enter newline" |
| Font size | text-sm (14) | 12px inline | DIVERGENT — Phase 5 sync |
| Padding | px-4 py-3 + px-4 py-2.5 | px-3 py-2.5 + px-2.5 py-1.5 | compact tighter |
| Send icon size | 16 | 12 | scaled to variant |
| Border on focus | 1.5px accent | 1px accent | scaled to variant |
