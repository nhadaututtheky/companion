# Feature: Simplicity Cleanup — Cross-Codebase Dedup Pass

## Overview

Followup to composer-unify (commits `92aab65` + `4d5e865`). Same playbook applied to 5 other dedup hotspots discovered by codebase scan. Each phase = 1 session, isolated scope, no behavior changes.

## Goals

1. **Centralize formatters** — model labels, tokens, cost, duration, dates spread across 6+ files
2. **Generic loading hook** — `setLoading(true) → try/finally → setLoading(false)` in 10+ pages
3. **Route error middleware** — `try/catch → log + 500` boilerplate in 16+ Hono handlers
4. **Color tokens** — 294 inline hex codes → CSS variable-first palette (deferred to design system pass)

## Phases

| # | Name | Status | Plan File | Effort | LOC saved |
|---|------|--------|-----------|--------|-----------|
| 1 | Web formatters lib | ⬚ Pending | plan-simplicity-cleanup-phase1.md | trivial | ~80 |
| 2 | Date formatters merge | ⬚ Pending | plan-simplicity-cleanup-phase2.md | trivial | ~40 |
| 3 | `useFetch` hook | ⬚ Pending | plan-simplicity-cleanup-phase3.md | small | ~120 |
| 4 | Route error wrapper | ⬚ Pending | plan-simplicity-cleanup-phase4.md | small | ~100 |
| 5 | Color palette | ⬚ Deferred | plan-simplicity-cleanup-phase5.md | small | ~70 |

**Total potential**: ~410 LOC removed without losing functionality.

## Sessioning Strategy

- **Phase 1 + 2 ship together** — both touch `lib/formatters.ts`, trivial, low risk
- **Phase 3** alone — hook abstraction needs careful API design, error path preserved per call site
- **Phase 4** alone — server-side, separate test surface
- **Phase 5** stays deferred until design system pass (CSS variables-first, not JS consts)

## Key Decisions

- **No behavior changes** — every phase is pure refactor. If diff shows behavior diff = revert.
- **Tests gate** — `bun test` must stay green per phase. Server changes also need integration tests if any exist for touched routes.
- **One file per session** for phase plan loading — keep Sonnet context lean.
- **Skip color palette refactor in JS** — wait for CSS variable expansion in design system; refactoring twice wastes effort.

## Risk

Low overall (no logic change), but 2 watchpoints:
- **Phase 3 (`useFetch`)**: error display varies by page (toast vs inline vs silent). Hook must accept `onError` callback; do not force common UX.
- **Phase 4 (route wrapper)**: server logs context (request id, user id). Wrapper must preserve all log fields, not just `err.message`.

## Dependencies

None across phases. Phase 2 piggybacks on Phase 1's `formatters.ts` but can land separately if Phase 1 ships first.
