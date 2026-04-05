# Feature: Workroom — Shared Telegram Collaboration Space

## Overview
Workroom = shared Telegram forum topic where multiple humans + multiple live Claude Code sessions collaborate. Extends existing channels, mentions, and forum topics — no new DB tables.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Lifecycle & Fan-out | ⬚ Pending | plan-workroom-phase1.md | Create/join/leave, human→sessions fan-out |
| 2 | Live Session Debates | ⬚ Pending | plan-workroom-phase2.md | Debate engine uses live sessions, not API agents |
| 3 | Identity & Permissions | ⬚ Pending | plan-workroom-phase3.md | Multi-user identity, access control, /members |

## Key Decisions
- Workroom IS a channel (type="workroom") — reuses `channels` + `channelMessages` tables
- Membership: sessions via `channelId` link, humans via in-memory `WorkroomState` map
- Loop prevention: source="workroom" tag + cooldown guard + no session→session fan-out
- Live debates: send prompts to running sessions via `sendUserMessage()`, collect via `session:result` event
- ~600 LOC total across all phases

## Architecture
```
Human in Telegram → TelegramBridge.handleTextMessage
  → workroom detected (chatId:topicId lookup)
  → postMessage to channel (role="human")
  → fanOutToSessions (sendUserMessage with source="workroom")
  → each session's Claude responds
  → subscriber posts response to workroom forum topic
```

## Risk Areas
1. Response collection from live sessions (streaming, async) — use eventBus + 30s timeout
2. Subscriber conflict (session has own topic + workroom topic) — re-route on join
3. Telegram API rate limits — reuse existing StreamHandler batching
