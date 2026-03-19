# Phase 3: Telegram System

## Goal
Rewrite the Telegram system using grammY framework (v1.41.1) instead of raw HTTP calls. Fix streaming/edit issues with `sendMessageDraft` API. After this phase, users can control Claude Code sessions from Telegram with all commands + proper streaming.

## Key Changes from Old Companion
- **grammY replaces raw HTTP** — type safety, auto-retry, throttler, middleware
- **`sendMessageDraft` replaces `editMessageText` loop** — native streaming API (Bot API 9.3+)
- **Table formatting** — `<pre>` + Unicode box-drawing instead of broken Markdown tables
- **`expandable_blockquote`** — long outputs collapsed by default
- **SQLite storage** replaces JSON files for bot config + session mappings
- **All messages stored** — every Telegram message persisted in `session_messages` for history

## Tasks

### 3.1 grammY Setup
- [ ] Install grammY v1.41.1 + plugins: `@grammyjs/auto-retry`, `@grammyjs/transformer-throttler`, `@grammyjs/conversations`, `@grammyjs/runner`
- [ ] Create bot factory (`packages/server/src/telegram/bot-factory.ts`)
  - [ ] Configure `apiThrottler()` (30 req/s global, 1 msg/s per chat)
  - [ ] Configure `autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 })`
  - [ ] Middleware chain: auth → rate-limit → command router → message handler
- [ ] Port BotRegistry to manage multiple grammY bot instances

### 3.2 Streaming Fix
- [ ] Implement `sendMessageDraft` for AI response streaming
  - [ ] Accumulate tokens, send draft every 500ms (not every token)
  - [ ] Final `sendMessage` when stream completes (draft → permanent)
  - [ ] Fallback to throttled `editMessageText` if `sendMessageDraft` unavailable
- [ ] Handle long responses: split at 4096 chars, chain messages
- [ ] Typing indicator (`sendChatAction("typing")`) while Claude processes

### 3.3 Formatting Overhaul
- [ ] Rewrite `telegram-formatter.ts` with proper HTML formatting:
  - [ ] Tables → `<pre>` + Unicode box-drawing (`┌─┐│├┤└─┘`)
  - [ ] Long outputs → `<blockquote expandable>` (collapsed by default)
  - [ ] Code blocks → `<pre><code class="language-X">` with syntax highlight
  - [ ] Inline code → `<code>` tags
  - [ ] Cost/numbers → monospace `<code>$3.47</code>`
- [ ] Markdown-to-Telegram-HTML converter (Claude outputs Markdown, Telegram needs HTML)
- [ ] Auto-detect content type: code → pre block, table → formatted pre, text → HTML

### 3.4 Command System
- [ ] Port commands using grammY command handlers:
  - [ ] Session: `/start`, `/new`, `/stop`, `/stopall`, `/resume`, `/switch`, `/fork`
  - [ ] Control: `/allow`, `/deny`, `/cancel`, `/exitplan`, `/stopbypass`
  - [ ] Info: `/status`, `/cost`, `/context`, `/files`, `/help`
  - [ ] Config: `/model`, `/autoapprove`, `/timeout`, `/thinking`, `/buttons`, `/stream`
  - [ ] Tools: `/mcp`, `/skills`, `/compact`, `/clear`, `/doctor`, `/translate`
  - [ ] Projects: `/projects`, `/project`
  - [ ] Agent: `/debate`, `/verdict` (prepare for Phase 5)
- [ ] Remove MyTrend-specific commands (build, ff)
- [ ] Inline keyboard builders for permission approve/deny

### 3.5 Conversation Flows (grammY conversations plugin)
- [ ] Project selection flow (multi-step: list → select → confirm)
- [ ] Bot setup wizard (token → name → default project → confirm)
- [ ] Model selection (show options → select → apply)
- [ ] Wrap DB calls in `conversation.external()` per grammY v2 requirement

### 3.6 Message Persistence
- [ ] Store ALL Telegram messages in `session_messages` table:
  - [ ] User messages (with telegram_chat_id, telegram_message_id)
  - [ ] Bot responses (with formatting preserved)
  - [ ] System events (session start/end, permission requests)
- [ ] Web UI can display full Telegram conversation history
- [ ] Enable message search across history

### 3.7 Bridge & Routing
- [ ] Port TelegramBridge using grammY middleware pattern
  - [ ] Message → find/create session → inject to CLILauncher
  - [ ] CLI output → format → send to Telegram chat
  - [ ] Permission request → inline keyboard → wait for callback
- [ ] Multi-bot support: each bot = separate grammY instance, shared middleware
- [ ] Bot config stored in SQLite, auto-start on server startup

### 3.8 REST Routes for Bot Management
- [ ] `GET /api/telegram/bots` — list configured bots
- [ ] `POST /api/telegram/bots` — add/update bot
- [ ] `DELETE /api/telegram/bots/:id` — remove bot
- [ ] `POST /api/telegram/bots/:id/start` — start bot polling
- [ ] `POST /api/telegram/bots/:id/stop` — stop bot polling
- [ ] `GET /api/telegram/status` — bot registry status

## Acceptance Criteria
- [ ] AI responses stream smoothly via `sendMessageDraft` (no flickering/missing text)
- [ ] Tables render readable in monospace `<pre>` blocks
- [ ] Long outputs use expandable blockquote (collapsed by default)
- [ ] All commands work via grammY handlers
- [ ] Permission requests show inline keyboard, callback resolves correctly
- [ ] Multi-bot works (bot1=claude, bot2=anti roles)
- [ ] Bot config persists in SQLite, auto-start on boot
- [ ] All messages stored in DB, viewable from web UI
- [ ] Rate limiting handled automatically (no 429 errors)
- [ ] Conversation flows work for multi-step interactions

## Files Touched
- `packages/server/package.json` — modify (add grammy deps)
- `packages/shared/src/types/telegram.ts` — modify (add grammY-compatible types)
- `packages/server/src/telegram/bot-factory.ts` — new (grammY bot builder)
- `packages/server/src/telegram/bot-registry.ts` — new (rewrite with grammY)
- `packages/server/src/telegram/telegram-bridge.ts` — new (rewrite as grammY middleware)
- `packages/server/src/telegram/commands/` — new directory (one file per command group)
- `packages/server/src/telegram/commands/session.ts` — new
- `packages/server/src/telegram/commands/control.ts` — new
- `packages/server/src/telegram/commands/info.ts` — new
- `packages/server/src/telegram/commands/config.ts` — new
- `packages/server/src/telegram/commands/agent.ts` — new (debate, verdict)
- `packages/server/src/telegram/conversations/` — new (multi-step flows)
- `packages/server/src/telegram/formatter.ts` — new (rewrite with HTML + Unicode tables)
- `packages/server/src/telegram/stream-handler.ts` — new (sendMessageDraft logic)
- `packages/server/src/telegram/telegram-config.ts` — new (SQLite storage)
- `packages/server/src/services/skill-scanner.ts` — new (port)
- `packages/server/src/routes/telegram.ts` — new
- `packages/server/src/translate.ts` — new (port)

## Dependencies
- Requires Phase 2 completed (WsBridge, CLILauncher, sessions API)
- grammY v1.41.1, Bot API 9.5 (sendMessageDraft available March 2026)
