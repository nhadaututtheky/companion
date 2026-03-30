# Feature: Session Management Overhaul

## Overview
Enhanced session management — rename, smart resume, cost budget warnings, and intelligent auto-compact with handoff mode. Closes the gap between Companion and a production-grade agent platform.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | DB Migration | ✅ Done | plan-session-mgmt-phase1.md | Add name, costBudget, compactMode to schema |
| 2 | Rename Session | ✅ Done | plan-session-mgmt-phase2.md | Web inline edit, Telegram /rename, API |
| 3 | Enhanced Resume | ✅ Done | plan-session-mgmt-phase3.md | Search/filter, cross-platform, any session |
| 4 | Cost Budget Warnings | ✅ Done | plan-session-mgmt-phase4.md | Configurable budget, warn at threshold, manual stop |
| 5 | Smart Compact Handoff | ✅ Done | plan-session-mgmt-phase5.md | 3 modes: manual/smart/aggressive, idle-aware compact |
| 6 | Web Settings UI | ✅ Done | plan-session-mgmt-phase6.md | Unified settings panel for all new config |
| 7 | Stream Bridge | ✅ Done | plan-session-mgmt-phase7.md | Already implemented — /stream, /detach, subscriber system |
| 8 | Web Parity | ✅ Done | plan-session-mgmt-phase8.md | Already implemented — markdown, diff, thinking, tool blocks |

## Key Decisions
- Cost budget: warn only, never auto-kill (user decides)
- Auto-compact: 3 modes — manual (warn only), smart (handoff at idle), aggressive (immediate)
- Smart handoff: Claude summarizes → save snapshot → compact → inject snapshot
- Rename: `name` field separate from `shortId`, persists after session end
- Resume: remove 10-session limit, add search/filter by name/project/date
