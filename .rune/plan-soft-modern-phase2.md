# Phase 2: Header Mega-Menu

## Goal
Replace 12+ individual icon buttons in header with 4-5 grouped text buttons. Each button opens a **floating glass popover** (NOT a modal — no backdrop overlay). Only the card itself has glass effect, rest of the page stays 100% clear and interactive. VinFast configurator drill-down pattern.

## Key UX Rules
- **NO full-screen backdrop blur/overlay** — sessions behind stay crisp and untouched
- **NO single container/table** for all sub-items — each sub-item is its own separate glass card/pill
- Gaps between cards are fully transparent → sessions visible through the gaps
- Only each individual card has `backdrop-filter: blur()` on itself
- Detail panel on the right is also its own separate glass card
- Popover behavior: anchored below trigger button, click outside → dismiss
- Like a dropdown, NOT like a modal

## Button Groups

| Group Label | Contains | Detail Panel Shows |
|-------------|----------|-------------------|
| **Panels** | Files, Browser, Search, Terminal | Toggle on/off, active panel preview |
| **AI** | AI Context, Wiki, Stats | Feature controls, quick info |
| **Expert** | List of experts/personas | Expert details, status, config |
| **Layout** | Single, Split, Grid + Template picker | Layout options, template selection |

Standalone: Search (⌘K), Theme toggle, Settings gear

## Interaction Flow
1. Click "Panels" text button on header
2. Glass popover card appears anchored below button (no backdrop)
3. Left column: vertical list of sub-items (Files, Browser, Search, Terminal)
4. Click "Files" → right column shows Files panel preview/toggle
5. Click outside card or press Escape → popover dismisses instantly
6. Sessions behind are 100% visible and clear the entire time

## Tasks
- [ ] Create `FloatingMenu` component — positions sub-items + detail, anchored to trigger
- [ ] Each sub-item is a **separate glass pill/card** — NOT inside a shared container
- [ ] Glass effect per card: `background: rgba(255,255,255,0.85); backdrop-filter: blur(16px)`
- [ ] Gaps between sub-item cards are fully transparent (no wrapper background)
- [ ] Detail panel is its own separate glass card, positioned to the right
- [ ] NO backdrop overlay element — just individual cards floating over content
- [ ] Create `FloatingMenuItem` — individual glass pill with icon + label + active state
- [ ] Create `FloatingMenuDetail` — separate glass card for right-side content
- [ ] Define menu group configs (panels, ai, expert, layout)
- [ ] Update `header.tsx` — replace icon row with grouped text buttons
- [ ] Wire panel toggles through FloatingMenu instead of direct icon clicks
- [ ] Wire expert/persona list through FloatingMenu
- [ ] Wire layout selector through FloatingMenu
- [ ] Add click-outside dismiss + Escape key handler (invisible click-catcher, not visible backdrop)
- [ ] Add enter/exit animation (scale + opacity, 200ms)
- [ ] Z-index: above session cards but below settings modal
- [ ] Mobile: floating menu becomes bottom sheet or full-width dropdown
- [ ] Preserve ⌘K shortcut for search (standalone)

## Acceptance Criteria
- [ ] Header shows 4-5 text labels instead of 12+ icons
- [ ] Clicking a label opens glass popover card
- [ ] Popover has left sub-items + right detail panel
- [ ] **NO backdrop** — sessions/content 100% visible and clear behind popover
- [ ] Only the popover card itself has glass/blur effect
- [ ] Click outside dismisses popover
- [ ] All existing panel/layout/expert functionality preserved
- [ ] Mobile responsive

## Files Touched
- `packages/web/src/components/layout/header.tsx` — major rewrite
- `packages/web/src/components/layout/floating-menu.tsx` — NEW
- `packages/web/src/components/layout/floating-menu-panels.tsx` — NEW (panel group content)
- `packages/web/src/components/layout/floating-menu-ai.tsx` — NEW (AI group content)
- `packages/web/src/components/layout/floating-menu-expert.tsx` — NEW (expert group content)
- `packages/web/src/components/layout/floating-menu-layout.tsx` — NEW (layout group content)

## Dependencies
- Phase 1 (glass utilities, design tokens)
