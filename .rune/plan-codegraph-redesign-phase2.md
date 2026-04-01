# Phase 2: Live Context Feed — Show What AI Sees

## Goal
Make the invisible visible — show users exactly what context CodeGraph injects into their Claude sessions in real-time.

## Tasks
- [ ] Add server-side WS event: `codegraph:injection` — emit when context is injected
  - Payload: `{ sessionId, type: "project_map"|"message_context"|"plan_review"|"break_check", summary: string, tokenCount: number, timestamp: number }`
  - Emit from each injection point in `ws-bridge.ts`
- [ ] Frontend: subscribe to `codegraph:injection` events
- [ ] Build Feed tab UI:
  - Timeline of injection events, newest first
  - Each entry: icon by type, session shortId, summary text, token count, timestamp
  - Click to expand: show full injected XML content
  - Filter by session (dropdown) or show all
  - Auto-scroll to latest, pause when user scrolls up
- [ ] Add injection counter in panel header: "42 injections today"
- [ ] Add "Context preview" button per session card — peek at what graph will inject for next message

## Acceptance Criteria
- [ ] Feed shows real-time injection events as messages are sent
- [ ] Expanding an event shows the actual XML content injected
- [ ] Feed filters by session correctly
- [ ] Counter increments live
- [ ] No performance impact — events are lightweight, max 100 in feed (ring buffer)

## Files Touched
- `packages/server/src/services/ws-bridge.ts` — emit injection events (4 points)
- `packages/server/src/codegraph/agent-context-provider.ts` — capture injection content
- `packages/web/src/components/panels/codegraph-panel.tsx` — Feed tab component
- `packages/web/src/hooks/use-session.ts` — subscribe to new WS event type

## Dependencies
- Phase 1 complete (tab structure exists)
