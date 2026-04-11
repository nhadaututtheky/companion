# Phase 1: Confidence Tiering + Article Metadata

## Goal
Add confidence classification to wiki articles so agents know how much to trust each piece of knowledge.

## Data Flow
```
[Compiler] → adds confidence tag to frontmatter → [writeArticle] → disk
[Manual edit] → user sets confidence via API → [writeArticle] → disk
[UI] → reads confidence from ArticleMeta → shows badge (green/yellow/red)
[Agent] → reads confidence in retrieval result → adjusts trust level
```

## Code Contracts
```typescript
// In types.ts — add to ArticleMeta
type ArticleConfidence = "extracted" | "inferred" | "ambiguous";

interface ArticleMeta {
  // ... existing fields ...
  confidence?: ArticleConfidence; // undefined = legacy (treat as "inferred")
  sourceUrl?: string; // optional link to original source
}
```

## Tasks

### Wave 1 — Types
- **Task 1a**: Add `ArticleConfidence` type and fields to `ArticleMeta`
  - **File**: `packages/server/src/wiki/types.ts` — modify
  - **touches**: [types.ts]
  - **provides**: [ArticleConfidence, updated ArticleMeta]
  - **Logic**: Add `confidence?: ArticleConfidence` and `sourceUrl?: string` to ArticleMeta interface. Add `ArticleConfidence` type export.
  - **Edge case**: Existing articles without confidence field → treat as "inferred" default

### Wave 2 — Store + Compiler
- **Task 2a**: Update store to read/write confidence in frontmatter
  - **File**: `packages/server/src/wiki/store.ts` — modify
  - **touches**: [store.ts]
  - **provides**: [confidence-aware readArticle, writeArticle]
  - **requires**: [ArticleConfidence from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: `writeArticle` includes `confidence` and `sourceUrl` in YAML frontmatter. `readArticle` parses them. Missing field → undefined (backward compat).

- **Task 2b**: Update compiler prompt to assign confidence
  - **File**: `packages/server/src/wiki/compiler.ts` — modify
  - **touches**: [compiler.ts]
  - **provides**: [confidence-tagged compiled articles]
  - **requires**: [ArticleConfidence from Wave 1]
  - **depends_on**: [task-1a]
  - **Logic**: Add instruction to compiler system prompt: "Tag each article with confidence: extracted (directly from source), inferred (your deduction), ambiguous (uncertain)". Parse confidence from `===ARTICLE_START===` block.

### Wave 3 — API + Retriever
- **Task 3a**: Include confidence in article API responses and retrieval results
  - **File**: `packages/server/src/routes/wiki.ts` — modify (no new routes, just ensure confidence passes through)
  - **File**: `packages/server/src/wiki/retriever.ts` — modify
  - **touches**: [wiki.ts routes, retriever.ts]
  - **provides**: [confidence in API responses, confidence in retrieval context]
  - **requires**: [confidence-aware readArticle from Wave 2]
  - **depends_on**: [task-2a]
  - **Logic**: retriever's `formatIndexForContext` includes confidence badge. PUT article endpoint accepts confidence field.

### Wave 4 — Web UI
- **Task 4a**: Show confidence badge in wiki panel article list and article view
  - **File**: `packages/web/src/components/panels/wiki-panel.tsx` — modify
  - **touches**: [wiki-panel.tsx]
  - **requires**: [confidence in API responses from Wave 3]
  - **depends_on**: [task-3a]
  - **Logic**: Badge next to article title: green "Extracted", yellow "Inferred", red "Ambiguous". In article detail view, show confidence + sourceUrl link.

## Failure Scenarios
| When | Then | Error |
|------|------|-------|
| Existing article has no confidence field | Treat as undefined, display as "—" | No error, backward compat |
| Compiler fails to tag confidence | Default to "inferred" | Log warning, don't fail compile |
| sourceUrl is malformed | Store as-is, UI renders as plain text | No validation needed (agent responsibility) |

## Rejection Criteria
- DO NOT make confidence a required field — must be backward compatible
- DO NOT add a migration — this is frontmatter metadata, not DB
- DO NOT add confidence to _core.md or _index.md — articles only
- DO NOT change the compiler output format markers (===ARTICLE_START===)

## Cross-Phase Context
- **Assumes**: Nothing — this is Phase 1
- **Exports**: `ArticleConfidence` type, confidence-aware store/retriever. Phase 2-4 will use these.

## Acceptance Criteria
- [ ] `ArticleConfidence` type exported from types.ts
- [ ] writeArticle persists confidence + sourceUrl in frontmatter
- [ ] readArticle parses confidence + sourceUrl from frontmatter
- [ ] Compiler assigns confidence to new articles
- [ ] Retrieval results include confidence field
- [ ] Wiki panel shows confidence badge on articles
- [ ] Existing articles without confidence still load correctly
- [ ] `bun run check` passes in server + web packages

## Outcome Block
**What Was Planned**: Confidence tiering on wiki articles — type, store, compiler, retriever, UI.
**Immediate Next Action**: Add `ArticleConfidence` type to `packages/server/src/wiki/types.ts`.
**How to Measure**:
| Check | Command |
|-------|---------|
| Types compile | `cd packages/server && bun run check` |
| Web compiles | `cd packages/web && bun run check` |
| Existing articles load | `curl http://localhost:3579/api/wiki/research/articles/graphify-patterns` |
