# Phase 1: Event-Tap Overlay

## Goal
Tap into ws-bridge tool events to detect file mutations, match them to CodeGraph nodes, and broadcast `graph:activity` events. Frontend renders real-time node highlights with decay animation. This is the **foundation** all other phases build on.

## Architecture Split

### Backend (Agent Harness)
- **Graph Event Collector** — new module in `packages/server/src/codegraph/`
  - Listens to tool_use events from ws-bridge
  - Extracts filePath from tool input (Edit → file_path, Write → file_path, Bash → parse stdout for file paths)
  - Looks up matching CodeGraph nodes by filePath
  - Emits `graph:activity` event via session broadcast
  - Accumulates per-session activity stats (touch count per file/node)
  - Fire-and-forget — NEVER blocks agent thread

### Frontend (Human Eyes)  
- **Graph highlight system** — extend `graph-visualization.tsx`
  - Subscribe to `graph:activity` WS events
  - Highlight touched nodes (glow/pulse CSS animation)
  - Decay timer: 10s default → fade back to normal
  - Impact radius: BFS 1-2 hops on edge index, max 15 secondary highlights (dimmer glow)
  - Activity badge: show touch count on hot nodes

## Tasks

### Backend
- [ ] Create `packages/server/src/codegraph/event-collector.ts`
  - `extractFilePaths(toolName, toolInput, toolOutput)` — handles Edit, Write, Bash, MultiEdit
  - `matchNodesToFiles(projectSlug, filePaths)` — query graph-store by filePath
  - `SessionActivityTracker` class — per-session Map<filePath, { touchCount, lastTouched, nodeIds[] }>
- [ ] Hook into ws-bridge — after tool_use completes, call event-collector
  - Add to existing tool result handler (non-blocking, wrapped in try-catch)
  - Emit `graph:activity` message type via broadcastToAll
- [ ] Add `graph:activity` to BrowserIncomingMessage union type in shared/types
  - `{ type: 'graph:activity', filePath: string, nodeIds: string[], toolName: string, timestamp: number }`
- [ ] Add `graph:activity_summary` endpoint — GET /codegraph/activity/:sessionId
  - Returns accumulated activity stats for a session

### Frontend
- [ ] Add `graph:activity` handler in session WebSocket listener
  - Store in new `useGraphActivityStore` (Zustand)
  - State: `touchedNodes: Map<nodeId, { count, lastTouched, toolName }>`
  - `impactNodes: Map<nodeId, { distance, fromNodeId }>` (computed on each event)
- [ ] Extend `graph-visualization.tsx`
  - Apply CSS class `node-active` to touched nodes (glow animation)
  - Apply CSS class `node-impact` to impact-radius nodes (dimmer pulse)
  - Decay: setTimeout removes class after 10s (configurable)
  - Touch count badge on nodes with count > 1
- [ ] Add CSS animations in globals.css or component-level
  - `@keyframes node-pulse` — scale(1.05) + box-shadow glow, 2s loop
  - `@keyframes node-fade` — opacity transition for decay
  - Colors: tool-dependent (Edit = blue, Write = green, Bash = orange)
- [ ] Impact radius computation (client-side)
  - `computeImpactRadius(nodeId, edges, maxHops=2, maxNodes=15)` utility
  - BFS on ReactFlow edge index, weighted by trustWeight (drop lowest first)

## Acceptance Criteria
- [ ] Agent edits a file → corresponding graph node glows within 500ms
- [ ] Glow fades after 10s
- [ ] Impact radius shows 1-2 hop neighbors with dimmer highlight
- [ ] Multiple edits to same file → touch count badge increments
- [ ] Zero agent performance impact (event-collector is async, fire-and-forget)
- [ ] Works with existing graph visualization (no layout disruption)

## Files Touched
- `packages/server/src/codegraph/event-collector.ts` — **new**
- `packages/server/src/services/ws-bridge.ts` — modify (hook event-collector)
- `packages/shared/src/types/session.ts` — modify (add graph:activity message type)
- `packages/web/src/lib/stores/graph-activity-store.ts` — **new**
- `packages/web/src/components/panels/graph-visualization.tsx` — modify (highlights)
- `packages/web/src/app/globals.css` — modify (animations)

## Dependencies
- Requires CodeGraph scan data to exist (nodes populated)
- Requires active session with ws-bridge connection
