# Phase 1: FTS5 Full-Text Search

## Goal
Add SQLite FTS5 virtual table for code_nodes, enabling full-text search with porter stemming. Upgrade existing /codegraph/search endpoint to use FTS5 instead of basic LIKE.

## Tasks
- [ ] Add SQL migration to create nodes_fts virtual table
- [ ] Regenerate embedded-migrations.ts
- [ ] Add FTS sync functions in graph-store.ts (populate, update, delete)
- [ ] Hook FTS sync into scan pipeline (after node insert, on node delete)
- [ ] Upgrade search route to use FTS5 with ranking
- [ ] Test with real project scan

## Acceptance Criteria
- [ ] FTS5 table created on first run via migration
- [ ] Search returns ranked results with snippet highlights
- [ ] FTS table stays in sync with code_nodes (insert/delete)
- [ ] Existing search behavior preserved (backward compatible)
- [ ] TypeScript compiles clean

## Files to Create
- `packages/server/src/db/migrations/XXXX_fts5_search.sql`

## Files to Modify
- `packages/server/src/codegraph/graph-store.ts` — FTS sync functions
- `packages/server/src/codegraph/index.ts` — hook FTS into scan
- `packages/server/src/routes/codegraph.ts` — upgrade search endpoint
- `packages/server/src/db/embedded-migrations.ts` — regenerate
