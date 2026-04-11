# Phase 4: Cross-Domain Index Awareness

## Goal
Sessions can discover and query knowledge from any wiki domain, not just the configured default.
L0 injects lightweight indexes from secondary domains so agents know what's available.

## Data Flow
```
[Session Start]
  → getWikiStartContext(cwd)
  → Load primary domain: core + index (existing, ~3K tokens)
  → Load secondary domain indexes: index-only, ~200 tokens each
  → Agent sees: "Research domain has: graphify-patterns, ..."
  → Agent decides: query research domain on-demand if needed

[On-Demand Query]
  → POST /api/wiki/:domain/query (any domain, not just default)
  → Already works — no route change needed
  → Agent can query "research" domain from "companion" session
```

## Code Contracts
```typescript
// In types.ts — extend WikiConfig
interface WikiConfig {
  rootPath: string;
  defaultDomain: string | null;
  secondaryDomains: string[]; // NEW — domains to inject index-only in L0
  enabled: boolean;
}

// In context-budget.ts — updated function
function getWikiStartContext(cwd?: string): {
  content: string;
  tokens: number;
  domains: string[]; // primary + secondaries
} | null;
```

## Tasks

### Wave 1 — Config + Types
- **Task 1a**: Add secondaryDomains to WikiConfig
  - **File**: `packages/server/src/wiki/types.ts` — modify
  - **touches**: [types.ts]
  - **provides**: [secondaryDomains in WikiConfig]
  - **Logic**: Add `secondaryDomains: string[]` with default `[]`. Update DEFAULT_WIKI_CONFIG.
  - **Edge case**: Existing config without secondaryDomains → default to []

### Wave 2 — Context Budget
- **Task 2a**: Inject secondary domain indexes in L0
  - **File**: `packages/server/src/services/context-budget.ts` — modify
  - **touches**: [context-budget.ts]
  - **requires**: [secondaryDomains from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**:
    - In getWikiStartContext(): after loading primary domain, iterate secondaryDomains
    - For each secondary: call formatIndexForContext(domain) — index only, no core, no articles
    - Append to content with header: `\n\n## Wiki: <domain> (reference — query on-demand)\n<index>`
    - Budget: subtract secondary index tokens from wiki_l0 allocation (shared 3K budget)
    - If budget exhausted, skip remaining secondaries
  - **Edge cases**: Secondary domain doesn't exist (skip, log warning), primary fills entire budget (no room for secondaries)

### Wave 3 — Settings API + UI
- **Task 3a**: Expose secondaryDomains in settings API
  - **File**: `packages/server/src/routes/wiki.ts` — modify (or settings route if wiki config is there)
  - **touches**: [wiki.ts routes]
  - **depends_on**: [task-1a]
  - **Logic**: GET/PUT wiki config already returns WikiConfig — just ensure secondaryDomains is included. No new route needed.

- **Task 3b**: Add secondary domains picker in wiki settings UI
  - **File**: `packages/web/src/components/panels/wiki-panel.tsx` — modify
  - **touches**: [wiki-panel.tsx]
  - **depends_on**: [task-3a]
  - **Logic**: In wiki settings section, show multi-select of available domains (exclude primary). Toggle domains as secondary. Save via PUT config.

## Failure Scenarios
| When | Then | Error |
|------|------|-------|
| Secondary domain doesn't exist on disk | Skip silently | Log warning |
| Secondary domain has no _index.md | Skip silently | No content to inject |
| Budget exhausted by primary domain | No secondaries injected | Acceptable — primary takes priority |
| secondaryDomains config missing (upgrade) | Default to [] | Backward compat |
| Circular reference (domain A secondary of B, B secondary of A) | N/A — secondaries are L0 inject only | Not possible to loop |

## Rejection Criteria
- DO NOT load articles from secondary domains in L0 — index only
- DO NOT load _core.md from secondary domains — only primary gets core
- DO NOT create new budget source — share wiki_l0's 3K budget
- DO NOT change query route — any domain is already queryable by path param
- DO NOT auto-discover domains as secondary — explicit config only

## Cross-Phase Context
- **Assumes**: Phase 1 (confidence in index), Phase 2 (query archives), Phase 3 (stale flags)
- **Exports**: Complete living wiki system — agents can discover, query, flag, and grow knowledge across domains

## Acceptance Criteria
- [ ] WikiConfig has secondaryDomains field with default []
- [ ] L0 context includes secondary domain indexes when configured
- [ ] Secondary index respects budget (doesn't overflow wiki_l0 3K)
- [ ] Missing secondary domain handled gracefully (skip, no error)
- [ ] Settings UI allows picking secondary domains
- [ ] Agent can query any domain via existing /api/wiki/:domain/query
- [ ] `bun run check` passes in server + web packages

## Outcome Block
**What Was Planned**: Cross-domain index awareness — config, L0 injection of secondary indexes, settings UI.
**Immediate Next Action**: Add `secondaryDomains: string[]` to WikiConfig in `packages/server/src/wiki/types.ts`.
**How to Measure**:
| Check | Command |
|-------|---------|
| Types compile | `cd packages/server && bun run check` |
| Config persists | `curl localhost:3579/api/wiki -X PUT -d '{"secondaryDomains":["research"]}'` |
| L0 includes index | Start session, check system context for "Wiki: research" section |
