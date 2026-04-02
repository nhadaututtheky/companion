# Phase 3: Multi-Session Layout

## Goal

Allow users to view multiple sessions side-by-side with resizable split panes, layout presets, and keyboard shortcuts.

## Tasks

- [x] Install `react-resizable-panels` v4
- [x] Create `layout-store.ts` — Zustand store for layout mode + pinned panes (persisted)
- [x] Create `layout-selector.tsx` — toolbar with 4 layout preset buttons (Single/Side-by-side/Stacked/Grid)
- [x] Create `multi-session-layout.tsx` — renders SessionGrid (single) or split panes (multi)
- [x] Create `session-pane.tsx` — lightweight embedded session with chat + composer
- [x] Integrate LayoutSelector into Header
- [x] Replace SessionGrid rendering in dashboard with MultiSessionLayout
- [x] Keyboard shortcuts: Ctrl+1 (single), Ctrl+2 (side-by-side), Ctrl+3 (stacked), Ctrl+4 (grid)
- [x] Build passes

## Files Touched

- `packages/web/src/lib/stores/layout-store.ts` — new
- `packages/web/src/components/layout/layout-selector.tsx` — new
- `packages/web/src/components/layout/multi-session-layout.tsx` — new
- `packages/web/src/components/layout/session-pane.tsx` — new
- `packages/web/src/components/layout/header.tsx` — modify (add LayoutSelector)
- `packages/web/src/components/session/message-composer.tsx` — modify (add compact prop)
- `packages/web/src/app/page.tsx` — modify (use MultiSessionLayout)
- `packages/web/package.json` — modify (add react-resizable-panels)

## Acceptance Criteria

- [x] Single mode shows original SessionGrid (no regression)
- [x] Side-by-side shows 2 horizontal panes with resize handle
- [x] Stacked shows 2 vertical panes with resize handle
- [x] Grid shows 2×2 layout with resize handles
- [x] Empty panes show session picker (list of active sessions)
- [x] Each pane has session header with status, unpin, and open-full-page buttons
- [x] Keyboard shortcuts Ctrl+1-4 switch layout instantly
- [x] Layout mode persisted in localStorage
- [x] Build passes
