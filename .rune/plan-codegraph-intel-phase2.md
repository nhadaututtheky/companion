# Phase 2: Leiden Community Detection

## Goal
Replace naive path-based community detection with Leiden algorithm — a proper graph clustering method that finds functional modules by maximizing modularity. Produces cohesion-scored clusters that reveal actual architecture, not just file structure.

## Tasks
- [ ] Implement Leiden algorithm in pure TypeScript — `codegraph/leiden.ts` (no native deps, ~200 LOC)
  - Input: nodes + weighted edges (trust weights as edge weights)
  - Output: community assignments + modularity score + cohesion per community
  - Parameters: resolution (default 1.0), iterations (default 10)
- [ ] Replace path-based grouping in `analysis.ts` detectCommunities() with Leiden
  - Keep path-based as fallback when graph has <10 nodes (Leiden needs density)
  - Cache results per scan (invalidate on rescan)
- [ ] Add community labels — use AI (Haiku) to name each cluster based on member symbols
  - e.g., "Authentication & Session Management" instead of "Community 3"
  - Batch: 1 API call per 5 communities
- [ ] Expose via existing `/codegraph/communities` endpoint (no API changes needed)
- [ ] Add community data to MCP `companion_codegraph_stats` response

## Acceptance Criteria
- [ ] Leiden produces meaningful clusters (not just 1 giant community)
- [ ] Communities have human-readable AI-generated labels
- [ ] `/codegraph/communities` returns Leiden results with cohesion scores
- [ ] Performance: <2s for 500-node graph

## Files Touched
- `packages/server/src/codegraph/leiden.ts` — new (algorithm)
- `packages/server/src/codegraph/analysis.ts` — modify detectCommunities()
- `packages/server/src/codegraph/semantic-describer.ts` — add community labeling
- `packages/server/src/mcp/tools.ts` — enrich stats response

## Dependencies
- Phase 1 (communities wired to context injection)
