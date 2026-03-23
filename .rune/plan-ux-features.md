# Feature: 10 UX Features for Companion Web UI

## Overview
Add 10 high-impact UX features to the Companion web dashboard: full-text file search, interactive terminal, multi-tab file viewer, inline diffs, pinned messages, session comparison, cost breakdown, drag-and-drop attachments, session template variables, and enhanced command palette.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Power Tools | ✅ Done | plan-ux-features-phase1.md | Full-text search, interactive terminal, multi-tab file viewer |
| 2 | Feed & Analytics | Pending | plan-ux-features-phase2.md | Inline diffs, pinned messages, session comparison, cost breakdown |
| 3 | Polish & Shortcuts | Pending | plan-ux-features-phase3.md | Drag-drop attachments, template variables, command palette enhancement |

## Key Decisions
- Full-text search uses ripgrep on server (spawns `rg` process) with streaming results via REST
- Interactive terminal uses xterm.js + node-pty on server, bridged over a dedicated WS endpoint
- Multi-tab viewer is local state (Zustand store) — no server changes needed
- Pinned messages stored in localStorage per session (avoids DB migration for v1)
- Session comparison opens in a modal overlay, reuses existing MessageFeed component
- Cost breakdown derives from existing token fields on session object — no new API needed
- Drag-and-drop reuses existing composer-store.addAttachment() — UI-only change
- Template variables extend existing templates table with a `variables` JSON column
- Command palette extends existing cmdk setup in command-palette.tsx

## Dependencies
- Phase 1 features are independent of each other — can be built in any order
- Phase 2 inline diff depends on existing message-feed.tsx diff rendering (already has LCS logic)
- Phase 3 command palette enhancement depends on Phase 1 search (registers search action)
