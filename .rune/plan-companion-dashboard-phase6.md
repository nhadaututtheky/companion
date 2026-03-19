# Phase 6: Telegram Settings

## Goal
Build a full Telegram configuration page with bot token management, chat/group/topic settings, streaming config, and permission forwarding. Uses existing `telegramBots` and `telegramSessionMappings` DB tables.

## Tasks

### 6.1 Enhance Telegram REST API
- [x] In `packages/server/src/routes/telegram.ts`, add/verify endpoints:
  - `GET /api/telegram/bots` — list all bots with status
  - `POST /api/telegram/bots` — create bot `{ label, role, botToken, allowedChatIds }`
  - `PUT /api/telegram/bots/:id` — update bot config (supports KEEP_EXISTING token)
  - `DELETE /api/telegram/bots/:id` — remove bot
  - `POST /api/telegram/bots/:id/start` — start bot polling
  - `POST /api/telegram/bots/:id/stop` — stop bot polling
  - `GET /api/telegram/bots/:id/test` — test bot token validity (getMe)
- [x] Add `api.telegram.*` methods to web api-client

### 6.2 Create Settings Page Layout
- [x] Refactor `packages/web/src/app/settings/page.tsx`
- [x] Tab navigation: General | Telegram | Appearance
- [x] General tab: API key config, server URL, session limits
- [x] Appearance tab: theme toggle, font size (future)
- [x] Telegram tab: full bot management (primary focus)

### 6.3 Telegram Settings Tab
- [x] Bot list with status indicators (running/stopped/error)
- [x] "Add Bot" form:
  - Bot Token input (password field, show/hide toggle)
  - Label (display name)
  - Role selector (claude/anti/general)
  - Test Token button (calls getMe, shows bot username if valid)
- [x] Per-bot config panel (expandable card):
  - Allowed Chat IDs (comma-separated input or tag input)
  - Start/Stop buttons
  - Delete button (with confirmation)

### 6.4 Streaming Settings Per Bot
- [x] Create `packages/web/src/components/settings/telegram-streaming.tsx`
- [x] Settings per bot:
  - Stream session output: toggle (on/off)
  - Target Chat ID: input
  - Target Topic/Thread ID: input (optional, for forum groups)
  - Message format: compact / full / code-only
  - Permission forwarding: toggle — forward permission requests to Telegram
  - Auto-approve from Telegram: toggle — allow Telegram replies to approve permissions
- [x] Store these settings in `settings` table (key-value) keyed by bot ID

### 6.5 Connection Status Dashboard
- [x] Create `packages/web/src/components/settings/telegram-status.tsx`
- [x] Show per-bot: running status
- [x] "Refresh Status" button

### 6.6 Settings API for Key-Value Store
- [x] `GET /api/settings?prefix=telegram.` — get settings by prefix
- [x] `PUT /api/settings/:key` — upsert setting `{ value }`
- [x] Add to server routes and web api-client

## Acceptance Criteria
- [x] Can add/edit/delete Telegram bots from settings page
- [x] Can test bot token and see bot username
- [x] Can start/stop individual bots
- [x] Streaming settings configurable per bot
- [x] Permission forwarding toggle works
- [x] Settings persist across page reloads
- [x] Status dashboard shows bot health

## Files Touched
- `packages/server/src/routes/telegram.ts` — enhanced with POST /bots, GET /bots/:id/test, KEEP_EXISTING token logic
- `packages/server/src/routes/settings.ts` — new (key-value settings API)
- `packages/server/src/routes/index.ts` — mount settings routes
- `packages/web/src/app/settings/page.tsx` — full rewrite with tabs (General | Telegram | Appearance)
- `packages/web/src/components/settings/telegram-bot-card.tsx` — new
- `packages/web/src/components/settings/telegram-streaming.tsx` — new
- `packages/web/src/components/settings/telegram-status.tsx` — new
- `packages/web/src/lib/api-client.ts` — add telegram + settings methods

## Dependencies
- Phase 1 completed (foundation)
- Independent of Phases 2-5 (can be worked in parallel after Phase 1)
