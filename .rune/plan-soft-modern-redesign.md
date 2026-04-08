# Feature: Soft Modern UI Redesign

## Overview
Redesign Companion's web UI following "Soft Modern / Clean SaaS" style — glassmorphism cards, pill-shaped elements, soft shadows instead of borders, generous whitespace, blue primary accent. Inspired by Dabilux Booker + VinFast configurator's transparent, floating, drill-down navigation aesthetic.

## Design Principles (from reference)
1. **Glassmorphism** — `backdrop-filter: blur()` + semi-transparent backgrounds
2. **Pill shapes** — border-radius 16-24px for cards, full-round for buttons/tabs
3. **Shadow-first** — replace hard borders with soft shadows to separate layers
4. **Blue monochrome** — single accent color, no rainbow
5. **Breathing space** — generous padding, whitespace between elements
6. **Floating cards** — elevated cards over subtle backgrounds
7. **Drill-down mega-menu** — header groups → floating overlay with sub-menu + detail panel (VinFast pattern)
8. **Non-destructive overlay** — floating menus overlay content, sessions still visible behind glass blur

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Design Tokens | ✅ Done | plan-soft-modern-phase1.md | CSS variables, shadows, radius, glass utilities |
| 2 | Header Mega-Menu | ✅ Done | plan-soft-modern-phase2.md | Group icons into text buttons, FloatingMenu component |
| 3 | Layout Shell | ✅ Done | plan-soft-modern-phase3.md | Header glass, sidebar softening, page background |
| 4 | Cards & Grid | ✅ Done | plan-soft-modern-phase4.md | Session cards floating, pill badges, breathing space |
| 5 | Forms & Controls | ✅ Done | plan-soft-modern-phase5.md | Pill buttons, glass command palette, pill tabs/steps |
| 6 | Modals & Settings | ✅ Done | plan-soft-modern-phase6.md | Glass settings/mcp/rtk/skills, soft telegram cards |
| 7 | Bottom Stats Bar | ✅ Done | plan-soft-modern-phase7.md | Floating glass pill bar, slide-up animation, moved from header |
| 8 | Polish & Dark Mode | ✅ Done | plan-soft-modern-phase8.md | Dark glass border bump, scrollbar, activity terminal glass, panel borders |

## Key Decisions
- Keep existing color palette (Google colors) but soften the application
- Header icon buttons → grouped text buttons with drill-down floating menus
- **Floating menus = popover cards with glass bg, NOT modals** — NO backdrop overlay
- Only the popover card itself has glass effect; sessions behind stay 100% clear and untouched
- Click outside floating menu → dismiss (no page navigation)
- Dark mode gets glass treatment too (frosted dark glass)
- Must preserve all existing functionality
- Mobile: floating menus become full-width bottom sheets or adapted overlays
