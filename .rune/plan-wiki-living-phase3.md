# Phase 3: Needs-Update Flag

## Goal
Agents can mark articles as stale during use. Enhanced linter detects flags. Compile cycle clears them.

## Data Flow
```
[Agent uses article] → detects outdated info
  → POST /api/wiki/:domain/flag-stale/:slug { reason? }
  → write marker to wiki/<domain>/needs_update.json
  → returns 200

[Linter] → GET /api/wiki/:domain/lint
  → reads needs_update.json
  → adds "flagged-stale" issues to LintResult
  → UI shows stale warnings

[Compile] → POST /api/wiki/:domain/compile
  → after success, clear entries from needs_update.json for recompiled articles
```

## Code Contracts
```typescript
// needs_update.json format
interface NeedsUpdateEntry {
  slug: string;
  reason?: string;
  flaggedAt: string; // ISO timestamp
  flaggedBy: string; // "agent" | "user" | "linter"
}

// New store functions
function flagStale(domain: string, slug: string, reason?: string, flaggedBy?: string, cwd?: string): void;
function getFlaggedArticles(domain: string, cwd?: string): NeedsUpdateEntry[];
function clearFlags(domain: string, slugs: string[], cwd?: string): void;

// New route
// POST /api/wiki/:domain/flag-stale/:slug { reason?: string }
// GET /api/wiki/:domain/flags → NeedsUpdateEntry[]
```

## Tasks

### Wave 1 — Store Functions
- **Task 1a**: Add flag-stale functions to store
  - **File**: `packages/server/src/wiki/store.ts` — modify
  - **touches**: [store.ts]
  - **provides**: [flagStale, getFlaggedArticles, clearFlags]
  - **Logic**:
    - `flagStale`: Read needs_update.json (create if missing), append entry, deduplicate by slug (update if exists), write back
    - `getFlaggedArticles`: Read and parse needs_update.json, return entries
    - `clearFlags`: Remove entries matching slugs, write back (delete file if empty)
  - **Edge cases**: File doesn't exist (return []), article slug doesn't exist (still flag — agent might know better), concurrent writes (read-modify-write is fine for single-process)

### Wave 2 — API Routes + Linter + Compiler
- **Task 2a**: Add flag-stale and list-flags routes
  - **File**: `packages/server/src/routes/wiki.ts` — modify
  - **touches**: [wiki.ts routes]
  - **requires**: [flagStale, getFlaggedArticles from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: POST `/:domain/flag-stale/:slug` calls flagStale(). GET `/:domain/flags` calls getFlaggedArticles().

- **Task 2b**: Add "flagged-stale" lint check
  - **File**: `packages/server/src/wiki/linter.ts` — modify
  - **touches**: [linter.ts]
  - **requires**: [getFlaggedArticles from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: In lintDomain(), read flagged articles, add LintIssue with code "flagged-stale", severity "warning", include reason.

- **Task 2c**: Clear flags after compile
  - **File**: `packages/server/src/wiki/compiler.ts` — modify
  - **touches**: [compiler.ts]
  - **requires**: [clearFlags from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: After compileWiki() succeeds, call clearFlags(domain, articlesWritten.map(a => a.slug)).

### Wave 3 — UI
- **Task 3a**: Show stale warnings in wiki panel
  - **File**: `packages/web/src/components/panels/wiki-panel.tsx` — modify
  - **File**: `packages/web/src/lib/api-client.ts` — modify
  - **touches**: [wiki-panel.tsx, api-client.ts]
  - **depends_on**: [task-2a]
  - **Logic**: Fetch flags via GET /:domain/flags. Show orange "Stale" badge on flagged articles in list. Show banner with reason in article detail view.

## Failure Scenarios
| When | Then | Error |
|------|------|-------|
| needs_update.json doesn't exist | Create empty array | No error |
| needs_update.json is corrupted | Reset to empty array | Log warning |
| Flag article that doesn't exist | Store flag anyway | Agent might flag before article recompile |
| Concurrent flag + compile | Last writer wins | Acceptable at single-process scale |
| clearFlags called with empty array | No-op | Skip write |

## Rejection Criteria
- DO NOT use a database table for flags — filesystem JSON is sufficient
- DO NOT auto-recompile on flag — compile is manual/scheduled
- DO NOT validate slug exists before flagging — trust agent judgment
- DO NOT add per-article flag files — one needs_update.json per domain

## Cross-Phase Context
- **Assumes**: Phase 1 (confidence types), Phase 2 (query archives exist in raw/)
- **Exports**: Flag mechanism used by agents. Phase 4 cross-domain can also flag articles in other domains.

## Acceptance Criteria
- [ ] POST /api/wiki/:domain/flag-stale/:slug creates/updates needs_update.json
- [ ] GET /api/wiki/:domain/flags returns flagged articles
- [ ] Linter includes "flagged-stale" issues
- [ ] Compile clears flags for recompiled articles
- [ ] Wiki panel shows stale badges
- [ ] `bun run check` passes in server + web packages

## Outcome Block
**What Was Planned**: Needs-update flag system — store functions, API routes, linter integration, compiler clear, UI badges.
**Immediate Next Action**: Add flagStale/getFlaggedArticles/clearFlags to `packages/server/src/wiki/store.ts`.
**How to Measure**:
| Check | Command |
|-------|---------|
| Types compile | `cd packages/server && bun run check` |
| Flag works | `curl -X POST localhost:3579/api/wiki/research/flag-stale/graphify-patterns` |
| Lint shows flag | `curl localhost:3579/api/wiki/research/lint` |
