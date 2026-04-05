# Phase 2: Session Integration — Wire Personas into Sessions

## Goal
Attach a persona to a session at creation time so its `systemPrompt` is injected into Claude
via the `identityPrompt` mechanism. Show the active persona in the session header. Allow
mid-session persona switching by re-injecting the new system prompt as a context message.
Persist `personaId` in the session DB record for restoration across reloads.

## Background (from code audit)

Key facts discovered during planning:

- `identityPrompt` already exists on `ActiveSession` in `ws-bridge.ts` and is re-injected
  automatically after context compaction (see `injectIdentityAfterCompact()`).
- `startSession()` in `ws-bridge.ts` accepts `identityPrompt?: string` — we can pass the
  persona's `systemPrompt` directly into this field.
- The SDK engine (`startSessionWithSdk`) does NOT yet pass `identityPrompt` to the SDK
  `query()` call; the CLI launcher path (`startSessionWithCli`) also does not expose a
  `--system-prompt` flag. The cleanest approach is:
  1. Store persona's `systemPrompt` as `identityPrompt` on the session.
  2. Inject it as the first user message when the session starts (same NDJSON path).
  3. Auto-reinject after compaction already works via existing `injectIdentityAfterCompact()`.
- `db/schema.ts` has no `personaId` column yet — we need one migration.
- The `Session` type in `session-store.ts` (web) has no `personaId` field yet.
- `api-client.ts` `start()` body type does not include `personaId` / `identityPrompt` yet.
- `createSessionSchema` in `routes/sessions.ts` does not include those fields yet.

## Tasks

### T1 — DB migration: add `persona_id` to sessions table
- [x] Add `personaId text("persona_id")` (nullable) to `sessions` table in `packages/server/src/db/schema.ts`
- [x] Write migration SQL `0024_add_persona_id.sql` in `packages/server/src/db/migrations/`
- [x] Regenerate `packages/server/src/db/embedded-migrations.ts`
- [x] Extend `createSessionRecord()` in `packages/server/src/services/session-store.ts` to accept + persist `personaId`

### T2 — Server: accept personaId in session creation
- [x] Add `personaId: z.string().optional()` to `createSessionSchema` in `packages/server/src/routes/sessions.ts`
- [x] After resolving template, look up persona from `@companion/shared` `BUILT_IN_PERSONAS` by `personaId`
- [x] If found, pass `identityPrompt: persona.systemPrompt` to `bridge.startSession()`
- [x] Pass `personaId` through to `createSessionRecord()` call

### T3 — Server: expose personaId on session state
- [x] Add `personaId?: string` to the `startSession()` opts in `ws-bridge.ts`
- [x] Include `personaId` in session list response (added to `listSessions` mapping + `SessionListItem` type)

### T4 — Shared types: export getPersonaById helper
- [x] Already existed from Phase 1 (`getPersonaById` in `personas.ts`, exported from `index.ts`)
- [x] Added `personaId` to `SessionListItem` interface

### T5 — Web: add personaId to Session store + api-client
- [x] Add `personaId?: string` field to `Session` interface in `packages/web/src/lib/stores/session-store.ts`
- [x] Add `personaId?: string` to the `start()` body type in `packages/web/src/lib/api-client.ts`
- [x] Add `switchPersona()` method to api-client

### T6 — NewSessionModal: persona picker in Step 2 (Configure)
- [x] Add `selectedPersonaId` state (string | null) to `NewSessionModalInner`
- [x] Render horizontal scroll strip with 12 persona avatars + "None" option
- [x] Pass `personaId: selectedPersonaId` to `api.sessions.start()` call
- [x] Show selected persona in Step 3 summary

### T7 — Session header: persona indicator
- [x] Created `packages/web/src/components/persona/persona-chip.tsx` (18px avatar + name, click → popover)
- [x] Rendered adjacent to `<ModelSelector>` in `session-page-client.tsx`, hidden when no persona

### T8 — Mid-session persona switching
- [x] Added `POST /api/sessions/:id/persona` route with persona lookup + identity prompt swap
- [x] Sends context message: `[Persona switched to: {name}]` or `[Persona cleared]`
- [x] Created `updateSessionPersona()` in session-store for DB persistence
- [x] Added `switchPersona()` to api-client

### T9 — Persist and rehydrate personaId on WS sync
- [x] Session list load in `page.tsx` maps `personaId` from server response into store
- [x] Persona switch handler in `session-page-client.tsx` updates store directly

## Files to Touch

| File | Action |
|------|--------|
| `packages/server/src/db/schema.ts` | modify — add `personaId` column |
| `packages/server/src/db/migrations/0012_add_persona_id.sql` | new |
| `packages/server/src/db/embedded-migrations.ts` | regenerate |
| `packages/server/src/services/session-store.ts` | modify — persist personaId |
| `packages/server/src/routes/sessions.ts` | modify — accept personaId, new persona route |
| `packages/server/src/services/ws-bridge.ts` | modify — thread personaId/identityPrompt |
| `packages/shared/src/personas.ts` | modify — add getPersonaById() |
| `packages/shared/src/index.ts` | modify — export getPersonaById |
| `packages/web/src/lib/api-client.ts` | modify — personaId in start(), add switchPersona() |
| `packages/web/src/lib/stores/session-store.ts` | modify — add personaId field |
| `packages/web/src/components/session/new-session-modal.tsx` | modify — persona picker in Step 2 |
| `packages/web/src/components/persona/persona-chip.tsx` | new — session header chip |
| Session header/composer component (TBD via grep) | modify — render PersonaChip |

## Acceptance Criteria

- [ ] Selecting a persona in NewSessionModal Step 2 and launching creates a session where
  Claude's first response reflects the persona's thinking style
- [ ] Session list / session header shows the persona avatar + name chip when personaId is set
- [ ] Clicking persona chip in header opens switcher; selecting a different persona sends
  a context-switch message and the session continues with the new persona's style
- [ ] Selecting "None" in the switcher clears the persona and sends a reset context message
- [ ] `personaId` is stored in the DB and survives server restart (visible after page refresh)
- [ ] Sessions without a persona behave exactly as before — no regression
- [ ] Build passes (`bun run build` in packages/server and packages/web)

## Dependencies

- Requires Phase 1 completed (types, BUILT_IN_PERSONAS, PersonaAvatar, PersonaTooltip exist)
- No external API changes required
- Migration must run before server starts (handled by embedded-migrations auto-run)

## Implementation Notes

- Use `identityPrompt` as the injection mechanism — do NOT add `--system-prompt` CLI flag
  (it triggers single-turn mode and exits). The re-inject pattern is already battle-tested.
- Inject persona system prompt as the FIRST user message after session init, prepended with
  `[Persona context]` tag so it's distinguishable in the message feed and can be filtered
  from UI display if desired.
- Mid-session switch: send as a bracketed context message, NOT a hidden system injection,
  so the user can see what changed. Format:
  `[Persona switched to: {name}]\n\n{systemPrompt}`
- Keep the persona picker in NewSessionModal optional — default is "None (Default Claude)"
- `PersonaChip` should be hidden when no persona is active (don't show empty chip)
