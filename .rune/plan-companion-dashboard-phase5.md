# Phase 5: Shared Context UI

## Goal
Build UI for creating shared context channels, linking sessions to them, and viewing shared messages. Uses existing `channels` and `channel_messages` DB tables.

## Tasks

### 5.1 Add Channel REST API
- [x] Create `packages/server/src/routes/channels.ts`
- [x] `GET /api/channels` — list channels (filter by project, status)
- [x] `POST /api/channels` — create channel `{ projectSlug, type, topic }`
- [x] `GET /api/channels/:id` — get channel with recent messages
- [x] `POST /api/channels/:id/messages` — post message to channel (human role)
- [x] `PATCH /api/channels/:id` — update status (active/concluded)
- [x] `POST /api/channels/:id/link` — link session to channel `{ sessionId }`
- [x] Mount in `packages/server/src/routes/index.ts`
- [x] Add channel methods to web `api-client.ts`

### 5.2 Channel Manager Service
- [x] Create `packages/server/src/services/channel-manager.ts` (if not exists)
- [x] `createChannel(projectSlug, type, topic)` — insert into DB, return channel
- [x] `linkSession(channelId, sessionId)` — update session.channelId in DB
- [x] `postMessage(channelId, agentId, role, content)` — insert channel_message
- [x] `getChannelMessages(channelId, limit)` — fetch recent messages
- [x] `concludeChannel(channelId)` — set status to concluded (via updateChannelStatus)

### 5.3 Shared Context Panel in Expanded View
- [x] Add tab in expanded session sidebar: "Context" tab (next to "Details" tab)
- [x] If session has channelId: show channel messages feed
- [x] If no channel: show "Create shared context" button
- [x] Channel messages: agent role label (color-coded), content, timestamp
- [x] Input to post human messages to channel
- [x] Link other sessions to this channel (dropdown of active sessions)

### 5.4 Channel Creation Flow
- [x] "Create Shared Context" opens inline form in sidebar
- [x] Fields: topic (text), type (debate/review/brainstorm dropdown)
- [x] On create: auto-link current session to channel
- [x] Show "Link Session" dropdown to add more sessions
- [x] Linked sessions show channel indicator in grid (small icon badge)

### 5.5 Channel Badge on Grid Cards
- [x] In `session-header.tsx`: if session has channelId, show link icon (LinkSimple from Phosphor)
- [x] Tooltip: "Linked to: {channel topic}"
- [x] Color: accent blue for active channel, muted for concluded

## Acceptance Criteria
- [x] Can create a shared context channel from expanded session view
- [x] Can link multiple sessions to same channel
- [x] Channel messages visible in shared context panel
- [x] Can post human messages to channel
- [x] Grid cards show link icon when session is in a channel
- [x] Channel API endpoints work correctly

## Files Touched
- `packages/server/src/routes/channels.ts` — new
- `packages/server/src/services/channel-manager.ts` — new
- `packages/server/src/routes/index.ts` — mount channel routes
- `packages/web/src/lib/api-client.ts` — add channel methods
- `packages/web/src/components/grid/expanded-session.tsx` — add context tab
- `packages/web/src/components/grid/session-header.tsx` — add channel badge
- `packages/web/src/components/shared/channel-panel.tsx` — new
- `packages/web/src/components/grid/mini-terminal.tsx` — pass channelInfo to header

## Dependencies
- Phase 3 completed (expanded session overlay with sidebar)

## Status: DONE
