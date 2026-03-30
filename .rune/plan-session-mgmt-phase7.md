# Phase 7: Stream Bridge (Web ↔ Telegram)

## Goal
Bidirectional streaming — attach Telegram to a web session or vice versa. Work from web, monitor from phone.

## Tasks
- [ ] Telegram: `/stream <sessionId|shortId|name>` — subscribe to existing session's events
- [ ] Telegram: `/detach` — unsubscribe without killing session
- [ ] Server: subscriber system on ActiveSession — Telegram receives all BrowserIncomingMessage events
- [ ] Web → Telegram: assistant messages, tool use, errors stream to Telegram chat
- [ ] Telegram → Web: messages sent from Telegram appear in web terminal
- [ ] Web UI: "Stream to Telegram" button in session header → shows connected bot/chat info
- [ ] Web UI: indicator showing Telegram is attached (icon + chat name)
- [ ] Handle disconnect: if Telegram chat closes, clean up subscriber
- [ ] Handle multiple subscribers: same session can stream to multiple Telegram chats
- [ ] Rate limiting: batch rapid messages to avoid Telegram API limits (max 30 msg/sec)

## Acceptance Criteria
- [ ] Start session on web → /stream from Telegram → see real-time output
- [ ] Send message from Telegram → appears in web session
- [ ] /detach cleanly removes subscriber without affecting session
- [ ] Multiple Telegram chats can subscribe to same session
- [ ] Telegram API rate limits respected (no flood errors)

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — modify (subscriber management)
- `packages/server/src/telegram/commands/session.ts` — modify (/stream, /detach)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (subscriber event handler)
- `packages/web/src/components/grid/session-header.tsx` — modify (stream indicator)
- `packages/shared/src/types/session.ts` — modify (subscriber types)

## Dependencies
- Phases 1-2 (name for /stream lookup)
