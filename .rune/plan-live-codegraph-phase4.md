# Phase 4: LLM-Enriched Labels

## Goal
Replace raw symbol names with human-readable feature descriptions on the graph. `handleMessage()` → "WebSocket Message Router — routes CLI↔Browser events". Labels are generated once per symbol via cached LLM call (Haiku tier), stored in CodeGraph DB, and displayed on the graph visualization.

## Architecture Split

### Backend (Agent Harness)
- **Semantic Describer already exists** — `codegraph/semantic-describer.ts`
  - Already generates 1-sentence descriptions for exported nodes
  - Already stores in `codeNodes.description` column
  - Already batches and uses Haiku tier
- **Gap**: descriptions are generic ("Handles messages") — need **feature-aware** labels
  - Enrich prompt: include file context, edge relationships, project domain
  - Output format: "Feature Area — What it does" (e.g., "Session Lifecycle — spawns and monitors CLI processes")
- **On-demand enrichment** for newly revealed nodes (Phase 2 integration)
  - When a node reveals for the first time → queue for description if missing
  - Background job, non-blocking

### Frontend (Human Eyes)
- **Label mode toggle** on graph toolbar
  - `symbol` mode: raw name (default, fast)
  - `feature` mode: LLM description (richer, requires descriptions populated)
- **Node tooltip** — hover shows full description even in symbol mode
- **Feature cluster labels** — group nodes by detected feature area
  - Use first word of description as cluster name
  - Render as translucent background behind node group

## Tasks

### Backend
- [ ] Enhance semantic-describer prompt
  - Include: file path, symbol signature, top 3 incoming/outgoing edges
  - Output format: "Feature Area — Description" (max 80 chars)
  - Example: "Debate Engine — orchestrates multi-agent conversation rounds"
- [ ] Add on-reveal description trigger
  - When event-collector processes a node without description → queue for enrichment
  - Batch: collect for 5s, then describe batch (max 20 per batch)
  - Non-blocking, fire-and-forget
- [ ] Add description to graph:activity event payload (if available)
  - `{ nodeId, symbolName, description?, ... }`

### Frontend
- [ ] Add label mode toggle to graph toolbar
  - Icon toggle: "Aa" (symbol) ↔ "✦" (feature)
  - Persist in localStorage
- [ ] Render descriptions on nodes in feature mode
  - Truncate to 60 chars on node, full on hover tooltip
  - If no description yet → show symbol name + "..." loading indicator
- [ ] Feature cluster backgrounds
  - Extract feature area from description prefix (before " — ")
  - Group nodes by area → compute bounding box → render translucent bg
  - Label cluster with feature area name

## Acceptance Criteria
- [ ] Toggle between symbol and feature label modes
- [ ] Feature mode shows "Session Lifecycle — spawns CLI processes" instead of "spawnSession"
- [ ] Newly revealed nodes queue for description automatically
- [ ] Descriptions cached in DB — no redundant LLM calls
- [ ] Hover tooltip shows full description in both modes
- [ ] Feature clusters visually group related nodes

## Files Touched
- `packages/server/src/codegraph/semantic-describer.ts` — modify (enhanced prompt)
- `packages/server/src/codegraph/event-collector.ts` — modify (trigger enrichment on reveal)
- `packages/web/src/components/panels/graph-visualization.tsx` — modify (label modes, clusters)

## Dependencies
- Requires Phase 1 (event-collector)
- Leverages existing semantic-describer infrastructure
- Phase 2 fog-of-war optional but enhances UX (reveal → enrich flow)
