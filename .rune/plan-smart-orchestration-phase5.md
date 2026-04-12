# Phase 5: UI + Feedback Loop

## Goal
User thấy dispatch decisions, có thể override, và feedback loop giúp classifier tốt hơn theo thời gian.

## UI Components

### 1. Dispatch Preview (before execution)
Khi confidence 0.5-0.8, show inline suggestion:

```
┌──────────────────────────────────────────────┐
│ 🔀 Smart Dispatch suggests:                 │
│                                              │
│ Pattern: Workflow (Review → Fix)             │
│ Model: Sonnet for both steps                 │
│ Estimated cost: ~$0.15                       │
│                                              │
│ [▶ Run]  [✏ Edit]  [✕ Just send as message]  │
└──────────────────────────────────────────────┘
```

### 2. Dispatch Status (during execution)
In session header or sidebar:

```
┌──────────────────────────────────────────────┐
│ Workflow: Review → Fix                       │
│ Step 1/2: Reviewing... (sonnet) ●            │
│ Cost so far: $0.08 / $0.50 cap               │
└──────────────────────────────────────────────┘
```

### 3. Session Memory Panel (settings or sidebar)
Show learned insights with controls:

```
┌──────────────────────────────────────────────┐
│ Session Memory (12 insights)                 │
│                                              │
│ 🟢 [pattern] Zustand shallow compare...      │
│ 🟡 [mistake] Regenerate embedded-migra...    │
│ 🔴 [preference] No Bash in /db/...     [🗑]  │
│                                              │
│ [Clear All]  [Export]                        │
└──────────────────────────────────────────────┘
```

### 4. Feedback Buttons (post-dispatch)
After workflow/debate completes:

```
Was this dispatch helpful?  [👍 Yes]  [👎 No, should have been ___]
```

Feedback updates classifier confidence + session_insights relevance.

## Tasks
- [ ] Create `packages/web/src/components/orchestration/dispatch-preview.tsx`
  - Shows classification result with Run/Edit/Skip buttons
  - Edit mode: change pattern, model, steps
- [ ] Create `packages/web/src/components/orchestration/dispatch-status.tsx`
  - Real-time step progress via WebSocket events
- [ ] Create `packages/web/src/components/orchestration/session-memory-panel.tsx`
  - List insights with delete, clear all, export
- [ ] Add feedback endpoint `POST /api/dispatch-feedback`
  - `{ dispatchId, helpful: boolean, correction?: string }`
  - Updates classifier hints table for future improvement
- [ ] Add orchestration settings to settings page
  - Toggle: auto-dispatch on/off
  - Confidence threshold slider (0.5-1.0)
  - Default model preferences per complexity level
  - Session memory: on/off, max insights count
- [ ] Wire dispatch events to UI via WebSocket
  - `dispatch:preview` → show preview
  - `dispatch:started` → show status
  - `dispatch:step_complete` → update progress
  - `dispatch:complete` → show feedback

## Acceptance Criteria
- [ ] User sees dispatch suggestion before auto-execution (when confidence <0.8)
- [ ] User can override any dispatch decision
- [ ] Feedback stored and used to improve future classifications
- [ ] Session memory viewable and deletable from UI
- [ ] All orchestration features gated behind settings toggle (off by default)

## Files Touched
- `packages/web/src/components/orchestration/dispatch-preview.tsx` — new
- `packages/web/src/components/orchestration/dispatch-status.tsx` — new
- `packages/web/src/components/orchestration/session-memory-panel.tsx` — new
- `packages/web/src/lib/stores/orchestration-store.ts` — new
- `packages/server/src/routes/orchestration.ts` — new (feedback endpoint)
- `packages/web/src/components/settings/settings-tab-ai.tsx` — modify (add orchestration settings)

## Dependencies
- Phase 1-4 complete
- WebSocket event system (event-bus.ts)
- Settings system (settings-helpers.ts)
