# Feature: Ring + Debate UX Redesign

## Overview
Fix broken debate UX: embed live debate feed in Ring, persist state, support expand/collapse.

## Phases
| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Live Debate in Ring | ✅ Done | Embed ChannelFeed, bigger window, compact mode |
| 2 | Persist + Root Mount | ✅ Done | Ring at layout level, state survives navigation |
| 3 | Collapse/Expand | ✅ Done | Unread badge, background poll, clear on expand |

## Key Decisions
- Reuse ChannelPanel (already works) — don't rewrite
- Ring window grows to 480×600 in debate mode, stays 300×300 for broadcast
- Ring moves from page.tsx to layout.tsx for cross-route persistence
- Debate state persisted via zustand persist middleware
