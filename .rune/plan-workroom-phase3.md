# Phase 3: Multi-User Identity & Permissions

## Goal
Multiple Telegram users are properly identified, messages show who said what, and workroom access is managed.

## Tasks
- [ ] Store human identity: `channelMessages.agentId` = "human:<telegramUserId>"
- [ ] Format messages to sessions: `[Workroom | Alice]: <text>`
- [ ] Format session responses in Telegram: `🤖 @fox: <response>`
- [ ] Auto-add humans to workroom on first message (if allowed by bot auth)
- [ ] Add `/workroom members` command — lists humans + sessions
- [ ] Add `/workroom kick @user` command — removes human from workroom
- [ ] Add `isAllowed()` check — respect bot-factory's allowedUserIds

## Acceptance Criteria
- [ ] Claude in each session knows WHO said what (Alice vs Bob)
- [ ] Telegram messages show which session responded (@fox vs @bear)
- [ ] New humans auto-join when they post in workroom topic
- [ ] `/workroom members` shows all participants with roles
- [ ] Unauthorized users cannot post to workroom (bot auth enforced)

## Files Touched
- `packages/server/src/services/workroom-manager.ts` — modify (~30 LOC)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (~30 LOC)
- `packages/server/src/telegram/commands/config.ts` — modify (~30 LOC)

## Dependencies
- Requires Phase 1 completed
- Phase 2 optional (debates work independently of identity)
