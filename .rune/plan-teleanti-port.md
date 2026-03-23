# Feature: Port TeleAnti from MyTrend

## Overview
Port Antigravity/Cursor IDE remote control from MyTrend to Companion. Enables controlling AI IDEs via Telegram with CDP (Chrome DevTools Protocol).

## Phases
| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Core CDP + Watchers | 🔄 Active | Copy anti-cdp.ts, anti-chat-watcher.ts, anti-task-watcher.ts |
| 2 | Anti Commands | ⬚ Pending | /anti panel, sub-commands, callback handlers |
| 3 | Telegram Bridge Integration | ⬚ Pending | Anti-mode routing, auto-start watcher |
| 4 | Web UI Settings | ⬚ Pending | Anti bot settings modal in Telegram page |

## Key Decisions
- Copy from MyTrend with minimal changes (adapt imports only)
- Companion already has multi-bot infrastructure + `role: 'anti'` in DB schema
- CDP is Antigravity-focused initially, Cursor adaptation later
