# Phase 3: Layout Shell

## Goal
Transform the outer shell — header bar, sidebar, page background — into soft modern glassmorphism style.

## Tasks
- [ ] Header bar: glass background (blur + semi-transparent), remove solid bg
- [ ] Header: pill-shaped text buttons (the mega-menu triggers from Phase 2)
- [ ] Header: remove box-shadow, use glass bottom-border instead
- [ ] Sidebar icon rail: soften background, remove hard border-right → subtle shadow
- [ ] Sidebar project panel: glass background, rounded-xl edges
- [ ] Page background: subtle gradient (light mode: soft blue-white)
- [ ] Page background: keep mesh gradient for dark mode, add glass tint

## Acceptance Criteria
- [ ] Header visually floats with glass effect
- [ ] Sidebar feels lighter, no hard dividers
- [ ] Background has depth without being distracting
- [ ] Mobile: header still functional, sidebar overlay works

## Files Touched
- `packages/web/src/app/globals.css` — modify (sidebar classes, background)
- `packages/web/src/components/layout/header.tsx` — modify (glass styles)
- `packages/web/src/components/layout/project-sidebar.tsx` — modify
- `packages/web/src/app/page.tsx` — modify (background)

## Dependencies
- Phase 1 (design tokens + glass utilities)
- Phase 2 (header mega-menu structure)
