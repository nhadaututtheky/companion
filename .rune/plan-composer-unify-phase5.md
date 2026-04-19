# Phase 5: Visual polish + font sync

## Goal

Address the user's three composer complaints now that the unified primitive exists:
1. Font sizes not in sync
2. Visual feels plain, doesn't use surrounding whitespace
3. Minimize/maximize requires maintaining two components (resolved by Phases 2-4)

## Tasks

- [x] Remove inline `fontSize: 11` overrides in `model-bar.tsx` (3 places) — chips now inherit `text-xs` (12) from parent. Aligns with footer hint text + suggestion strip.
- [x] ComposerCore default state: subtle visible border (was transparent → now 70% opacity glass-border). Always reads as a discrete surface.
- [x] ComposerCore focus shadow: combined accent halo + retained shadow-sm so the input still feels lifted while focused.
- [x] ComposerCore full-variant idle: added inset top-highlight (`inset 0 1px 0 white 4%`) for a touch of depth without changing the layout.

## Deliberately NOT done in this phase

- **FeedCore extraction** — out of scope for the immediate user complaint. `MessageFeed` ↔ `CompactMessageFeed` duplication exists but isn't blocking. Tracked as future work.
- **session-pane.tsx `compact` prop** — currently a no-op pass-through. Honoring it would change visuals for that one consumer; decided to leave alone until users complain.
- **channel-panel.tsx private `MessageComposer`** — third composer in the codebase, scoped to channel posting only. Different feature surface (post button + posting state). Not a fit for ComposerCore as-is.

## Acceptance Criteria

- [x] All Phase 1 + 2 tests still pass (47/47)
- [x] TS check clean (`bunx tsc --noEmit` exits 0)
- [x] No regression in either composer call site

## Files Touched

- `packages/web/src/components/session/model-bar.tsx` — drop 3× `fontSize: 11`
- `packages/web/src/components/composer/composer-core.tsx` — refined idle/focus border + boxShadow
