# Phase 2: Telegram `/cmd`

## Goal

Ship `/cmd` bot command with 2-level inline keyboard (groups → commands)
so mobile users can pick shell commands without typing. Selected command
is posted as a user message into the active session — agent handles it
normally.

## Tasks

- [ ] Create `packages/server/src/telegram/commands/quick-command.ts` — register `/cmd` command handler on bot instance
- [ ] Build group keyboard: 3-column grid of 10 groups (`InlineKeyboardButton` each, `callback_data: qc:g:<group-id>`)
- [ ] Build command keyboard per group: 1-column paged list (10 commands/page), `callback_data: qc:c:<cmd-id>`, Prev/Next buttons at bottom, `← Back` to group list
- [ ] Register callback query handler — route `qc:*` callbacks, edit inline keyboard in place (no new message spam)
- [ ] On command select: resolve `cmd-id` → command string, inject as user message into Telegram → session router (same path as a normal Telegram text message)
- [ ] Delete the `/cmd` picker message after a command is sent (or mark as "sent: X")
- [ ] Respect session permission: if no active session in chat, reply "No active session — start one with /new"
- [ ] Add unit tests for callback payload parse/build
- [ ] Add integration test: simulate `/cmd` → group callback → command callback → verify message posted to session

## Acceptance Criteria

- [ ] `/cmd` in Telegram chat opens inline keyboard with 10 group buttons
- [ ] Tapping group replaces keyboard with paged command list for that group
- [ ] Tapping `← Back` returns to group list
- [ ] Tapping `Next`/`Prev` pages through commands (10/page)
- [ ] Tapping a command posts it as user message into active session, picker message shows "✓ sent: git status" and inline keyboard disappears
- [ ] No active session → friendly error, no crash
- [ ] `/cmd` works in private chat, group chat, and forum topics (reuse existing topic routing)
- [ ] Zero impact on other Telegram commands / session routing
- [ ] 3+ unit tests for callback payload; 1 integration test

## Files Touched

### New
- `packages/server/src/telegram/commands/quick-command.ts`
- `packages/server/src/telegram/commands/__tests__/quick-command.test.ts`

### Modified
- `packages/server/src/telegram/bot-factory.ts` — register `/cmd` command + callback query pattern `qc:*`
- `packages/server/src/telegram/telegram-message-handlers.ts` — expose function to inject synthetic user message into session (or reuse existing one)

## Dependencies

- Phase 1 completed (catalog loader available from `@companion/shared`)
- Existing Telegram bot infra: `bot-factory.ts`, `telegram-session-router.ts`, forum topic routing
- Existing command registration pattern (see other `commands/*.ts` files)

## Design notes

**Callback data compactness** — Telegram caps callback_data at 64 bytes.
Use short keys: `qc:g:<group-id>` and `qc:c:<cmd-id>:<page>`. Command IDs
from catalog are already short (`git-status`, `npm-test`).

**Paging** — 10 commands per page, Prev/Next only shown when needed. Max
3 pages per group (cap groups at 30 commands to keep UX sane).

**Why edit in place, not send new message** — prevents chat spam, matches
Telegram UX conventions. Use `editMessageReplyMarkup` + optional
`editMessageText` when back/forward navigation.

**Route to session** — reuse the same ingress as typed user text. Find
the session bound to this chat (+topic if forum), call the existing
"send user message to session" function. Do NOT bypass
`ws-user-message.ts` flow — agent must see it like any normal message.

**Permission & multi-user** — if group chat with multi-user debate
enabled, `/cmd` behaves per-user (each user's selection goes to their
bound agent). Reuse existing per-user session binding.

**Search?** — defer to phase 3. v1 is pure keyboard navigation. Text
search adds complexity (inline_query or separate modal) not worth it for
MVP.

## Out of scope (defer)

- Text search within picker (phase 3 via `@botname <query>` inline mode)
- Recent commands shortcut (phase 3)
- Favorites / pinned commands (phase 3)
- Auto-close picker after 30s idle (phase 3 polish)
