# Phase 4: Quick Wins (Error Toolbar + Resume Banner)

## Status
**DONE (2026-04-17)** — 4A shipped as toolbar simplification; 4B shipped as theme-token fix in `ResumeSessionsModal`. Inline `ResumeBanner` in `page.tsx` already theme-correct and minimal; no duplication cleanup required.

## Goal
Fix 2 medium-severity issues in single phase (both ~4-hour jobs): error page toolbar clutter + resume banner duplicate info.

## Issues

### 4A. Error Page Toolbar (severity 4)
`app/settings/errors/page.tsx:125-169`:
- 3 action buttons (Funnel filter, Export, Clear) + dropdown + pagination — all in one row
- Only Clear button gets colored danger state → inconsistent hierarchy

### 4B. Resume Banner Duplicate Info (severity 4)
`app/page.tsx:99-229`:
- Shows session metadata (project, model, date, cost) in both collapsed AND expanded rows
- ~50% info density redundant
- Expands into bottom panel + also shows summary up top
- **🐛 Theme bug** (reported 2026-04-17): Resume AI Sessions modal/banner hardcoded dark theme — doesn't react to Light/Dark/Mono theme switch. Find hardcoded `bg-gray-900` / `text-white` etc. and replace with theme-aware tokens (`bg-bg-card`, `text-text-primary`).

## Tasks

### 4A Tasks
- [x] **Task 4A.1** — Kept filter inline (left) + converted Export to icon-only ghost button + kept Clear as labeled danger. Dropdown rejected — 2 buttons is already lightweight.
- [~] **Task 4A.2** — Pagination already at the bottom (below list) in original; no change needed.
- [x] **Task 4A.3** — Consistent button styling: Export = ghost icon, Clear = danger labeled.
- [~] **Task 4A.4** — No keyboard shortcuts existed; not in scope.

### 4B Tasks — RESCOPED
Original tasks 4B.1-4B.4 assumed duplicate-info banner. Inspection of current `page.tsx` showed `ResumeBanner` is already minimal (just count pill + count badge + "Resume last" button). Remaining task was the theme leak (4B.5).

- [~] **Task 4B.1-4B.4** — stale (banner already minimal).
- [x] **Task 4B.5** 🐛 — Fixed theme leak in `ResumeSessionsModal`: all CSS vars were using non-existent `--bg-card` / `--text-primary` / `--accent` names. Project uses `--color-*` prefix. Replaced all occurrences + killed hardcoded `border-white/10`, `bg-white/5`, `divide-white/5`, `hover:bg-white/[0.03]` etc. with `--color-border`, `--color-bg-elevated`, `--color-bg-hover` tokens. Modal now fully reactive to Light/Dark/Mono theme switch.

## Acceptance Criteria
- [x] Error page toolbar has ≤2 buttons visible (Export icon + Clear danger)
- [x] Pagination at table footer, not header (was already correct)
- [x] Resume banner minimal collapsed (already was, verified)
- [x] Resume modal reactive to theme switch (Light/Dark/Mono)
- [x] All existing behaviors preserved (filter, export, clear, resume, delete)
- [x] Typecheck clean — `bun run check`
- [x] 169/169 web unit tests pass

## Files Touched
- `packages/web/src/app/settings/errors/page.tsx` — toolbar restructure
- `packages/web/src/app/page.tsx` — resume banner simplification (part of modal refactor in Phase 2 may already help)

## Dependencies
- Phase 2 helpful but not blocking — resume banner could become a ModalStack entry

## Review Gate
Before merging Phase 4:
- Error page: trigger filter, export, clear → all still work
- Resume banner: fresh install with mock sessions → collapsed minimal, expanded shows full
- Dismiss banner → reload → stays dismissed

## Estimated Effort
0.5-1 day combined
