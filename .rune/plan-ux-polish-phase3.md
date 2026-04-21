# Phase 3: Nav Sidebar Refactor

## Status
**PARTIAL (2026-04-17)** — shipped as file-split only (maintainability win). Full tab-bar UX reorg (Workspace/Tools/Appearance) deferred for user review before changing user-facing structure.

## Goal
Split 594-line `nav-sidebar.tsx` (conflated 4 distinct feature spaces) into smaller, focused files. Preserve current UX (3 separate nav triggers: panels/ai/layout) so this stays a safe refactor.

## What Shipped — Minimum Viable Refactor
Instead of a full UX restructure into 3 new tabs, extracted each existing section into its own file. Triggers, overlay behavior, and menu identity (`activeNavMenu`) all preserved. Zero user-facing change.

### Files Touched
- `packages/web/src/components/layout/nav-sidebar.tsx` — slimmed 594 → **48 lines** (shell only)
- `packages/web/src/components/layout/sidebar/nav-primitives.tsx` — **72 lines** (NavPill, DetailCard, NavItem type)
- `packages/web/src/components/layout/sidebar/panels-content.tsx` — **105 lines** (PANEL_ITEMS + PanelsContent)
- `packages/web/src/components/layout/sidebar/ai-content.tsx` — **97 lines** (AI_ITEMS + AIContent)
- `packages/web/src/components/layout/sidebar/layout-content.tsx` — **262 lines** (LAYOUT_ITEMS + LayoutContent)

### Dead Code Removed
- Unused imports: `useEffect`, `BUILT_IN_PRESETS`
- Unused store reads: `applyPreset`, `uiTheme`

## Acceptance Criteria
- [x] `nav-sidebar.tsx` <120 lines (actual: 48)
- [x] Each content component in its own file <270 lines
- [x] All existing features still accessible (no dropped buttons)
- [x] Typecheck clean
- [x] 169/169 web unit tests pass
- [ ] Manual QA (review gate, see below)

## Deferred — UX Tab-Bar Restructure
The original plan proposed merging the 3 nav menus into ONE overlay with a tab bar (House/Wrench/Palette icons) + localStorage-persisted active tab. This is a **user-facing UX change** (consolidates 3 triggers into 1, renames menus to Workspace/Tools/Appearance). Deferred until user reviews the file-split and decides whether to pursue the full reorg.

### If Pursuing Full Reorg Later
Tasks 3.1 / 3.3 / 3.5 / 3.6 from the original plan would be in scope:
- Single trigger opening one overlay
- Tab bar at top: House / Wrench / Palette
- Consolidate: Workspace = Panels + Layout presets; Tools = AI Context + Wiki + Stats; Appearance = Theme + Mode
- localStorage active-tab persistence
- Accordion groups within tabs
- Keyboard shortcut re-mapping if needed

## Review Gate
Before merging Phase 3:
- [ ] Click each nav trigger (panels/ai/layout) → content renders correctly
- [ ] Hover + active states on all pills still work
- [ ] Click outside sidebar → closes overlay
- [ ] Theme swap + dark/light toggle still apply
- [ ] Activity Log toggle still works from Layout menu

## Estimated Effort
- File split: 0.3 day (actual)
- Full UX reorg (if pursued): +0.7 day
