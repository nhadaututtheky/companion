# Phase 6: Web Session Settings UI

## Goal
Unified settings panel for all session config: idle timeout, compact mode, cost budget. Accessible from session header.

## Tasks
- [ ] Settings modal/drawer component with sections:
  - General: name (editable), model (read-only), permission mode
  - Timeout: idle timeout dropdown (Never, 30m, 1h, 4h, 12h), keep alive toggle
  - Context: compact mode selector (manual/smart/aggressive), threshold slider (50-90%)
  - Budget: cost budget input ($), current spend display, warning status
- [ ] Wire settings to `PATCH /api/sessions/:id/settings` endpoint
- [ ] Extend settings endpoint to accept all new fields (compactMode, compactThreshold, costBudgetUsd)
- [ ] Real-time update: changing settings reflects immediately in session header
- [ ] Telegram: `/settings` inline keyboard panel — add compact mode + budget options
- [ ] Telegram: show current settings summary on panel open

## Acceptance Criteria
- [ ] All settings saveable from web modal
- [ ] Settings persist to DB (survive server restart)
- [ ] Telegram panel shows all configurable options
- [ ] Changing compact mode mid-session takes effect immediately
- [ ] Settings respect active session state (can't change model mid-session)

## Files Touched
- `packages/web/src/components/session/session-settings.tsx` — new or modify
- `packages/web/src/components/grid/session-header.tsx` — modify (settings button)
- `packages/server/src/routes/sessions.ts` — modify (extend settings endpoint)
- `packages/server/src/telegram/commands/config.ts` — modify (panel options)
- `packages/web/src/lib/api-client.ts` — modify

## Dependencies
- Phase 1-5 (all config fields must exist)
