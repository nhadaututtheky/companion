# Phase 4: Custom Personas

## Goal
Allow users to create, edit, clone, and delete their own custom personas stored in SQLite, with a guided multi-step builder UI, extending the same `Persona` schema used by built-in personas.

## Tasks

### T1 — DB schema + migration
- [x] Add `customPersonas` table to Drizzle schema (all Persona fields as columns)
- [x] Generate migration `0026_custom_personas.sql`
- [x] Update `embedded-migrations.ts`

### T2 — Server service layer (CRUD)
- [x] `packages/server/src/services/custom-personas.ts` — new: list, get, create, update, delete, clone
- [x] Enforce max 50 limit on create (409 if at limit)
- [x] `custom-${randomUUID().slice(0,12)}` ID format
- [x] `resolvePersona(id)` helper: built-in first, then DB fallback

### T3 — Server API routes
- [x] `packages/server/src/routes/custom-personas.ts` — GET /, GET /:id, POST /, PUT /:id, DELETE /:id, POST /clone/:builtInId
- [x] Register in routes/index.ts

### T4 — Shared layer: unify persona lookup
- [x] Update `getPersonaById` signature to accept optional custom personas list
- [x] Export `CustomPersonaInput` type for create/update payloads

### T5 — Web API client
- [x] Add `api.customPersonas: { list, get, create, update, delete, clone }`

### T6 — Persona Builder UI (guided wizard)
- [x] `packages/web/src/components/persona/persona-builder.tsx` — new (470 LOC)
- [x] 7 steps: Identity, Avatar, System Prompt, Mental Models, Framework & Style, Red Flags & Blind Spots, Review
- [x] Stepper UI with back/next, local useState, validation per step, live PersonaAvatar preview

### T7 — Expert Modes page integration
- [x] Fetch custom personas on mount
- [x] "Your Custom Personas" section with cards (edit/delete actions + count/50)
- [x] "Create Persona" button opens builder inline
- [x] "Clone" button on built-in persona cards → clones + opens editor

### T8 — Wire into session/debate flows
- [x] Server: `resolvePersona(id)` replaces `getPersonaById` in sessions.ts + debate-engine.ts
- [x] Web: `usePersonas()` hook (built-in + custom merged)
- [x] PersonaChip uses `allPersonas` in switcher popover
- [x] New session modal persona picker uses `allPersonas`

## Acceptance Criteria
- [x] Create custom persona through guided builder (7 steps)
- [x] Edit existing custom persona (builder pre-filled)
- [x] Clone built-in persona into custom + modify
- [x] Delete custom persona (with confirmation)
- [x] Max 50 enforced server-side (409)
- [x] Custom personas in session + debate persona pickers
- [x] `custom-` prefix IDs, no collision with built-in
- [x] Persists across server restarts (SQLite)
- [x] PersonaAvatar renders with user-chosen gradient + initials
- [x] Build passes

## Files Touched
- `packages/server/src/db/schema.ts` — modify (customPersonas table)
- `packages/server/src/db/migrations/0026_custom_personas.sql` — new
- `packages/server/src/db/embedded-migrations.ts` — modify
- `packages/server/src/services/custom-personas.ts` — new (CRUD + resolvePersona)
- `packages/server/src/routes/custom-personas.ts` — new (REST API)
- `packages/server/src/routes/index.ts` — modify (register route)
- `packages/server/src/routes/sessions.ts` — modify (resolvePersona)
- `packages/server/src/services/debate-engine.ts` — modify (resolvePersona)
- `packages/shared/src/personas.ts` — modify (getPersonaById overload, CustomPersonaInput)
- `packages/web/src/lib/api-client.ts` — modify (customPersonas namespace)
- `packages/web/src/hooks/use-personas.ts` �� new (shared hook)
- `packages/web/src/components/persona/persona-builder.tsx` — new (7-step wizard)
- `packages/web/src/components/persona/persona-chip.tsx` — modify (use allPersonas)
- `packages/web/src/components/session/new-session-modal.tsx` — modify (use allPersonas)
- `packages/web/src/app/templates/page.tsx` — modify (custom section + builder + clone)
