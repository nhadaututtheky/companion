# Phase 5: Magic Ring Simplification

## Status
**DEFERRED (2026-04-17)** — exercising the plan's defer option. Pure internal refactor, no user-visible improvement, and screenshot-test scaffolding adds disproportionate time vs. shipping v0.22.0. Ring currently works and looks fine. Revisit when the color-by-hash palette needs to be customizable.

## Goal
Refactor `components/ring/magic-ring.tsx` from complex inline SVG (6 gradients + 2 filters + color-by-hash) to a data-driven, customizable renderer.

## Current Problem
- 298 lines, 6 gradient defs, 2 SVG filters
- Color-by-hash algorithm hardcoded — can't customize
- 4-color Google scheme embedded
- Conditional logic for session count rendering mixed with visual code
- Hard to understand on first read, impossible to theme

## Design Options
- **Option A**: Canvas-based renderer (imperative, good for complex visuals, harder for React devs)
- **Option B**: Simplified SVG with props-driven gradients (declarative, easier to maintain) ⭐ preferred

## Tasks
- [ ] **Task 5.1** — Extract color logic to `ring-colors.ts` utility
  - `getSessionColor(sessionId: string, palette: string[])` — deterministic hash → palette index
  - Default palette: Google 4-color, but overridable via prop
- [ ] **Task 5.2** — Reduce SVG defs: 1 base gradient + dynamic stops generated from props
  - Drop redundant filter definitions
- [ ] **Task 5.3** — Define clean props API:
  ```tsx
  <MagicRing
    sessions={sessions}
    size={96}
    palette={[...]}
    onClick={...}
  />
  ```
- [ ] **Task 5.4** — Extract session-count rendering to sub-component `<RingDots>`
  - File: `components/ring/ring-dots.tsx` (new)
- [ ] **Task 5.5** — Write visual regression test (screenshot compare via Playwright)
  - Before/after screenshots at 3 session counts (0, 3, 6+)
- [ ] **Task 5.6** — Update callers (Magic Ring is imported in ~3 places per grep) to use new API

## Acceptance Criteria
- [ ] `magic-ring.tsx` reduced from 298 lines to <150 lines
- [ ] Palette customizable via prop (validate with 2 test palettes)
- [ ] Visual output identical to before (screenshot diff tolerance <2%)
- [ ] Props API documented with JSDoc
- [ ] No regression in ring-click / hover / expand behaviors

## Files Touched
- `packages/web/src/components/ring/magic-ring.tsx` — major refactor
- `packages/web/src/components/ring/ring-colors.ts` — new
- `packages/web/src/components/ring/ring-dots.tsx` — new
- `packages/web/src/components/ring/magic-ring.test.tsx` — screenshot test (if feasible)

## Dependencies
- None

## Review Gate
Before merging Phase 5:
- Screenshot compare: before vs after at 0/3/6+ sessions — pass tolerance
- Swap palette via prop → verify colors change
- Click/hover/expand flows work

## Estimated Effort
1-1.5 days (screenshot tests add time)

## Defer Option
If time tight, skip this phase and ship v0.22.0 with Phases 1-4+6. Visual is fine, just not ideal code.
