# Phase 2: Date Formatters Merge

## Goal

Add `fmtDate`, `fmtDateTime`, `fmtRelativeTime` to `lib/formatters.ts` (created in Phase 1). Replace 6+ scattered `toLocaleDateString` / `toLocaleString` calls.

## Prerequisites

- Phase 1 must be merged (`lib/formatters.ts` exists)

## Tasks

- [ ] Add to `packages/web/src/lib/formatters.ts`:
  - `fmtDate(d: Date | string | number): string` — `Apr 19, 2026`
  - `fmtDateTime(d: Date | string | number): string` — `Apr 19, 2026, 14:32`
  - `fmtRelativeTime(d: Date | string | number): string` — `2m ago | 3h ago | 5d ago | yesterday | Apr 12`
  - All accept Date | ISO string | timestamp number; coerce internally
- [ ] Audit `grep -rn 'toLocaleDateString\|toLocaleTimeString\|toLocaleString' packages/web/src` and replace each per-context
- [ ] Known sites:
  - `app/analytics/page.tsx:638` — date
  - `app/schedules/page.tsx:177-182` — datetime
  - `app/page.tsx:~146` — date
  - `components/settings/*` — likely date/datetime
  - `components/session/*` — likely relative
- [ ] Extend `lib/__tests__/formatters.test.ts` with date cases (timezone-stable inputs)
- [ ] Run `bun test` + `bunx tsc --noEmit`

## Acceptance Criteria

- [ ] No `toLocaleDateString` / `toLocaleString` calls outside `lib/formatters.ts`
- [ ] Existing visual output unchanged on representative dates (visual diff or screenshot if UI changed)
- [ ] LOC delta: -40 net across web
- [ ] Tests cover edge: epoch 0, current time, future date, invalid input fallback

## Files Touched

- `packages/web/src/lib/formatters.ts` — add ~40 LOC date formatters
- `packages/web/src/lib/__tests__/formatters.test.ts` — extend with ~6 tests
- `packages/web/src/app/analytics/page.tsx` — replace
- `packages/web/src/app/schedules/page.tsx` — replace
- `packages/web/src/app/page.tsx` — replace
- + any other grep hits

## Implementation Notes

- Use `Intl.DateTimeFormat` (same module-top instance pattern as Phase 1) — NOT raw string concat
- `fmtRelativeTime` should use `Intl.RelativeTimeFormat` — handles i18n correctly
- Locale: hardcode `en-US` for now (matches existing `toLocaleDateString` calls); i18n is future work
- Be careful with timezone: `new Date(isoString)` parses in local time — write tests with explicit UTC inputs
