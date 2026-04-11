# Phase 2: Self-Archiving Queries

## Goal
Agent wiki queries auto-save as raw material so the knowledge base grows from its own usage.

## Data Flow
```
[Agent] → POST /api/wiki/:domain/query { query, mode }
  → retriever.retrieve() → results
  → archiveQuery(domain, query, results) [fire-and-forget]
  → response to agent

[archiveQuery]
  → deduplicate (skip if same query in last 24h)
  → write raw/query-<timestamp>.md with Q&A content
  → next compile cycle ingests it as raw material
```

## Code Contracts
```typescript
// New function in retriever.ts or new file wiki/query-archive.ts
function archiveQuery(
  domain: string,
  query: string,
  results: RetrievalResult,
  cwd?: string,
): void; // fire-and-forget, never throws

// Raw file format:
// ---
// source: agent-query
// query: "<original query>"
// archived_at: 2026-04-12T00:00:00Z
// articles_matched: ["slug1", "slug2"]
// ---
// ## Query: <query>
// ## Results: <summary of matched articles>
```

## Tasks

### Wave 1 — Archive Function
- **Task 1a**: Create query archive utility
  - **File**: `packages/server/src/wiki/query-archive.ts` — new
  - **touches**: [query-archive.ts]
  - **provides**: [archiveQuery function]
  - **Logic**:
    - Accept domain, query, results
    - Dedup check: read raw/ files, skip if same query string exists with archived_at < 24h ago
    - Write `raw/query-<YYYY-MM-DD-HHmmss>.md` with frontmatter + Q&A content
    - Wrap in try/catch — fire-and-forget, log errors, never throw
    - Limit: max 50 query archives per domain (delete oldest if exceeded)
  - **Edge cases**: Empty results (still archive — "no results" is knowledge), raw/ dir doesn't exist (create it)

### Wave 2 — Wire into Query Route
- **Task 2a**: Call archiveQuery after successful retrieval
  - **File**: `packages/server/src/routes/wiki.ts` — modify
  - **touches**: [wiki.ts routes]
  - **requires**: [archiveQuery from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: In POST `/:domain/query` handler, after retrieve() returns, call `archiveQuery(domain, query, result)` without awaiting. Only archive mode="retrieve" queries (not "search" — too noisy).

### Wave 3 — Compiler Awareness
- **Task 3a**: Update compiler to handle query archives as input
  - **File**: `packages/server/src/wiki/compiler.ts` — modify
  - **touches**: [compiler.ts]
  - **depends_on**: [task-1a]
  - **Logic**: Add note to compiler system prompt: "Files prefixed with 'query-' are agent queries. Extract recurring themes or knowledge gaps. If a query has no results, consider creating an article to fill that gap." No code change to parsing — query archives are standard raw .md files.

## Failure Scenarios
| When | Then | Error |
|------|------|-------|
| raw/ directory doesn't exist | Create it before writing | mkdirSync recursive |
| Disk full / write fails | Log warning, return silently | Never crash the query response |
| Same query within 24h | Skip archive, return | Dedup prevents spam |
| 50+ query archives exist | Delete oldest before writing | FIFO rotation |
| Query is empty string | Skip archive | Guard at entry |

## Rejection Criteria
- DO NOT await archiveQuery — it must be fire-and-forget
- DO NOT archive "search" mode queries — only "retrieve" (search is exploratory, noisy)
- DO NOT store full article content in archive — only slugs + snippets (save disk)
- DO NOT block query response on archive failure
- DO NOT add new API endpoints — archiving is internal

## Cross-Phase Context
- **Assumes**: Phase 1 done — ArticleConfidence type exists, confidence in retrieval results
- **Exports**: Query archives in raw/ folder — Phase 3 linter can check "uncompiled queries"

## Acceptance Criteria
- [ ] POST /api/wiki/:domain/query (mode=retrieve) creates raw/query-*.md
- [ ] Duplicate query within 24h is skipped
- [ ] Max 50 query archives per domain (oldest rotated)
- [ ] Query response time not affected (fire-and-forget)
- [ ] Compiler prompt updated to handle query archive files
- [ ] `bun run check` passes

## Outcome Block
**What Was Planned**: Self-archiving query mechanism — archive function, route wiring, compiler awareness.
**Immediate Next Action**: Create `packages/server/src/wiki/query-archive.ts` with archiveQuery function.
**How to Measure**:
| Check | Command |
|-------|---------|
| Types compile | `cd packages/server && bun run check` |
| Archive created | `curl -X POST localhost:3579/api/wiki/research/query -d '{"query":"graphify","mode":"retrieve"}' && ls wiki/research/raw/query-*` |
