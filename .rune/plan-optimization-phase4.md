# Phase 4: Feature Gaps & Polish

## Goal
Wire up stub features, add missing UI for existing APIs, improve UX completeness.

## Tasks

### Wire Stub Features
- [ ] **F01** — Add voice input button to session composer
  - `use-voice-input.ts` hook already exists
  - Add microphone button with Phosphor `Microphone` icon
  - Show waveform/recording indicator when active
  - Pipe transcribed text into composer input
- [ ] **F02** — Add compact mode UI control to session settings
  - `compactMode` and `compactThreshold` fields exist on sessions
  - Add toggle in session details sidebar: Off / Smart / Aggressive
  - Wire to `PATCH /api/sessions/:id/config`

### Missing UI for Existing APIs
- [ ] **F03** — Create Database Browser page at `/database`
  - Full API already exists (`/api/db/*`)
  - UI: connection list, table list, schema viewer, read-only query runner
  - Add to header navigation
- [ ] **F04** — Persist pinned messages to server
  - Currently client-only Zustand store (lost on reload)
  - Add `pinned_messages` table or `pinned` boolean on session_messages
  - API: `POST /api/sessions/:id/messages/:msgId/pin`, `DELETE .../unpin`
  - Load pinned state from server on page load

### Polish & UX
- [ ] **F05** — Add empty states for Analytics and Database pages
  - Analytics: "No sessions yet — start a session to see cost analytics"
  - Database: "No database connections — add one to browse"
- [ ] **F06** — Add session forking UI trigger
  - `parentId` field + `forkSession()` in SDK engine already exist
  - Add "Fork" button in session details header
  - Opens new session with same project/model, initial prompt references parent
- [ ] **F07** — Improve RTK cache collision resistance
  - Replace FNV-1a 32-bit with SHA-256 truncated to 64 bits
  - Keep inputLength check as secondary validation
- [ ] **F08** — Add loading skeleton to RTK dashboard card
  - Currently shows nothing until `rtk_tokens_saved > 0`
  - Show skeleton card with "Compression stats will appear here" text

## Acceptance Criteria
- [ ] Voice input button visible in composer, transcription works
- [ ] Compact mode toggle visible in session details
- [ ] `/database` page functional with connection list + query runner
- [ ] Pinned messages persist across page reloads
- [ ] Empty states on Analytics and Database pages
- [ ] All existing tests pass + web build clean

## Files Touched
- `packages/web/src/components/session/session-composer.tsx` — modify (voice)
- `packages/web/src/components/session/session-details.tsx` — modify (compact mode, fork)
- `packages/web/src/app/database/page.tsx` — new or major modify
- `packages/server/src/db/schema.ts` — modify (pinned messages)
- `packages/server/src/routes/sessions.ts` — modify (pin endpoints)
- `packages/web/src/lib/stores/pinned-messages-store.ts` — modify
- `packages/server/src/rtk/cache.ts` — modify (hash upgrade)
- `packages/web/src/app/analytics/page.tsx` — modify (empty state)

## Dependencies
- Phase 1-3 completed
- F03 (Database page) needs the security fix from Phase 1 (S02) first
- F04 (Pinned messages) needs new migration
