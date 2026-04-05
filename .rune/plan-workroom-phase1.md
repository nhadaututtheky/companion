# Phase 1: Workroom Lifecycle & Fan-out

## Goal
Users can `/workroom` in Telegram to create a shared space, join sessions, and messages from any human automatically fan out to all joined sessions.

## Tasks
- [ ] Extend `ChannelType` to include `"workroom"` in channel-manager.ts
- [ ] Create `workroom-manager.ts` — WorkroomState, activeWorkrooms map, CRUD ops
- [ ] Add `workroomByTopic` map for fast chatId:topicId → channelId lookup
- [ ] Add `fanOutToSessions()` with cooldown guard (2s per session)
- [ ] Extend ws-bridge.ts source guard: skip mention routing for source="workroom"
- [ ] Add workroom detection in telegram-bridge.ts `handleTextMessage`
- [ ] Add `/workroom [topic]` command — creates channel + forum topic
- [ ] Add `/workroom join #fox #bear` — links sessions to workroom
- [ ] Add `/workroom leave #fox` — unlinks session
- [ ] Add `/workroom end` — destroys workroom, restores session subscribers
- [ ] Re-route session subscribers to workroom topic on join, restore on leave

## Acceptance Criteria
- [ ] `/workroom review PR #42` creates a forum topic and workroom channel
- [ ] `/workroom join #fox #bear` links two active sessions
- [ ] Human message in workroom topic reaches both @fox and @bear
- [ ] Session responses appear in the workroom topic (not their own topics)
- [ ] No message loops — session responses don't trigger further fan-outs
- [ ] `/workroom end` restores sessions to their original topics

## Files Touched
- `packages/server/src/services/channel-manager.ts` — modify (add type)
- `packages/server/src/services/workroom-manager.ts` — new (~250 LOC)
- `packages/server/src/services/ws-bridge.ts` — modify (1 line source guard)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (~30 LOC)
- `packages/server/src/telegram/commands/config.ts` — modify (~100 LOC)

## Dependencies
- None — builds on existing channel + mention + forum topic infrastructure
