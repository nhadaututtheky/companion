# Phase 3: Feature Intelligence Tabs

## Goal
Add tabbed navigation to Analytics page with 4 tabs: Overview (existing), RTK Performance, Wiki KB Health, CodeGraph. Each tab fetches data from dedicated API endpoint.

## Data Flow
```
[Analytics Page]
  Tab bar: [Overview] [RTK] [Wiki KB] [CodeGraph]
                          │        │         │
                          ▼        ▼         ▼
                   GET /api/stats  GET /api/wiki  GET /api/codegraph/stats
                   (rtkSummary)    (all domains)  (per-project)

[GET /api/stats/features]  ← NEW endpoint aggregating cross-feature metrics
  → rtkByDay: [{ date, tokensSaved, compressions }]  (30d daily breakdown)
  → rtkByStrategy: [{ strategy, count, tokensSaved }] (requires Phase 4 tracking)
  → wikiSummary: { domains, totalArticles, totalTokens, staleCount }
  → codegraphSummary: { projects, totalNodes, totalEdges, coverage }
```

## Code Contracts

```typescript
// GET /api/stats/features response
interface FeatureStatsResponse {
  rtk: {
    daily: Array<{ date: string; tokensSaved: number; compressions: number }>;
    totalTokensSaved: number;
    totalCompressions: number;
    cacheHitRate: number;
    estimatedCostSaved: number;
  };
  wiki: {
    domains: Array<{
      slug: string; name: string;
      articleCount: number; totalTokens: number;
      staleCount: number; lastCompiledAt: string | null;
      rawPending: number;
    }>;
    totalArticles: number;
    totalTokens: number;
  };
  codegraph: {
    projects: Array<{
      slug: string;
      files: number; nodes: number; edges: number;
      lastScannedAt: string | null;
      coveragePercent: number;
    }>;
  };
}
```

## Tasks

### Wave 1 — Backend: /api/stats/features endpoint

#### Task 1A: Create features stats route
- **File**: `packages/server/src/routes/stats.ts` — modify (add new route)
- **touches**: [stats.ts]
- **provides**: [GET /api/stats/features endpoint]
- **requires**: [Phase 1 RTK columns]
- **Logic**: New route `GET /api/stats/features`. RTK section: query sessions table grouped by date for daily RTK savings (last 30d). Wiki section: call `listDomains()` from wiki/store, for each domain call `listRawFiles()` to count pending, call linter for stale count. CodeGraph section: query codeScanJobs + codeFiles + codeNodes + codeEdges tables grouped by project.
- **Edge case**: Wiki not initialized → empty domains array. CodeGraph never scanned → empty projects array.

#### Task 1B: Add API client method
- **File**: `packages/web/src/lib/api-client.ts` — modify
- **touches**: [api-client.ts]
- **provides**: [api.stats.features() method]
- **requires**: [Task 1A]
- **depends_on**: [task-1a]
- **Logic**: Add `features: () => get<FeatureStatsResponse>("/api/stats/features")` to api.stats namespace.

### Wave 2 — Frontend: Tab infrastructure + RTK tab

#### Task 2A: Add tab navigation to Analytics page
- **File**: `packages/web/src/app/analytics/page.tsx` — modify
- **touches**: [page.tsx]
- **provides**: [tab bar with Overview/RTK/Wiki KB/CodeGraph]
- **requires**: [Task 1B]
- **depends_on**: [task-1b]
- **Logic**: Add `activeTab` state. Tab bar below header: 4 tabs styled as underlined text buttons. Overview tab renders existing content. Other tabs render new components (defined below). Feature tabs fetch from `/api/stats/features` on first tab switch (lazy load, cache in state).

#### Task 2B: RTK Performance tab content
- **File**: `packages/web/src/app/analytics/page.tsx` — modify (add RTKTab component)
- **touches**: [page.tsx]
- **provides**: [RTK Performance tab]
- **requires**: [Task 2A, Task 1A]
- **depends_on**: [task-2a]
- **Logic**: KPI row: Total Tokens Saved (big number), Est. Cost Saved ($), Compressions, Cache Hit Rate %. Daily savings bar chart (reuse BarChart component, valueKey="tokensSaved"). Show note "Per-strategy breakdown coming soon" placeholder.
- **Edge case**: All zeros → show "RTK has not processed any sessions yet" empty state.

#### Task 2C: Wiki KB Health tab content
- **File**: `packages/web/src/app/analytics/page.tsx` — modify (add WikiTab component)
- **touches**: [page.tsx]
- **provides**: [Wiki KB Health tab]
- **requires**: [Task 2A, Task 1A]
- **depends_on**: [task-2a]
- **Logic**: Summary KPI: total domains, total articles, total tokens stored. Per-domain cards: domain name, article count, tokens, stale count (warning color if > 0), raw files pending compilation, last compiled date. Stale articles shown with warning badge.
- **Edge case**: No domains → show "No Wiki KB domains configured" with link to docs.

#### Task 2D: CodeGraph tab content
- **File**: `packages/web/src/app/analytics/page.tsx` — modify (add CodeGraphTab component)
- **touches**: [page.tsx]
- **provides**: [CodeGraph tab]
- **requires**: [Task 2A, Task 1A]
- **depends_on**: [task-2a]
- **Logic**: Per-project cards: project slug, file/node/edge counts, coverage %, last scanned. Summary: total projects scanned, total nodes, total relationships. Coverage bar per project (files with nodes / total files).
- **Edge case**: Never scanned → show "Run a CodeGraph scan to see intelligence metrics" empty state.

## Failure Scenarios

| When | Then | Error |
|------|------|-------|
| /api/stats/features fails | Show error banner on tab, Overview still works | Tab-isolated error |
| Wiki store not initialized | Empty domains array returned | Empty state UI |
| CodeGraph never scanned | Empty projects array | Empty state UI |
| Wiki linter slow (many domains) | May add latency to features endpoint | Accept — called infrequently |
| Tab switch while data loading | Show loading spinner per tab | UX: don't block other tabs |

## Rejection Criteria
- DO NOT fetch all tab data on page load — lazy load on tab switch
- DO NOT create separate page routes for tabs — keep as single page with tab state
- DO NOT split into separate component files — keep in page.tsx (analytics is self-contained, ~800 lines total is acceptable)
- DO NOT add real-time updates to feature tabs — static data refreshed on page load/tab switch
- DO NOT show "0%" coverage as an error — it's valid for unscanned projects

## Cross-Phase Context
- **Assumes from Phase 1**: RTK columns in sessions table, infinite loop fixed
- **Assumes from Phase 2**: Stats API returns rtkSummary, Recent Sessions has source/startedAt
- **Exports for Phase 4**: Tab infrastructure ready for AI Context tab, features endpoint extensible

## Acceptance Criteria
- [ ] 4 tabs visible: Overview, RTK, Wiki KB, CodeGraph
- [ ] Tab switching works without page reload
- [ ] RTK tab shows daily savings chart + KPI cards
- [ ] Wiki tab shows per-domain breakdown with stale warnings
- [ ] CodeGraph tab shows per-project node/edge/coverage stats
- [ ] Each tab has proper empty state when no data available
- [ ] Feature data lazy-loaded on first tab switch
- [ ] /api/stats/features returns correct aggregated data
