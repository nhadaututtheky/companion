# Feature: Settings Modal + Skills UI

## Overview
Convert `/settings` route into a modal overlay (like VS Code/Warp) and add a "Skills" tab with tree-folder UI to browse .rune/skills + .claude/skills, with recommended skills discovery section.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Settings Modal | 🔄 Active | plan-settings-modal-phase1.md | Extract settings into modal overlay, remove /settings route, Ctrl+, shortcut |
| 2 | Skills API + Tree | ⬚ Pending | plan-settings-modal-phase2.md | GET /api/skills endpoint, tree-folder component with preview pane |
| 3 | Recommended Polish | ⬚ Pending | plan-settings-modal-phase3.md | Recommended skills cards, search/filter, exit animation, enable toggle stub |

## Key Decisions
- Reuse createPortal + Escape + click-outside pattern from NewSessionModal
- Tab state in Zustand (persists across open/close)
- Left vertical sidebar (not horizontal tabs) — fits modal shape, scales to 8+ tabs
- Skills API: filesystem-only, no DB, fresh scan each request
- Recommended Skills: static curated array (no API yet)
- Z-index: modal backdrop z-70, panel z-71 (above NewSessionModal z-60/61)
