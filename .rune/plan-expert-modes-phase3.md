# Phase 3: Debate Integration — Persona × Model Matrix

## Goal
Allow each debate agent to have an optional persona assigned, so the persona's thinking style
layers on top of the debate role (advocate/challenger/judge). Show persona avatars in debate UI.

## Background (from code audit)

- `DebateAgent` type has `model?` + `modelLabel?` — `personaId?` follows same pattern
- `AgentModelConfig` (debate-engine.ts:34) is the per-agent override config from API
- `getAgentsForFormat()` gives each agent a hardcoded `systemPrompt` based on format + topic
- `callDebateAI()` passes `agent.systemPrompt` directly — persona injection prepends before it
- `sessionDebateParticipants` map (sessions.ts:90) stores `{ modelId, provider, name }`
- Channel panel renders messages with Robot icon + role label — swap for persona avatar

## Tasks

### T1 — Extend debate types with personaId
- [x] Add `personaId?: string` to `AgentModelConfig` in `debate-engine.ts`
- [x] Add `personaId?: string` to `DebateAgent` interface
- [x] Add `personaLabel?: string` to `DebateAgent` for display

### T2 — Inject persona systemPrompt into agent prompt
- [x] In `startDebate()`, after agent model override loop, resolve persona per agent
- [x] Prepend `persona.systemPrompt` before role systemPrompt with separator
- [x] Judge agent: never assign persona (neutral arbiter)

### T3 — Update API schemas to accept personaId per agent
- [x] Add `personaId: z.string().optional()` to `agentModelSchema` in `channels.ts`
- [x] Include `personaId` in debate response agent data
- [x] Add `personaId?` to `sessionDebateParticipants` type in `sessions.ts`
- [x] Pass `personaId` from participants into `agentModels` config in round handler
- [x] Add `personaId` to WS broadcast agent payload

### T4 — Web API client: personaId in debate methods
- [x] Update `addParticipant()` in api-client to accept optional `personaId`
- [x] Update response types to include `personaId` per agent

### T5 — Debate store: track personaId per participant
- [x] Extend participant type in `debate-store.ts` with `personaId?: string`

### T6 — ModelBar UI: persona selector per participant
- [x] Show `PersonaAvatar` (14px) next to model name when persona assigned
- [x] Persona name in tooltip when hovering participant chip

### T7 — ChannelFeed: persona avatar next to agent messages
- [x] Add `personaId` to `channel_messages` DB table (migration 0025)
- [x] When message has `personaId`, replace Robot icon with `PersonaAvatar` (14px)
- [x] Import `getPersonaById` + `PersonaAvatar` in channel-panel.tsx

### T8 — Channel messages: pass personaId through postMessage
- [x] Add `personaId` to `ChannelMessage` interface in channel-manager.ts
- [x] Update `postMessage()` to accept and persist `personaId`
- [x] Debate engine passes `agent.personaId` in postMessage calls
- [x] Judge verdict messages: no persona (undefined)

## Files Touched

| File | Action |
|------|--------|
| `packages/server/src/services/debate-engine.ts` | modify — types + persona injection + postMessage |
| `packages/server/src/routes/channels.ts` | modify — schema + response |
| `packages/server/src/routes/sessions.ts` | modify — participants map + round handler |
| `packages/web/src/lib/api-client.ts` | modify — debate participant type |
| `packages/web/src/components/session/model-bar.tsx` | modify — persona indicator |
| `packages/web/src/components/shared/channel-panel.tsx` | modify — persona avatar in feed |
| `packages/server/src/services/channel-manager.ts` | modify — personaId in postMessage |
| `packages/server/src/db/schema.ts` | modify — personaId column on channel_messages |
| `packages/server/src/db/embedded-migrations.ts` | modify — migration 0025 |
| `packages/server/src/db/migrations/0025_channel_message_persona_id.sql` | new |

## Acceptance Criteria

- [x] Debate with personas: agents respond with persona thinking style layered on role
- [x] API accepts `personaId` per agent in debate creation + round start
- [x] ModelBar shows persona avatar when assigned
- [x] ChannelFeed shows persona avatar next to agent messages
- [x] Judge remains persona-free
- [x] Debates without personas behave exactly as before
- [x] Persona systemPrompt is prepended to role prompt, not replacing it
- [x] Build passes

## Dependencies

- Phase 1 + Phase 2 completed (types, getPersonaById, PersonaAvatar all exist)

## Implementation Notes

- **Prompt layering**: `[Persona: Tim Cook]\n{persona.systemPrompt}\n---\n[Debate Role]\n{role prompt}`.
  Persona shapes HOW the agent thinks; role defines WHAT they argue.
- **Judge stays neutral**: Skip persona injection for judge agent in `startDebate()`.
- **DB migration 0025**: Added `persona_id TEXT` to `channel_messages` table for persistence.
- **WS compatibility**: Adding `personaId` to broadcast payload is additive — old clients ignore it.
