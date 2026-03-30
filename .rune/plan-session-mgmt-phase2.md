# Phase 2: Rename Session

## Goal
Allow users to name/rename sessions from web UI and Telegram. Name persists after session end.

## Tasks
- [ ] Add `PATCH /api/sessions/:id/rename` endpoint with `{ name: string }` body
- [ ] Web: inline edit on session header — click name → text input → save on Enter/blur
- [ ] Web: session list shows name (fallback: shortId → sessionId[:8])
- [ ] Web: session details panel shows editable name
- [ ] Telegram: `/rename <name>` command — rename current chat's session
- [ ] Telegram: `/sessions` shows name alongside shortId
- [ ] Update session-store `updateSessionRecord` to handle name field

## Acceptance Criteria
- [ ] Rename from web updates DB + UI instantly
- [ ] Rename from Telegram confirms with reply
- [ ] Name persists after session ends
- [ ] Name shows in resumable sessions list
- [ ] Empty name clears back to shortId display

## Files Touched
- `packages/server/src/routes/sessions.ts` — modify (add rename endpoint)
- `packages/server/src/services/session-store.ts` — modify
- `packages/web/src/components/grid/session-header.tsx` — modify
- `packages/web/src/components/session/session-list.tsx` — modify
- `packages/web/src/lib/api-client.ts` — modify
- `packages/server/src/telegram/commands/info.ts` — modify (or new rename command)

## Dependencies
- Phase 1 (name field in DB)
