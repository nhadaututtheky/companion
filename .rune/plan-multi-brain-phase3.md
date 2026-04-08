# Phase 3: Telegram — Auto Topics for Agents

## Goal
When brain session spawns agents on Telegram, bot auto-creates forum topics (in both private chat and group) for each agent. Each agent gets its own topic thread.

## Prerequisites
- Phase 1 complete (spawn API works)
- Grammy bot updated to support Bot API 9.x (Feb 2026 — `createForumTopic` in private chats)
- User's Telegram chat has forum/topics mode enabled

## Tasks

### 3.1 — Grammy version check
- [ ] Verify Grammy version supports `createForumTopic` in private chats
- [ ] Update Grammy if needed (Bot API 9.x support)
- [ ] Test `createForumTopic` in private chat (not just groups)

### 3.2 — Agent topic creation
- [ ] In `telegram-bridge.ts`, hook into `child_spawned` event
- [ ] When brain session spawns child:
  ```typescript
  const topic = await bot.api.createForumTopic(chatId, `${emoji} ${agentName}`);
  // Store mapping: childSessionId → topicId
  setMapping(chatId, topic.message_thread_id, {
    sessionId: childSessionId,
    projectSlug: parentMapping.projectSlug,
    model: childModel,
    topicId: topic.message_thread_id,
  });
  ```
- [ ] Send intro message in new topic: "Agent started. Task: {prompt}"
- [ ] Subscribe child session to topic for message forwarding

### 3.3 — Agent topic lifecycle
- [ ] When child session ends → send completion message in topic
- [ ] Option: auto-close topic (`closeForumTopic`) when agent done
- [ ] When parent session ends → send summary in brain's General topic
- [ ] Handle topic deletion by user gracefully (don't crash)

### 3.4 — Cross-topic mention routing  
- [ ] User in brain topic types `@backend check the API` → routes to backend agent's session
- [ ] Agent reply appears in agent's own topic (not brain topic)
- [ ] Brain can summarize in General: "[@backend completed payment API ✓]"

### 3.5 — Brain summary in General
- [ ] Brain periodically posts progress updates to main topic:
  ```
  📊 Workspace Progress:
  ✅ @backend — Payment API done
  🔄 @frontend — Building checkout UI (60%)
  ⏳ @tester — Waiting for dependencies
  ```
- [ ] Triggered on: child completion, child error, user request

### 3.6 — Private chat support
- [ ] Same flow as group — `createForumTopic` works in private chats (Bot API Feb 2026)
- [ ] Ensure bot has topics enabled (BotFather setting)
- [ ] Fallback: if topics not available (old API), use reply chains with agent prefix

## Files Touched
- `packages/server/src/telegram/telegram-bridge.ts` — topic creation, lifecycle hooks
- `packages/server/src/telegram/bot-registry.ts` — verify API version support
- `packages/server/src/db/schema.ts` — extend `telegramForumTopics` for agent topics

## Acceptance Criteria
- [ ] Brain spawn on Telegram → new forum topic auto-created with agent name
- [ ] Agent messages appear in its own topic
- [ ] User can chat with specific agent by going to its topic
- [ ] Agent completion → topic gets completion message
- [ ] Works in both private chat and group with forum mode
- [ ] Graceful fallback if forum topics not available
