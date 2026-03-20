# Phase 2: Telegram Command Center Completion

## Goal
Fill remaining gaps in Telegram command coverage. Currently have: /start, /new, /stop, /resume, /projects, /allow, /deny, /exitplan, /cancel, /compact, /btw, /file, /cat, /send, /skill, /note, /notes, /stream, /detach, /status, /cost, /files, /help, /model, /autoapprove, /debate, /templates. Add missing commands and polish UX.

## Tasks

### 2.1 `/todo` — Show Claude's Task List
- [ ] Add to `commands/utility.ts` or new `commands/tasks.ts`
- [ ] Send `/todo` as user message to Claude session (it triggers Claude's built-in todo display)
- [ ] Parse response and format nicely for Telegram

### 2.2 `/history` — Recent Session History
- [ ] Add `/history [n]` command — shows last N sessions (default 5)
- [ ] Query `sessions` table, grouped by project
- [ ] Format: project name, model, cost, duration, status
- [ ] Add "Resume" button for sessions with `cliSessionId`

### 2.3 `/usage` — Cost & Usage Summary
- [ ] Add `/usage [today|week|month]` command
- [ ] Query `daily_costs` + `sessions` tables
- [ ] Show: total cost, session count, token count, per-project breakdown
- [ ] Format as clean Telegram HTML table

### 2.4 `/help` Enhancement
- [ ] Rewrite /help to categorize commands:
  - 📱 **Session**: /start, /new, /stop, /resume, /projects
  - 🎛️ **Control**: /allow, /deny, /cancel, /exitplan, /compact
  - 📋 **Templates**: /templates, /template save, /template delete
  - 🔧 **Utility**: /btw, /file, /cat, /send, /skill, /note, /notes
  - 📊 **Info**: /status, /cost, /files, /model, /history, /usage
  - 🔗 **Stream**: /stream, /detach
  - ⚙️ **Config**: /autoapprove
- [ ] Add `/help <command>` for detailed help per command

### 2.5 Bot Command Menu (BotFather)
- [ ] Update `bot-factory.ts` `registerCommands()` to set full command list via `bot.api.setMyCommands()`
- [ ] Group with command scopes if applicable
- [ ] Ensure all commands have descriptions

### 2.6 `/pin` — Pin/Unpin Settings Panel
- [ ] When session starts, auto-send settings panel
- [ ] `/pin` re-sends and pins the settings panel to top of chat
- [ ] Panel includes: model selector, auto-approve, idle timeout, cost, stop button

### 2.7 Quick Action Buttons on Session Start
- [ ] After session starts, show a row of quick action buttons:
  - 📋 Templates | 📌 Pin Panel | ⚡ Auto-approve 30s
- [ ] These disappear after first user message (or timeout)

## Acceptance Criteria
- [ ] `/todo` forwards to Claude and shows task list
- [ ] `/history` shows recent sessions with resume option
- [ ] `/usage today` shows cost breakdown
- [ ] `/help` is categorized and comprehensive
- [ ] Bot command menu in Telegram shows all available commands
- [ ] `/pin` re-pins settings panel
- [ ] Quick actions shown on session start

## Files Touched
- `packages/server/src/telegram/commands/utility.ts` — modify (add /todo)
- `packages/server/src/telegram/commands/info.ts` — modify (add /history, /usage, enhance /help)
- `packages/server/src/telegram/commands/panel.ts` — modify (add /pin, quick actions)
- `packages/server/src/telegram/bot-factory.ts` — modify (update command menu)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (quick actions on session start)

## Dependencies
- Phase 1 (Templates) should be done first — /help references /templates
- All existing commands working (Phase 1-4 of original plan)
