# Phase 3: Migrate MessageComposer to ComposerCore

## Goal

Reduce `message-composer.tsx` from 621 LOC of "input UI + glue" to "wrapper that supplies feature state + slots to ComposerCore". No new behavior, no removed behavior — pure structural refactor.

## Strategy

Replace the entire JSX render with `<ComposerCore>` invocation + slot props. State management (text, attachments, voice, suggestions, dispatch) stays in the wrapper. Move only **rendering** into the primitive.

## Tasks

- [x] All slot nodes built (top/banner/attachment/inline-actions/footer)
- [x] `<ComposerCore variant="full">` replaces inline JSX
- [x] Voice input: effective value passed; onChange skipped during listening
- [x] handleSend kept in wrapper (builds context + extracts images)
- [x] Stop button via `showStopButton`
- [x] Drag-drop + paste handlers passed through props
- [x] All tests still green
- [x] TS check clean

## Acceptance Criteria

- [x] `message-composer.tsx`: 621 → 508 LOC (113 line reduction; render-only logic gone)
- [x] All Phase 1 + 2 tests still pass (47/47)
- [x] `bunx tsc --noEmit` exits 0
- [x] `compact` prop kept on interface as no-op (session-pane passes it; documented in JSDoc)
- [x] No unused imports — all retained imports are used by slot rendering

## Risk

- Voice transcript appending — `value` prop is computed each render from text+interim; need to be careful that `onChange` doesn't loop when listening
- Auto-focus restoration after suggestion accept / saved prompt select — currently uses requestAnimationFrame + setSelectionRange. Must preserve.
- The current `compact` prop in MessageComposerProps is **never set true by callers** — confirmed via grep. Safe to remove in Phase 3 (was dead code).

## Files Touched

- `packages/web/src/components/session/message-composer.tsx` — rewrite render path, keep state hooks
