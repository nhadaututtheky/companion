# Feature: Companion Dashboard — Multi-Session Grid + UX Overhaul

## Overview
Replace the current 3-column single-session view with a multi-session grid (up to 6), add project browser with new session flow, glassmorphism expand/collapse cards, shared context UI, Telegram settings page, and fix existing bugs (WS auth param, missing message types, command palette).

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Bug Fixes + Foundation | ✅ Done | plan-companion-dashboard-phase1.md | WS key fix, session_init/message_history handling, CommandPalette, directory listing API |
| 2 | Multi-Session Grid | ✅ Done | plan-companion-dashboard-phase2.md | Grid layout (1-6 sessions), mini-terminals, responsive columns |
| 3 | Expand/Collapse Glass Cards | ✅ Done | plan-companion-dashboard-phase3.md | Glassmorphism overlay, expand/collapse animation, keyboard nav |
| 4 | New Session Flow | ✅ Done | plan-companion-dashboard-phase4.md | Project browser modal, directory listing, model/permission select, start session |
| 5 | Shared Context UI | ✅ Done | plan-companion-dashboard-phase5.md | Channel creation, link sessions, shared context panel in expanded view |
| 6 | Telegram Settings | ✅ Done | plan-companion-dashboard-phase6.md | Full Telegram config page, streaming settings, permission forwarding |
| 7 | Activity Terminal | ✅ Done |
| 8 | Magic Ring Shared Context | ✅ Done | plan-companion-dashboard-phase7.md | Bottom panel showing realtime agent logs: thinking, tool use, results, costs |

## Key Decisions
- Grid replaces 3-column layout on dashboard; /sessions and /sessions/[id] pages remain for full history
- Glassmorphism expand uses portal overlay (not route change) for instant open/close
- Max 6 sessions enforced both server-side (API validation) and client-side (UI disable)
- Shared context uses existing `channels` + `channel_messages` DB tables (already in schema)
- WS param fix: `?key=` -> `?api_key=` to match server expectation
- CommandPalette uses cmdk (already installed) with session/project quick actions
- Directory listing endpoint is server-side only (security: reads fs, returns filtered list)
