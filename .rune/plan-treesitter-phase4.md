# Phase 4: Advanced Analysis (Re-exports, Scope, Semantic Search)

## Goal
Close remaining gaps vs GitNexus: re-export chain tracking, scope-aware name resolution, and improved search. These are quality-of-life improvements that build on the Tree-sitter foundation from P1-P3.

## Pre-requisites
- Phase 1-3 complete

## Tasks

### 4A: Re-export Chain Tracking
- [ ] Detect re-export patterns in TypeScript extractor:
  - `export { foo } from "./util"` → create edge with `isReExport: true` context
  - `export { foo as bar } from "./util"` → track alias mapping
  - `export * from "./util"` → barrel export, create wildcard edge
  - `export default foo` where `foo` is imported → re-export chain
- [ ] Apply trust discount for re-exports: `calculateTrustWeight("imports", { isReExport: true })` → weight × 0.7
  - Already implemented in `trust-calculator.ts` line 48 — just need to pass context
- [ ] Resolve transitive re-exports in edge resolution:
  - If A imports from B, and B re-exports from C → create transitive edge A→C with compound trust
  - Limit chain depth to 3 (prevent barrel-of-barrels explosion)
- [ ] Update `diff-updater.ts` to pass `isReExport` context to `calculateTrustWeight()`

### 4B: Scope-Aware Name Resolution
- [ ] Track import aliases in extractors:
  - `import { foo as bar }` → store both `bar` (local) and `foo` (original) in edge
  - When resolving call edges: match `bar()` call → resolve to `foo` in target file
- [ ] Distinguish local vs imported symbols in call extraction:
  - Before creating a `calls` edge, check if callee is in importMap
  - If not in importMap AND not in local scope → skip (it's a global/built-in)
  - If in local scope (defined in same file) → skip (intra-file call, not a cross-file edge)
- [ ] Handle destructured imports:
  - `const { method } = importedObject` → track `method` as alias for `importedObject.method`
  - This is hard to do perfectly — implement best-effort for common patterns

### 4C: Improved Search (query-engine)
- [ ] Replace LIKE substring search with weighted ranking:
  - Exact match on symbolName → score 1.0
  - Prefix match → score 0.8
  - Contains match → score 0.5
  - Description match → score 0.3
  - Sort by: (relevance_score × export_bonus × edge_count_bonus)
- [ ] Add file-scoped search: `getRelatedNodes(projectSlug, keywords, { filePath: "..." })`
  - Useful for agent-context-provider when user mentions a specific file
- [ ] Add type-filtered search: `getRelatedNodes(projectSlug, keywords, { symbolType: "function" })`

### 4D: Grammar Auto-Download (Developer Experience)
- [ ] Create `packages/server/src/codegraph/grammar-loader.ts`:
  - On first scan attempt for a language, check if WASM exists in grammars/
  - If missing, download from npm registry or bundled package
  - Cache grammar files persistently (not re-downloaded on restart)
  - Show progress in scan job status
- [ ] Add grammar status to codegraph API:
  - `GET /api/codegraph/:slug/grammars` → list loaded + available grammars
  - Web UI can show which languages have Tree-sitter support active
- [ ] Fallback gracefully: if download fails, use regex scanner (Phase 1 fallback path)

## Acceptance Criteria
- [ ] Re-export chains resolved correctly (A→B→C where B re-exports from C)
- [ ] Import aliases tracked: `import { foo as bar }` → call `bar()` → edge to `foo`
- [ ] Search returns ranked results, not just LIKE matches
- [ ] Grammars auto-download on first use (no manual setup)
- [ ] TypeScript compiles clean
- [ ] All existing tests/functionality still works

## Files Touched
- `packages/server/src/codegraph/ts-extractors.ts` — modify (re-exports, aliases, scope)
- `packages/server/src/codegraph/query-engine.ts` — modify (weighted search)
- `packages/server/src/codegraph/diff-updater.ts` — modify (re-export context)
- `packages/server/src/codegraph/grammar-loader.ts` — new (auto-download)
- `packages/server/src/routes/codegraph.ts` — modify (grammar status endpoint)

## Dependencies
- Phase 1-3 all complete
- This phase is OPTIONAL for GitNexus parity — P1+P2 alone match 90% of their capability
- P4 is quality polish that moves from "parity" to "better than"
