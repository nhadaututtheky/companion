# Phase 12: Stream Bridge (Web ↔ Telegram) Bidirectional

## Goal
Any session can be observed from both Web and Telegram simultaneously. Start from web, monitor on phone. Start from Telegram, view on web. Bidirectional message routing.

## Current State
- `/stream <sessionId>` Telegram command — DONE (observe web sessions from Telegram)
- `/detach` — DONE (unsubscribe)
- WsBridge supports multiple subscribers per session — DONE
- Stream callback handler in panel.ts — DONE

## Missing
1. Web UI "Stream to Telegram" button
2. Server API endpoint to trigger bot subscription
3. Telegram→Web: messages from Telegram show in web message feed
4. Web UI indicator showing Telegram is connected

## Tasks

### 12.1 Server: Stream Management API
- [ ] `POST /api/sessions/:id/stream/telegram` — subscribe Telegram bot to session
  - Body: `{ chatId: number, topicId?: number }`
  - Server calls `bridge.attachStreamToSession(sessionId, chatId, topicId)`
  - Returns `{ success: true }`
- [ ] `DELETE /api/sessions/:id/stream/telegram` — detach
- [ ] `GET /api/sessions/:id/stream` — list active stream subscribers

### 12.2 Web UI: Stream Controls
- [ ] Session details sidebar: "Stream to Telegram" button
  - Shows list of configured Telegram bots/chats
  - Click to attach
  - Shows "Streaming to Telegram" badge when active
- [ ] Session header: small Telegram icon when streaming

### 12.3 Telegram→Web Message Routing
- [ ] When user sends message from Telegram to a streamed session:
  - WsBridge already routes to CLI
  - Also broadcast as `user_message` to web subscribers
  - Web shows message with "via Telegram" source badge
- [ ] Source field already in message store — use it for display

### 12.4 Web→Telegram Status Updates
- [ ] When web session status changes, Telegram subscriber gets notified
- [ ] Already working via WsBridge subscriber pattern

## Files
- `packages/server/src/routes/sessions.ts` — add stream API endpoints
- `packages/web/src/components/session/session-details.tsx` — add stream button
- `packages/web/src/components/session/message-feed.tsx` — show source badge
- `packages/server/src/telegram/telegram-bridge.ts` — expose attachStreamToSession via API

## Acceptance Criteria
- [ ] Can start session on web, click "Stream to Telegram", see output on phone
- [ ] Messages sent from Telegram appear in web feed with source badge
- [ ] Can detach Telegram stream without killing session
- [ ] Stream status visible in both web and Telegram
