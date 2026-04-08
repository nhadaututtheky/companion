# Phase 4: Brain Intelligence — Auto-Delegation

## Goal
Make the brain session smart enough to autonomously analyze tasks, spawn appropriate specialists, track progress, and synthesize results.

## Prerequisites
- Phase 1 complete (spawn + wake API)
- Phase 2 complete (UI to visualize agents)

## Design
Brain intelligence is implemented as a **system prompt injection** + **command interception**, not hardcoded logic. This keeps it flexible and model-agnostic.

## Tasks

### 4.1 — Brain system prompt template ✅
- [x] Created `packages/shared/src/brain-prompts.ts` with `BRAIN_COORDINATOR_PROMPT`
- [x] Exported `WORKSPACE_TEMPLATES` — 4 presets (full-stack, code-review, research, refactor)
- [x] Customizable per workspace via system prompt override

### 4.2 — /spawn command interception ✅
- [x] In `ws-bridge.ts` `handleUserMessage()`, detect `/spawn` regex pattern
- [x] Parse: `/spawn "Backend Engineer" --role specialist --model sonnet --prompt "task"`
- [x] `handleSpawnCommand()` calls `this.startSession()` with parentId, role, model
- [x] Broadcasts `child_spawned` event to parent's subscribers
- [x] Injects confirmation message into brain session
- [x] Session limit check before spawning

### 4.3 — /status command ✅
- [x] Detect `/status` in user message
- [x] `handleStatusCommand()` queries children via `getChildSessions()`
- [x] Merges DB status with live ActiveSession status
- [x] Injects formatted status report with icons, cost, and role

### 4.4 — Workspace templates in UI ✅
- [x] Spawn modal shows "Quick Templates" grid above manual form
- [x] Each template button spawns all agents sequentially
- [x] Shows agent count and template name
- [x] "or manual" divider between templates and custom form

### 4.5 — Completion synthesis ⬚ Deferred
- [ ] When all children are idle/ended → inject prompt to brain
- [ ] Brain synthesizes final answer
- *Deferred: requires child status tracking refactor — can be added incrementally*

### 4.6 — Cost tracking per workspace ⬚ Deferred
- [ ] Aggregate cost across brain + all children
- [ ] Per-agent cost breakdown in sidebar
- *Deferred: /status already shows per-agent cost — full UI can come later*

## Files Touched
- `packages/shared/src/brain-prompts.ts` — NEW: brain system prompts + workspace templates
- `packages/shared/src/index.ts` — export brain-prompts
- `packages/server/src/services/ws-bridge.ts` — /spawn + /status handlers, imports
- `packages/web/src/components/session/spawn-agent-modal.tsx` — template selection UI

## Acceptance Criteria
- [x] Brain session with coordinator prompt can autonomously spawn + delegate
- [x] /spawn command creates real child sessions with correct parentId + role
- [x] /status shows real-time agent statuses with cost
- [x] Workspace templates spawn pre-configured agent teams from UI
- [ ] All-agents-done triggers synthesis prompt (deferred)
- [ ] Total workspace cost displayed in header (deferred)
