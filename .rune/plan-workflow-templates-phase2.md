# Phase 2: Pipeline Orchestrator

## Goal

Build the sequential execution engine that runs workflow steps, auto-routes output between agents, and tracks pipeline progress.

## Tasks

### 2.1 Workflow Channel Type
- [ ] Add `type: 'workflow'` to channel schema (alongside existing debate/review/red_team/brainstorm) — `packages/server/src/db/schema.ts`
- [ ] Add `workflowTemplateId` and `workflowState` (JSON) fields to channels table
- [ ] WorkflowState structure:
  ```ts
  type WorkflowState = {
    templateId: string
    currentStep: number
    steps: Array<{
      role: string
      sessionId: string | null  // assigned Claude session
      status: 'pending' | 'running' | 'completed' | 'failed'
      startedAt?: string
      completedAt?: string
      output?: string          // summary of step output
    }>
    topic: string
    totalCostUsd: number
  }
  ```

### 2.2 Pipeline Engine
- [ ] Create `WorkflowEngine` service — `packages/server/src/services/workflow-engine.ts` (new):
  - `startWorkflow(templateId, topic, projectSlug?)` — create channel + spawn first step session
  - `advanceStep(channelId)` — when current step completes, spawn next step session with context
  - `getWorkflowStatus(channelId)` — return current progress
  - `cancelWorkflow(channelId)` — stop all running sessions, mark failed
- [ ] Auto-detect step completion: monitor session for `session:idle` event (from v3-phase1)
- [ ] Context handoff between steps:
  - Extract summary of previous step's output (last 2000 chars or AI-summarized)
  - Inject into next step's prompt via `{{previousOutput}}` placeholder
  - Include `{{topic}}` from workflow creation

### 2.3 Session-Workflow Linking
- [ ] When workflow spawns a session, set `session.channelId` to workflow channel
- [ ] Tag session with workflow role (e.g., "planner", "builder") in session metadata
- [ ] Workflow sessions use mention-router for cross-referencing: `@planner`, `@builder`
- [ ] When all steps complete, auto-conclude workflow channel with summary

### 2.4 Cost & Safety Controls
- [ ] Per-workflow cost cap (default $1.00, configurable per template)
- [ ] Per-step timeout (default 5 minutes, configurable)
- [ ] If step fails/times out: pause workflow, notify user, allow retry or skip
- [ ] Total workflow timeout (default 30 minutes)

## Acceptance Criteria

- [ ] Starting a workflow from template creates channel + first session automatically
- [ ] When step 1 completes, step 2 auto-starts with context from step 1
- [ ] 3-step workflow (planner→builder→verifier) runs end-to-end without manual intervention
- [ ] Cost tracked per workflow, stops if cap exceeded
- [ ] Failed step pauses workflow (not crashes)
- [ ] Workflow status queryable via API

## Files Touched

- `packages/server/src/db/schema.ts` — modify (workflow fields on channels)
- `packages/server/src/services/workflow-engine.ts` — new
- `packages/server/src/services/channel-manager.ts` — modify (workflow channel type)
- `packages/server/src/services/session-store.ts` — modify (workflow metadata on sessions)
- `packages/server/src/routes/channels.ts` — modify (workflow start/status/cancel endpoints)

## Dependencies

- Phase 1 completed (template schema + built-in templates)
- v3-phase1 `session:idle` event (for step completion detection)
- Existing mention-router for cross-step @mentions
