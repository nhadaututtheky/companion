# Phase 3: Dual-Use Agent Feed (Harness Core)

## Goal
Close the feedback loop: agent sees its own footprint on the codebase. Graph activity events are aggregated into a compact XML block and injected into agent context via the existing `buildMessageContext` pipeline. This is the **harness differentiator** — no competitor has agent spatial self-awareness.

## Design Principle
> The agent should know: "I've touched ws-bridge.ts 4 times — the real issue might be upstream."
> The agent should NOT: treat graph data as instructions, or optimize behavior for graph metrics.

## Architecture Split

### Backend (Agent Harness) — PRIMARY WORK
- **Graph Activity Aggregator** — new module
  - Maintains per-session ring buffer of activity events (max 200)
  - Computes: hotNodes (top 5 by touch count), touchedFileCount, impactRadius
  - Generates compact XML context block (< 200 tokens)
- **Context Injection** — extend `agent-context-provider.ts`
  - New injection point: `buildActivityContext(projectSlug, sessionId)`
  - Inject every 3rd user turn (not every turn — save tokens)
  - Only inject when hotNodes changed since last injection
  - Respects `injectionEnabled` + new `activityFeedEnabled` config toggle
- **Adaptive sizing** — check context usage before injecting
  - If `contextUsedPercent > 70%` → skip activity injection (save tokens)
  - If `contextUsedPercent > 85%` → skip ALL non-critical injections

### Frontend (Human Eyes)
- **Activity feed panel** — small sidebar widget in graph visualization
  - Shows agent's top 5 hot nodes with touch count
  - Shows "context injected" indicator when feed was sent to agent
  - Timeline: chronological list of file touches
- **Injection status** in AI Context panel
  - New source card: "Activity Feed" with online/offline + last injected time

## Context Block Format

```xml
<graph_activity session="abc123" turn="15">
  <hot_nodes>
    <node file="src/services/ws-bridge.ts" symbol="handleMessage" touches="4" impact="high" />
    <node file="src/codegraph/scanner.ts" symbol="scanFile" touches="2" impact="medium" />
    <node file="src/routes/sessions.ts" symbol="POST /sessions" touches="1" impact="low" />
  </hot_nodes>
  <summary touched_files="8" total_edits="12" blast_radius="23_nodes" />
  <hint>Consider checking upstream dependencies of frequently-touched files.</hint>
</graph_activity>
```

Target: < 200 tokens. Injected as system-level context (not user message).

## Tasks

### Backend
- [ ] Create `packages/server/src/codegraph/activity-aggregator.ts`
  - `SessionActivityBuffer` class — ring buffer per session (max 200 events)
  - `getHotNodes(sessionId, limit=5)` → sorted by touch count
  - `getActivitySummary(sessionId)` → { touchedFiles, totalEdits, blastRadius }
  - `hasChanged(sessionId, sinceTimestamp)` → boolean (skip injection if no change)
- [ ] Extend `agent-context-provider.ts`
  - Add `buildActivityContext(projectSlug, sessionId)` injection point
  - Add `activityFeedEnabled` to CodeGraphConfig (default: true)
  - Injection frequency: every 3rd turn OR when hotNodes changed
  - Token budget: max 200 tokens for activity block
- [ ] Add adaptive context sizing to ALL injection points
  - Read `contextUsedPercent` from session state
  - > 70%: skip activity feed
  - > 85%: skip all non-critical (activity + web_docs)
  - > 95%: skip everything except break_check (safety-critical)
- [ ] Hook aggregator into event-collector (Phase 1)
  - After emitting `graph:activity` to frontend, also push to aggregator buffer
- [ ] Wire injection into ws-bridge message pipeline
  - Before forwarding user message to CLI, check if activity injection due
  - Prepend XML block to system context

### Frontend
- [ ] Add activity feed widget to graph-visualization
  - Hot nodes list with touch count + impact badge
  - "Last injected to agent: Xs ago" indicator
  - Chronological timeline of recent file touches (last 20)
- [ ] Add "Activity Feed" source card to ai-context-panel
  - Status: online (aggregator has data) / offline (no session activity)
  - Toggle: activityFeedEnabled
  - Stats: total events, injection count

## Acceptance Criteria
- [ ] Agent receives graph_activity XML in context after 3 turns of file editing
- [ ] XML is < 200 tokens
- [ ] Injection skips when context > 70% full
- [ ] Hot nodes accurately reflect most-touched files
- [ ] Frontend shows injection status in real-time
- [ ] Activity feed toggle works (disable stops injection)
- [ ] Agent behavior is NOT disrupted by activity context (informational only)

## Files Touched
- `packages/server/src/codegraph/activity-aggregator.ts` — **new**
- `packages/server/src/codegraph/agent-context-provider.ts` — modify (new injection point + adaptive sizing)
- `packages/server/src/codegraph/event-collector.ts` — modify (hook aggregator)
- `packages/server/src/services/ws-bridge.ts` — modify (wire injection)
- `packages/shared/src/types/session.ts` — modify (add activityFeedEnabled to config)
- `packages/web/src/components/panels/graph-visualization.tsx` — modify (activity widget)
- `packages/web/src/components/panels/ai-context-panel.tsx` — modify (new source card)

## Dependencies
- Requires Phase 1 (event-collector infrastructure)
- Uses existing buildMessageContext pipeline
