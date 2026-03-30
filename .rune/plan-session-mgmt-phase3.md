# Phase 3: Enhanced Resume

## Goal
Resume any session with cliSessionId — searchable, filterable, cross-platform (web ↔ Telegram).

## Tasks
- [ ] Remove 10-session limit from `listResumableSessions`, add pagination
- [ ] Add search param to resume API: `?q=<name|project>&project=<slug>&model=<model>`
- [ ] Web: resumable sessions panel with search input + project filter dropdown
- [ ] Web: resume button on any ended session in session list (not just resumable panel)
- [ ] Telegram: `/resume` shows filterable list (project buttons → session buttons)
- [ ] Telegram: `/resume <name>` — resume by session name (fuzzy match)
- [ ] Cross-platform: session started on web can be resumed on Telegram and vice versa
- [ ] Inject context summary on resume: auto-send "Continue from where you left off" with last task context

## Acceptance Criteria
- [ ] Can resume sessions older than 10 most recent
- [ ] Search by name or project works
- [ ] Telegram can resume a web-started session
- [ ] Post-resume session has context about previous work
- [ ] Old session's cliSessionId cleared after resume (prevent double-resume)

## Files Touched
- `packages/server/src/services/session-store.ts` — modify (query enhancement)
- `packages/server/src/routes/sessions.ts` — modify (search params)
- `packages/web/src/components/session/resumable-sessions.tsx` — modify
- `packages/web/src/lib/api-client.ts` — modify
- `packages/server/src/telegram/commands/session.ts` — modify

## Dependencies
- Phase 1 (name field for search)
- Phase 2 (rename enables meaningful search)
