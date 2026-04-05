# Feature: UX Overhaul — Design System Enforcement

## Overview
Fix cluttered, inconsistent UI by extracting shared primitives, enforcing design tokens, fixing typography, and rewriting worst-offender components.

## Phases
| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Foundations | ✅ Done | Shared Button/StatusBadge, Google colors→CSS vars, focus-visible fix |
| 2 | Typography | ✅ Done | Base font bump, hierarchy fix, reduce semibold spam |
| 3 | Worst Offenders | ✅ Done | ring-window + activity-terminal with Tailwind + CSS vars |
| 4 | Polish | ✅ Done | Header 48px, panel widths 360/480/600, ~75 hardcoded hex→CSS vars across 10 files |

## Key Decisions
- Keep Google 4-color brand palette but move to CSS variables
- Base body text: text-sm (14px), not text-xs (12px)
- Min font size: 11px anywhere, 12px for interactive elements
- Min touch target: 44x44px (padding expansion, not visual size change)
- Shared primitives in packages/web/src/components/ui/
