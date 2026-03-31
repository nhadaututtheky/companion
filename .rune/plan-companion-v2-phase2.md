# Phase 2: Telegram UX Overhaul

## Goal

Make Telegram the best possible mobile experience. Reduce cognitive load, add media support, improve discoverability.

## Tasks

### Command Reduction (31 → ~10 registered)
- [ ] Audit all 31 commands in `bot-factory.ts` lines 82-119
- [ ] Keep registered (visible in menu): /start, /new, /stop, /allow, /deny, /status, /model, /help, /resume, /templates
- [ ] Remove from Telegram menu but keep functional: /rename, /budget, /compact, /settings, /exitplan, /planmode, /verdict, /notes, etc.
- [ ] Add `/help` subcommand listing — show all available commands grouped by category
- [ ] Update `/start` welcome message to highlight key commands

### Media Handling
- [ ] Add `message:photo` handler — save image to session CWD, reference path in Claude message
  - Grammy: `ctx.message.photo` → get file → download → save
  - Send to Claude: "User sent an image: [path]. Describe/analyze it."
- [ ] Add `message:document` handler — save file to session CWD
  - Filter: only allow text-based files and images (< 10MB)
  - Send to Claude: "User uploaded file: [filename] at [path]"
- [ ] Add `message:voice` handler — transcribe using Whisper API or note unsupported
  - MVP: inform user voice not supported yet, suggest text
  - Future: integrate speech-to-text

### Permission UX
- [ ] Enhance `/allow` to show permission details before approving
  - Show: tool name, file path, command preview
  - Add "Allow All" + "Review Each" options
  - Flag dangerous operations (Bash with rm, git push, etc.) with ⚠️ warning
- [ ] Add visual countdown for auto-approve timers
  - Edit message every 5 seconds: "Auto-approving in Xs..."
  - Use `editMessageText` with countdown

### Mobile UX Polish
- [ ] Improve long message handling — add "Response is long, splitting into parts (N/M)" header
- [ ] Add typing indicator (`ctx.replyWithChatAction('typing')`) during Claude processing
- [ ] Ensure all inline keyboards have appropriately sized buttons for touch

## Acceptance Criteria

- [ ] Telegram command menu shows ≤10 commands
- [ ] `/help` shows full categorized command list
- [ ] User can send a photo → Claude receives and can analyze it
- [ ] User can send a document → file appears in session CWD
- [ ] `/allow` shows permission details with danger warnings
- [ ] Long responses have part indicators

## Files Touched

- `packages/server/src/telegram/bot-factory.ts` — command registration
- `packages/server/src/telegram/telegram-bridge.ts` — media handlers, permission UX
- `packages/server/src/telegram/commands/control.ts` — enhanced /allow
- `packages/server/src/telegram/commands/help.ts` — new/enhanced help with categories
- `packages/server/src/telegram/stream-handler.ts` — long message indicators

## Dependencies

- Phase 1 completed (bug fixes in telegram-bridge.ts)

## Review Gate

- [ ] `bun run build` passes
- [ ] Manual test: Telegram command menu — count ≤10 items
- [ ] Manual test: send photo to active session → Claude mentions image
- [ ] Manual test: `/allow` on dangerous operation → shows warning
- [ ] Manual test: long Claude response → shows part N/M
