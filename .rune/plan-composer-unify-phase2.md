# Phase 2: Extract ComposerCore primitive

## Goal

Build the new shared primitive **without touching either call site**. Phase 2 = "ship the new thing alongside, don't migrate yet". Phase 3 + 4 do the migration once the primitive is proven solid.

## Scope decisions

- **Variant prop**: `variant: "full" | "compact"` controls layout/spacing/font tokens.
- **Feature flags as props**, default OFF. Compact = pass nothing, gets minimal composer. Full = pass everything.
- **Pure-logic split out into hooks** so they're independently testable (and the Phase 1 test file stays valid):
  - `useSlashMenu(text)` → `{ open, query, onSelect, close }`
  - `useAutoResizeTextarea(ref, max)` → `onInput` handler
  - `isSendCombo(e, allowCtrlShift)` → boolean utility
- **Send semantics belong to the consumer** — `onSend(text, attachments?)` callback. Composer never owns send logic.
- **No store coupling at primitive level** — composer-store integration stays in the full wrapper. Compact uses pure local state.

## Tasks

- [x] `composer/key-combos.ts` (35 LOC) — `isSendCombo`, `isSlashPassthrough`
- [x] `composer/use-slash-menu.ts` (32 LOC) — open/query/close state
- [x] `composer/use-auto-resize.ts` (22 LOC) — clamp resize handler
- [x] `composer/composer-core.tsx` (250 LOC) — primitive with `variant` + slot props
- [x] Variant tokens centralized in TOKENS map (full vs compact, all sizing in one place)
- [x] `composer/__tests__/composer-hooks.test.ts` (75 LOC) — 14 tests for utilities
- [ ] (DEFERRED) hook-via-renderHook tests — no jsdom in project, would need infra
- [x] TS check passes
- [x] Both test files (Phase 1 + Phase 2) pass together: 47/47

## Acceptance Criteria

- [x] All four files created
- [x] Phase 1 `composer-logic.test.ts` still passes (47/47 across both)
- [x] No file in `session/` or `grid/` modified — pure addition phase
- [x] `bunx tsc --noEmit` exits 0
- [x] Phase 2 added 339 LOC across 5 new files (within budget)

## Files Touched

- `packages/web/src/components/composer/composer-core.tsx` — new
- `packages/web/src/components/composer/use-slash-menu.ts` — new
- `packages/web/src/components/composer/use-auto-resize.ts` — new
- `packages/web/src/components/composer/key-combos.ts` — new
- `packages/web/src/components/composer/__tests__/composer-hooks.test.ts` — new
- (NO existing files modified)

## Dependencies

- Phase 1 done — characterization tests in place to catch regression in Phase 3-4

## Open questions / risks

- **Slot pattern vs feature flags**: I'll use feature flags for the simple booleans (toggle whole UI sub-tree on/off) and slots for variant-specific custom regions (e.g., model bar's exact placement in full vs hypothetical future placement in compact). Slots only where needed — flags for the rest.
- **Voice + suggestion state** are owned outside ComposerCore (managed by full wrapper) — they're injected via slots. Keeps primitive small.
