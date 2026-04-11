# Phase 4: Context Injection Logging

## Goal
Persist context:injection events to DB so AI Context tab shows real usage data — which injection types fire, how many tokens consumed, effectiveness over time.

## Data Flow
```
[agent-context-provider.ts]          [DB: context_injection_log]
  buildProjectMap()      ──emit──►   INSERT { sessionId, type="project_map", tokens, ts }
  buildMessageContext()  ──emit──►   INSERT { sessionId, type="message_context", tokens, ts }
  reviewPlan()           ──emit──►   INSERT { sessionId, type="plan_review", tokens, ts }
  checkBreaks()          ──emit──►   INSERT { sessionId, type="break_check", tokens, ts }
  buildActivityContext() ──emit──►   INSERT { sessionId, type="activity_feed", tokens, ts }

[GET /api/stats/features]
  context_injection_log  ──query──►  { injectionsByType, dailyInjections, totalTokensInjected }

[Analytics Page — AI Context tab]
  ← api.stats.features() → injection frequency heatmap, type breakdown, token budget usage
```

## Code Contracts

```typescript
// Migration 0033: context_injection_log table
CREATE TABLE context_injection_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project_slug TEXT,
  injection_type TEXT NOT NULL,  -- project_map | message_context | plan_review | break_check | activity_feed
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_cil_session ON context_injection_log(session_id);
CREATE INDEX idx_cil_type ON context_injection_log(injection_type);
CREATE INDEX idx_cil_created ON context_injection_log(created_at);

// Drizzle schema
export const contextInjectionLog = sqliteTable("context_injection_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  projectSlug: text("project_slug"),
  injectionType: text("injection_type").notNull(),
  tokenCount: integer("token_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// Extended FeatureStatsResponse.context
interface ContextStats {
  injectionsByType: Array<{ type: string; count: number; totalTokens: number }>;
  daily: Array<{ date: string; injections: number; tokens: number }>;
  totalInjections: number;
  totalTokensInjected: number;
  topSessionsByInjections: Array<{ sessionId: string; name: string; injections: number }>;
}
```

## Tasks

### Wave 1 — DB + Schema

#### Task 1A: Create migration 0033
- **File**: `packages/server/src/db/migrations/0033_context_injection_log.sql` — new
- **touches**: [0033_context_injection_log.sql]
- **provides**: [context_injection_log table with indexes]
- **requires**: []

#### Task 1B: Add Drizzle schema
- **File**: `packages/server/src/db/schema.ts` — modify
- **touches**: [schema.ts]
- **provides**: [contextInjectionLog table definition]
- **requires**: [Task 1A]
- **depends_on**: [task-1a]

#### Task 1C: Regenerate embedded-migrations.ts
- **File**: `packages/server/src/db/embedded-migrations.ts` — regenerate
- **touches**: [embedded-migrations.ts]
- **provides**: [embedded migration including 0033]
- **requires**: [Task 1A]
- **depends_on**: [task-1a]

### Wave 2 — Persist injection events

#### Task 2A: Log injections in agent-context-provider
- **File**: `packages/server/src/codegraph/agent-context-provider.ts` — modify
- **touches**: [agent-context-provider.ts]
- **provides**: [DB logging of every context injection]
- **requires**: [Task 1B schema]
- **depends_on**: [task-1b]
- **Logic**: After each injection point builds its context and emits WS event, also INSERT into context_injection_log. Use the tokenEstimate already calculated for WS broadcast. Fire-and-forget (don't await, don't block injection).
- **Edge case**: DB write fails → log error, don't crash injection. Agent context delivery is more important than logging.

### Wave 3 — API + Frontend

#### Task 3A: Add context stats to /api/stats/features
- **File**: `packages/server/src/routes/stats.ts` — modify
- **touches**: [stats.ts]
- **provides**: [context section in features response]
- **requires**: [Task 2A, Task 1B]
- **depends_on**: [task-2a]
- **Logic**: Query context_injection_log: GROUP BY injection_type for breakdown, GROUP BY date for daily trend, SUM tokens for totals. Last 30 days. Top 5 sessions by injection count.

#### Task 3B: Add AI Context tab to Analytics page
- **File**: `packages/web/src/app/analytics/page.tsx` — modify
- **touches**: [page.tsx]
- **provides**: [AI Context tab with injection metrics]
- **requires**: [Task 3A]
- **depends_on**: [task-3a]
- **Logic**: KPI row: Total Injections, Tokens Injected, Most Used Type. Injection type breakdown: 5 bars (project_map, message_context, plan_review, break_check, activity_feed) with count + tokens. Daily injection chart (reuse BarChart). Top sessions table (which sessions got most context help).
- **Edge case**: No injections logged yet → show "AI Context Intelligence will show metrics after sessions run with CodeGraph enabled" empty state.

## Failure Scenarios

| When | Then | Error |
|------|------|-------|
| context_injection_log INSERT fails | Log error, injection continues | Agent not blocked |
| No CodeGraph scanned | No injections occur | Empty state in UI |
| High-frequency injections (many turns) | Many rows inserted | Index on created_at handles query perf |
| Old sessions before Phase 4 | No injection logs | Only new sessions appear |

## Rejection Criteria
- DO NOT make injection delivery dependent on DB write — fire-and-forget
- DO NOT store the actual injected content — only type + token count (content is ephemeral)
- DO NOT query context_injection_log in hot paths — only in stats endpoint
- DO NOT add injection logging to ws-bridge — keep it in agent-context-provider where events originate

## Cross-Phase Context
- **Assumes from Phase 1**: RTK columns, infinite loop fixed
- **Assumes from Phase 2**: Stats API extended, Recent Sessions redesigned
- **Assumes from Phase 3**: Tab infrastructure + /api/stats/features endpoint exists, Wiki + CodeGraph tabs done
- **Exports**: Complete Analytics v2 feature

## Acceptance Criteria
- [ ] context_injection_log table created with indexes
- [ ] After a session with CodeGraph enabled, injection log rows appear
- [ ] /api/stats/features returns context section with breakdown by type
- [ ] AI Context tab shows injection frequency and token usage
- [ ] Tab has proper empty state when no injections logged
- [ ] Injection delivery performance not degraded by logging
