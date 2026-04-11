# Phase 2: Stats API + Recent Sessions Redesign

## Goal
Add RTK aggregates + source + startedAt to stats API. Redesign Recent Sessions table with expandable rows, source badges, and start time column.

## Data Flow
```
[GET /api/stats]
  sessions table → JOIN → {
    recentSessions: [{ ...existing, source, startedAt, rtkTokensSaved }],
    rtkSummary: { totalSaved, totalCompressions, cacheHitRate, costSaved }
  }

[Analytics Page — Recent Sessions]
  Click row → expand inline → show: first message, files modified, cost breakdown
  NO navigation to /sessions/[id]
```

## Code Contracts

```typescript
// Extended recentSessions response shape
interface RecentSession {
  id: string;
  name: string | null;
  model: string;
  projectSlug: string | null;
  source: string;           // NEW: "web" | "telegram" | "cli" | "api" | "desktop"
  startedAt: number;        // NEW: timestamp ms
  cost: number;
  turns: number;
  tokens: number;
  durationMs: number | null;
  rtkTokensSaved: number;   // NEW
  // For expanded view (lazy-loaded or included):
  filesModified: string[];  // NEW
  filesCreated: string[];   // NEW
}

// New RTK summary in stats response
interface RTKSummary {
  totalTokensSaved: number;   // SUM last 30d
  totalCompressions: number;
  totalCacheHits: number;
  cacheHitRate: number;       // hits / compressions
  estimatedCostSaved: number; // tokens × avg model rate
}
```

## Tasks

### Wave 1 — Backend: Extend stats endpoint

#### Task 1A: Add source + startedAt + RTK to recentSessions query
- **File**: `packages/server/src/routes/stats.ts` — modify
- **touches**: [stats.ts]
- **provides**: [recentSessions with source, startedAt, rtkTokensSaved, filesModified, filesCreated]
- **requires**: [Phase 1 RTK columns in DB]
- **Logic**: In the recent sessions query, add `sessions.source`, `sessions.startedAt`, `sessions.rtkTokensSaved`, `sessions.filesModified`, `sessions.filesCreated` to the SELECT. Map startedAt to timestamp number in response.
- **Edge case**: `source` defaults to "api" for old sessions — display as "API" in UI.

#### Task 1B: Add RTK summary aggregation
- **File**: `packages/server/src/routes/stats.ts` — modify
- **touches**: [stats.ts]
- **provides**: [rtkSummary in stats response]
- **requires**: [Phase 1 RTK columns]
- **Logic**: Add SQL: `SELECT SUM(rtk_tokens_saved), SUM(rtk_compressions), SUM(rtk_cache_hits) FROM sessions WHERE started_at >= thirtyDaysAgo`. Compute cacheHitRate and estimatedCostSaved (use weighted average model rate from modelBreakdown).
- **Edge case**: All zeros when RTK not used — return zeroed summary, don't omit.

### Wave 2 — Frontend: Recent Sessions redesign (depends on Wave 1 API shape)

#### Task 2A: Add source badge component
- **File**: `packages/web/src/app/analytics/page.tsx` — modify (inside SessionTable)
- **touches**: [page.tsx]
- **provides**: [SourceBadge inline component]
- **requires**: [Task 1A API]
- **depends_on**: [task-1a]
- **Logic**: Map source string to icon + label: web→Globe, telegram→TelegramLogo, cli→Terminal, desktop→Desktop, api→Code. Use Phosphor icons. Badge style: small pill with icon + text, colored per source type.

#### Task 2B: Add expandable row to SessionTable
- **File**: `packages/web/src/app/analytics/page.tsx` — modify SessionTable component
- **touches**: [page.tsx]
- **provides**: [expandable session rows]
- **requires**: [Task 1A API, Task 2A]
- **depends_on**: [task-1a, task-2a]
- **Logic**: Add `expandedId` state to SessionTable. Click row → toggle expanded. Expanded section shows: files modified/created list, RTK tokens saved, cost breakdown (input/output tokens). Add Start Time and Source columns to table header. Remove Link to /sessions/[id] — row click expands instead.
- **Edge case**: No files modified → show "No file changes". Multiple expanded rows → only one at a time (accordion).

#### Task 2C: Add RTK summary KPI card
- **File**: `packages/web/src/app/analytics/page.tsx` — modify KPI row
- **touches**: [page.tsx]
- **provides**: [RTK savings KPI card in overview]
- **requires**: [Task 1B API]
- **depends_on**: [task-1b]
- **Logic**: Add a 6th KPI card: "RTK Saved" with value = estimated cost saved, sub = total tokens saved. Use Lightning icon, green accent. Only show if rtkSummary.totalTokensSaved > 0.

## Failure Scenarios

| When | Then | Error |
|------|------|-------|
| Old sessions have no source | Default "api" shown | Correct — historical data |
| Old sessions have no RTK data | 0 shown | Correct — wasn't tracked |
| No sessions in 30d | Empty RTK summary (all zeros) | Hide RTK KPI card |
| Session has no files modified | Expanded view shows "No file changes" | Graceful empty state |

## Rejection Criteria
- DO NOT navigate to /sessions/[id] from Recent Sessions — expand inline only
- DO NOT fetch additional API calls per expanded row — use data already in stats response
- DO NOT use emoji for source indicators — use Phosphor icons
- DO NOT create new components in separate files — keep inline in page.tsx (analytics is self-contained)

## Cross-Phase Context
- **Assumes from Phase 1**: RTK columns exist in sessions table. Infinite loop bug is fixed.
- **Exports for Phase 3**: Stats response shape with rtkSummary. SourceBadge component pattern for reuse in tabs.

## Acceptance Criteria
- [ ] Recent Sessions table shows Start Time and Source columns
- [ ] Source shows correct icon for web/telegram/cli/desktop/api
- [ ] Clicking a row expands to show files + RTK + cost details
- [ ] Only one row expanded at a time
- [ ] RTK KPI card shows estimated cost saved (when > 0)
- [ ] No navigation to /sessions/[id] from analytics page
- [ ] Table still works with zero sessions (empty state)
