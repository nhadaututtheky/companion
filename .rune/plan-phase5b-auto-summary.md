# Phase 5B: Session Auto-Summary

## Goal
Auto-generate a short summary when a session ends. Summaries provide cross-session context — new sessions in the same project start with knowledge of what was done before.

## Tasks
- [ ] Create `packages/server/src/services/session-summarizer.ts`
  - [ ] On session end (status → "ended"), collect last N messages
  - [ ] Call Claude Haiku API with prompt: "Summarize this coding session in 200 words. List key decisions and files modified."
  - [ ] Parse response → store in `session_summaries` table
  - [ ] Handle errors gracefully (API down, no messages, etc.)
- [ ] Hook summarizer into session lifecycle
  - [ ] In `ws-bridge.ts` or `session-store.ts`, call summarizer when session ends
  - [ ] Skip if session has < 3 turns (nothing meaningful to summarize)
  - [ ] Skip if session already has a summary
- [ ] Auto-inject summaries into new sessions
  - [ ] When starting new session in same project, fetch last 3 summaries
  - [ ] Prepend as system context: "Previous session summaries: ..."
  - [ ] Configurable: setting `autoInjectSummaries` (default: true)
- [ ] Add MCP tool `companion_get_session_summary`
  - [ ] Returns summary for a specific session ID
  - [ ] Or latest summaries for a project
- [ ] Web UI: show summary badge on ended sessions
  - [ ] Small "Summary" chip on session card
  - [ ] Click to expand and read summary
- [ ] Telegram: send summary to chat when session ends
  - [ ] Format: "📝 Session Summary\n{summary}\n\nFiles: {files}\nCost: ${cost}"

## Acceptance Criteria
- [ ] Session ends → summary auto-generated within 5 seconds
- [ ] Summary stored in DB with key_decisions and files_modified
- [ ] New session in same project gets last 3 summaries injected
- [ ] Web UI shows summary on ended session cards
- [ ] Telegram receives summary message on session end
- [ ] `companion_get_session_summary` MCP tool returns data

## Files
- `packages/server/src/services/session-summarizer.ts` — new
- `packages/server/src/services/ws-bridge.ts` — modify (hook on session end)
- `packages/server/src/mcp/tools.ts` — modify (add summary tool)
- `packages/web/src/components/session/session-card.tsx` — modify (summary badge)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (send summary on end)

## Dependencies
- Phase 5A done (MCP server for the tool)
- Anthropic API key in env (ANTHROPIC_API_KEY) for Haiku calls
- `session_summaries` table exists ✅
