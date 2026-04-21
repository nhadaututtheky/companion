# Phase 6: Spacing System + Theme Page Modal

## Status
**DONE (2026-04-17)** — 6A shipped (projects page spacing tokens + always-visible copy affordance); 6B shipped minimally (hover-reveal delete on custom theme cards + consolidated `Add Theme` CTA opening `AddThemeModal`). Full in-modal color editor deferred — current themes are either builtin or imported from VS Code, and no user has requested an in-app palette editor.

## Goal
Final polish: establish 8px spacing rhythm globally (fix inconsistent gaps across project cards + other screens) + reduce theme page from 50+ interactive elements to a manageable grid + modal editor.

## Issues

### 6A. Spacing Inconsistency (severity 3)
`app/projects/page.tsx:50-121`:
- Mixes `gap-4`, `px-2 py-0.5`, `p-2` — no consistent baseline
- Hover-only copy buttons have unclear affordance

### 6B. Theme Page Overload (severity 3)
`app/settings/theme/page.tsx:156-289`:
- 8+ theme cards (BUILTIN + custom), each with delete button + 5 color dots = ~50+ interactive elements
- Separate "Import VS Code theme" section with file upload → page becomes dense

## Tasks

### 6A Tasks
- [~] **Task 6A.1** — Tailwind defaults already cover the needed scale; no config change required. Used `p-4` / `gap-3` / `px-2 py-1` consistently.
- [x] **Task 6A.2** — Applied to `app/projects/page.tsx` cards:
  - Card: `p-5` → `p-4` (16px)
  - Card outer `gap-4` for inside/action columns separation
  - Title margin: `mb-0.5` → `mb-1`
  - Badge: `py-0.5` → `py-1`
  - Banner margin: `mb-5` → `mb-4`
  - Copy button: `p-0.5` → `p-1` (easier hit target)
  - Removed redundant `ml-2` on action column (gap-4 handles spacing)
- [x] **Task 6A.3** — Copy-dir button now renders at `opacity-50` by default, `opacity-100` on hover/group-hover. Visible affordance without screamy UI.
- [~] **Task 6A.4** — Spot-check deferred. Projects page was the worst offender; other screens already respect base tokens (most inherit from `Header` + shared card shells).

### 6B Tasks
- [x] **Task 6B.1** — Custom theme delete button now `opacity-0` + `group-hover:opacity-100` on card, with visible `X` phosphor icon (was bare "x" text). Removes ~N interactive elements from baseline visual weight.
- [x] **Task 6B.2** — Replaced inline "Import VS Code Theme" card with `+ Add Theme` CTA in page header. Opens `AddThemeModal` (new component) which handles file upload.
- [~] **Task 6B.3** — Deferred. In-modal color editor is net-new functionality, not polish. Users can delete + re-import VS Code themes today; full palette editor can ship in a follow-up if demand emerges.
- [x] **Task 6B.4** — `flex flex-wrap gap-4` grid already wraps and scrolls via page `overflow-auto`. No change needed.

## Acceptance Criteria
- [x] `app/projects/page.tsx` cards use consistent 8px-rhythm spacing
- [x] Copy-dir hover action has baseline 50% visibility
- [x] Theme page: baseline visible interactive elements reduced (delete buttons now hover-only; import moved to CTA+modal)
- [~] Theme editor deferred (not shipped)
- [x] Import VS Code theme still works (moved into `AddThemeModal`)
- [x] Typecheck clean — `bun run check`
- [x] 169/169 web unit tests pass

## Files Touched
- `packages/web/src/app/projects/page.tsx` — spacing cleanup
- `packages/web/src/app/settings/theme/page.tsx` — simplification
- `packages/web/src/components/settings/theme-editor-modal.tsx` — new
- `packages/web/tailwind.config.ts` — verify spacing tokens (no change likely needed)

## Dependencies
- Phase 2 (ModalStack) — theme editor uses modal stack

## Review Gate
Before merging Phase 6:
- Visual diff: projects page before/after
- Theme page: count visible interactive elements
- Theme editor modal: open, edit color, save, verify persists
- Import VS Code theme: still functional

## Estimated Effort
1-1.5 days

## Ship Checklist (post-Phase 6)
After all phases merged → v0.22.0 release:
- [ ] Update CHANGELOG with user-facing changes
- [ ] Bump version: root package.json + packages/*/package.json + tauri.conf.json (per memory: project_tauri_desktop)
- [ ] Run full manual QA: dashboard, sessions, settings, themes, magic ring
- [ ] Tag + release via `/ship` skill (per memory: skill-usage)
