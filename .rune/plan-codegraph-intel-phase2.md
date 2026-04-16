# Phase 2: Leiden Community Detection

## Goal
Replace naive path-based community detection with Leiden algorithm — a proper graph clustering method that finds functional modules by maximizing modularity. Produces cohesion-scored clusters that reveal actual architecture, not just file structure.

## Tasks
- [x] Implement Leiden algorithm in pure TypeScript — `codegraph/leiden.ts` (no native deps, ~220 LOC)
  - Input: nodes + weighted edges (trust weights as edge weights)
  - Output: community assignments + modularity score + cohesion per community
  - Parameters: resolution (default 1.0), iterations (default 10)
- [x] Replace path-based grouping in `analysis.ts` detectCommunities() with Leiden
  - Keep path-based as fallback when graph has <10 nodes (Leiden needs density)
  - Cache results per scan (5-min TTL, invalidate on rescan)
- [x] Add community labels — AI (Haiku) names each cluster based on member symbols
  - `labelCommunities()` in semantic-describer.ts, batches 5 per API call
  - `enrichCommunitiesWithAILabels()` async wrapper in analysis.ts
  - Communities endpoint: `?ai=true` param triggers AI labeling
- [x] Expose via existing `/codegraph/communities` endpoint (no API changes needed)
- [x] Add community data to `/codegraph/stats` response + MCP tool description

## Acceptance Criteria
- [x] Leiden produces meaningful clusters (not just 1 giant community)
- [x] Communities have human-readable AI-generated labels (on-demand)
- [x] `/codegraph/communities` returns Leiden results with cohesion scores
- [x] `/codegraph/stats` includes communityCount + topCommunities
- [x] Performance: <2s for 500-node graph (pure TS, no native deps)

## Files Touched
- `packages/server/src/codegraph/leiden.ts` — new (algorithm)
- `packages/server/src/codegraph/analysis.ts` — Leiden + cache + AI label integration
- `packages/server/src/codegraph/semantic-describer.ts` — add `labelCommunities()`
- `packages/server/src/routes/codegraph.ts` — enrich stats + AI labels on communities
- `packages/server/src/mcp/tools.ts` — update tool description

## Dependencies
- Phase 1 (communities wired to context injection)
