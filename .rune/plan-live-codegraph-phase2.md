# Phase 2: Fog-of-War Reveal

## Goal
Transform the graph visualization into a progressive reveal experience. All nodes start fogged (desaturated, low opacity). As the agent touches files, corresponding nodes "reveal" with animation. A coverage ring shows the convex hull of revealed nodes — instant visual blast radius. Killer for spectator mode.

## Architecture Split

### Backend (Agent Harness)
- **No new backend work** — reuses Phase 1's `graph:activity` events
- Optional: `GET /codegraph/activity/:sessionId/coverage` — returns list of all revealed filePaths for session resume

### Frontend (Human Eyes)
- **Fog layer** on graph-visualization
  - Default state: all nodes desaturated (grayscale filter + 30% opacity)
  - Reveal states: `untouched | read | modified | hot` (progressive brightness)
  - `read` = agent read but didn't modify (from tool_use type detection)
  - `modified` = agent edited/wrote file
  - `hot` = modified 3+ times
- **Reveal animation**
  - Node transition: grayscale → full color with brief flash (200ms white overlay)
  - Edges connecting two revealed nodes also reveal
  - Edges to fogged nodes stay fogged (no spoilers)
- **Coverage ring**
  - Convex hull of all revealed node positions
  - Animated border that grows as more nodes reveal
  - Shows % of total graph revealed (e.g., "23% explored")
- **Spectator UX**
  - Fog state syncs via spectator WebSocket
  - Late-joining spectators get current reveal state from activity summary

## Tasks

- [ ] Add reveal state to `useGraphActivityStore`
  - `revealState: Map<nodeId, 'untouched' | 'read' | 'modified' | 'hot'>`
  - Compute from activity events: tool_use type → read vs modify classification
  - `tool_use` with Edit/Write/MultiEdit → `modified`
  - `tool_use` with Read/Grep/Glob → `read`  
  - `modified` count >= 3 → `hot`
- [ ] Implement fog CSS layer in graph-visualization
  - Default node class: `node-fogged` (filter: grayscale(100%) opacity(0.3))
  - `node-read`: grayscale(30%) opacity(0.6)
  - `node-modified`: grayscale(0%) opacity(1.0) + brief flash
  - `node-hot`: opacity(1.0) + persistent subtle pulse + red-orange tint
  - Edge class: `edge-fogged` (opacity 0.1) vs `edge-revealed` (opacity based on trust)
- [ ] Implement reveal animation
  - CSS transition: 400ms ease-out on filter + opacity
  - Flash keyframe: 200ms white overlay on first reveal
  - Combine with Phase 1 glow (active glow ON TOP of reveal state)
- [ ] Implement coverage ring
  - Compute convex hull of revealed node positions (Graham scan or simple bbox)
  - Render as SVG path in ReactFlow custom layer
  - Animate border with dash-array animation
  - Show "X% explored" label
- [ ] Add fog toggle control
  - Button in graph toolbar: "Fog: ON | OFF"
  - OFF = classic view (all nodes visible, no fog)
  - Persist preference in localStorage
- [ ] Spectator sync
  - On spectator connect, send current reveal state map
  - Activity summary endpoint returns reveal state for session resume

## Acceptance Criteria
- [ ] Fresh session → all graph nodes appear fogged/gray
- [ ] Agent reads a file → node partially reveals (desaturated lift)
- [ ] Agent edits a file → node fully reveals with flash animation
- [ ] Edges between two revealed nodes become visible
- [ ] Coverage ring grows as more nodes reveal
- [ ] "X% explored" updates in real-time
- [ ] Spectator joining mid-session sees correct reveal state
- [ ] Fog can be toggled off for classic view

## Files Touched
- `packages/web/src/lib/stores/graph-activity-store.ts` — modify (add reveal state)
- `packages/web/src/components/panels/graph-visualization.tsx` — modify (fog layer, reveal, coverage ring)
- `packages/web/src/app/globals.css` — modify (fog animations)

## Dependencies
- Requires Phase 1 (event-tap infrastructure)
