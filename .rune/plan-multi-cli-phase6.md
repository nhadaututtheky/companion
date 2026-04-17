# Phase 6: Telegram Multi-Bot Debate ✅ DONE

> Shipped: `/debate` + `/verdict` (config.ts), cli-debate-engine (services/), setup guide (TelegramDebateGuide.tsx).
> Closed 2026-04-17 with B2B loop-prevention guards added to all message handlers (is_bot skip).
> Server coordinates turn-taking — BotFather B2B toggle is not required; if enabled, bots silently ignore each other's messages.
> Multi-bot per-role dispatch (each agent posts via its own bot) deferred — current MVP posts all turns via primary bot.

## Goal
Enable real multi-bot debates in Telegram groups using native **Bot-to-Bot Communication Mode** (BotFather setting). Each AI platform = separate bot, bots see each other's messages, Companion coordinates turns.

## Context — What Changed
Telegram Bot API now supports **"Bot to Bot Communication Mode"** (toggle in BotFather). When enabled, a bot receives `message` updates from other bots in groups. This eliminates the need for internal relay/coordinator — bots can natively "hear" each other.

Warning from Telegram: _"Bots can easily trigger infinite loops. You must prevent this by implementing filtering or rate limits."_

## Architecture

```
Telegram Group (forum topic = debate thread)
  ├─ Claude Bot (B2B mode ON) ──┐
  ├─ Codex Bot (B2B mode ON) ───┤ All bots see each other's messages
  └─ Gemini Bot (B2B mode ON) ──┘
         │
         ▼
  Each bot's Grammy handler:
    1. Is this message from another bot? (msg.from.is_bot)
    2. Is this a debate I'm participating in? (chatId:topicId lookup)
    3. Is it my turn? (turn protocol check)
    4. If yes → route to CLI session → response → post to group
    5. If no → ignore (prevents loops)
```

## Prerequisites (Already Built)
- `bot-registry.ts` — multi-bot management, start/stop per bot
- `cli-debate-engine.ts` — cross-CLI debate engine with turn protocol
- `convergence-detector.ts` — auto-stop when debate converges
- `telegram-forum-topics.ts` — per-debate forum topics
- `channel-manager.ts` — debate channels with `maxRounds`
- `idle-detector.ts` — timeout detection

## Tasks

- [ ] **T1: B2B message handler** — `telegram-b2b-handler.ts` (~80 LOC)
  - Grammy middleware: detect `msg.from.is_bot === true`
  - Lookup active debate by `chatId:topicId`
  - Check turn: is this bot next in rotation?
  - If yes → extract text → route to bot's CLI session
  - If no → ignore silently
  - Anti-loop: ignore own bot's messages, cooldown 2s between posts

- [ ] **T2: Debate coordinator** — extend `telegram-bridge.ts` (~60 LOC)
  - `/debate start <topic>` in group → creates forum topic + debate channel
  - Assigns turn order based on registered bots in group
  - First bot gets initial prompt, others wait for B2B messages
  - Turn tracking: `Map<debateId, { currentBotIndex, roundNumber }>`
  - Auto-end: convergence detector OR `maxRounds` reached

- [ ] **T3: Turn protocol** — `telegram-debate-turn.ts` (~50 LOC)
  - Simple round-robin: Claude → Codex → Gemini → Claude → ...
  - Each bot appends `[Round N/M]` footer to indicate progress
  - Bot only responds when previous bot's message is complete
  - Completion signal: message doesn't end with streaming indicator

- [ ] **T4: Loop prevention** (~30 LOC across handlers)
  - Ignore messages from self (`msg.from.id === bot.botInfo.id`)
  - Per-debate cooldown: min 2s between posts per bot
  - Max rounds guard: hard-stop at `maxRounds` (default 5)
  - Convergence check: compare last 2 rounds for agreement
  - Dead-man switch: 60s no-response → auto-end debate

- [ ] **T5: Setup guide + BotFather automation** (~20 LOC)
  - Settings UI: checkbox "Enable Bot-to-Bot mode" per bot
  - Note: BotFather toggle is manual (no API to set it)
  - Validation: on debate start, check if B2B mode is likely ON
    (send test message from bot A, check if bot B receives within 5s)
  - User-facing guide: "Go to @BotFather → Bot Settings → Bot to Bot Communication Mode → ON"

## Files Touched
- `telegram/telegram-b2b-handler.ts` — new (~80 LOC)
- `telegram/telegram-debate-turn.ts` — new (~50 LOC)
- `telegram/telegram-bridge.ts` — modify (register B2B handler, debate start)
- `telegram/telegram-message-handlers.ts` — modify (skip B2B messages in normal handler)
- `telegram/bot-factory.ts` — modify (register B2B middleware)

## Acceptance Criteria
- [ ] 2+ bots in a group can run a `/debate` with real back-and-forth
- [ ] Each bot responds only on its turn (no parallel responses)
- [ ] Debate auto-stops at maxRounds or convergence
- [ ] No infinite loops (tested: bot ignores own messages + cooldown works)
- [ ] Works in forum topics (each debate = separate thread)
- [ ] Graceful fallback: if B2B mode not enabled, error message with setup guide

## Estimated LOC
~240 LOC new code + ~40 LOC modifications = **~280 LOC total**

## Risk Areas
1. **Loop detection** — primary risk. Mitigation: multiple layers (self-ignore, cooldown, maxRounds, convergence, dead-man switch)
2. **Turn sync** — bot might miss a message during network hiccup. Mitigation: 10s timeout per turn, retry once, then skip
3. **B2B mode not enabled** — silent failure (bot just doesn't receive). Mitigation: validation check on debate start
