# Phase 1: Web Formatters Library

## Goal

Extract `fmtTokens`, `fmtCost`, `fmtDuration`, `modelLabel`, `modelColor` from inline definitions in `analytics/page.tsx` into shared `lib/formatters.ts`. Eliminate duplicate `model.includes("opus")` chains in 5+ files.

## Tasks

- [ ] Create `packages/web/src/lib/formatters.ts` with these exports:
  - `fmtTokens(n: number): string` — uses `Intl.NumberFormat('en-US', { notation: 'compact' })`
  - `fmtCost(usd: number): string` — uses `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
  - `fmtDuration(ms: number): string` — `< 1s | Xs | Xm Ys | Xh Ym`
  - `modelLabel(modelId: string): string` — Sonnet 4.6 / Opus 4.7 / Opus 4.6 / Haiku 4.5 / fallback strip prefix (mirror `model-bar.tsx::formatModelName`)
  - `modelColor(modelId: string): string` — return CSS var or hex (read existing inline mappings in analytics + grid)
- [ ] Replace inline definitions in `app/analytics/page.tsx:69-108` with imports
- [ ] Replace `formatModelName` in `components/session/model-bar.tsx:168-176` with import (delete local fn)
- [ ] Replace `model.includes("opus")` chains in:
  - `app/page.tsx` (~line 150)
  - `components/grid/session-header.tsx`
  - `components/grid/expanded-session.tsx`
  - any other hits from `grep -rn 'model.includes' packages/web/src`
- [ ] Add `packages/web/src/lib/__tests__/formatters.test.ts` with ~10 unit cases (round numbers, edge cases like 0, very large)
- [ ] Run `bun test` — all pass
- [ ] Run `bunx tsc --noEmit` — clean

## Acceptance Criteria

- [ ] No `formatModelName`, `fmtTokens`, `fmtCost`, `fmtDuration` defined outside `lib/formatters.ts`
- [ ] No inline `model.includes("opus")` ternary chains in any web component
- [ ] All existing tests still pass
- [ ] New formatter tests cover happy + edge paths
- [ ] LOC delta: -80 net across web

## Files Touched

- `packages/web/src/lib/formatters.ts` — new (~80 LOC)
- `packages/web/src/lib/__tests__/formatters.test.ts` — new (~50 LOC)
- `packages/web/src/app/analytics/page.tsx` — drop ~40 LOC inline helpers
- `packages/web/src/components/session/model-bar.tsx` — drop `formatModelName` local fn
- `packages/web/src/app/page.tsx` — replace inline ternary
- `packages/web/src/components/grid/session-header.tsx` — replace inline
- `packages/web/src/components/grid/expanded-session.tsx` — replace inline

## Implementation Notes

- `modelLabel` must produce IDENTICAL output to existing `formatModelName` — diff before/after on real model IDs
- `Intl.NumberFormat` instances are expensive to create — define them at module top, not per-call
- Don't pre-emptively add formatters that aren't currently duplicated — YAGNI
