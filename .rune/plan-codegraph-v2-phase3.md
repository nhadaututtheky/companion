# Phase 3: Semantic Embedding Search

## Goal

Agent hỏi "tìm nơi xử lý thanh toán" → trả function `chargeCard()`, `processPayment()` dù không chứa keyword. Close semantic gap giữa ý định agent và tên symbol. Effort cao nhất — chỉ làm nếu Phase 0-2 đã chứng minh agent dùng CodeGraph thường xuyên.

## Tasks

- [ ] Task 1 — decide embedding source: local (`all-MiniLM-L6-v2` via ONNX, ~23MB, 384-dim) vs remote (OpenAI `text-embedding-3-small`, $0.02/1M tokens, 1536-dim). Default: **local ONNX** — offline, zero cost, đủ cho code search
- [ ] Task 2 — vector store: SQLite `sqlite-vec` extension (đã có ecosystem tốt) hoặc bảng blob + brute-force cosine cho ≤50K nodes. Ưu tiên `sqlite-vec` nếu bundled được với Bun runtime
- [ ] Task 3 — schema: bảng `code_embeddings` (node_id, embedding BLOB, model, dimensions, created_at, source_hash) — `packages/server/src/db/schema.ts`
- [ ] Task 4 — embedding input builder: compose text = `{symbolType} {symbolName}({signature}) — {description}` (tái dùng `semantic-describer.ts` output); fallback dùng `bodyPreview` nếu `description` null
- [ ] Task 5 — indexer pipeline: batch-embed undone nodes (100/batch), Haiku-tier queue priority, resume-able (persist queue state) — `packages/server/src/codegraph/embedding/indexer.ts`
- [ ] Task 6 — query API: `POST /api/codegraph/:slug/search` body `{query, topK, filters?}` → embed query → knn → return nodes + similarity — `packages/server/src/routes/codegraph.ts`
- [ ] Task 7 — hybrid ranking: weighted sum `score = 0.6 * semanticSim + 0.3 * graphPagerank + 0.1 * temporalRecency` (Phase 2 dependency) — configurable weights
- [ ] Task 8 — incremental reindex: hook vào Phase 1 watcher → node changed → mark embedding stale → re-embed async
- [ ] Task 9 — **MCP tool** `codegraph_semantic_search` (primary): agent hỏi natural language → top-K symbols + signature + path. Plus `codegraph_find_similar` (given node_id → cluster neighbors)
- [ ] Task 10 — **skill entry** `.claude/skills/codegraph-semantic.md`: trigger "tìm nơi xử lý", "code nào làm", "similar to X", "find function that does Y"
- [ ] Task 11 — cost/perf guardrails: max 10K nodes embedded/project (v1), warn khi approach limit; index đầy đủ cần <10 phút cho project 5K nodes
- [ ] Task 12 — *(optional)* web search box trên CodeGraph page — `packages/web/src/app/codegraph/semantic-search.tsx`
- [ ] Task 13 — tests: 5 unit + 2 integration + 1 MCP e2e (agent call semantic_search tool → assert top-1 matches expected node_id)

## Acceptance Criteria

- [ ] Corpus 1K nodes: index time <2 phút trên dev machine (M-series/i7)
- [ ] Query latency: <300ms p95 (embed query + knn + rank)
- [ ] Semantic quality: manual test set 20 intent→node pairs, top-3 hit rate ≥70%
- [ ] Hybrid ranking beat pure semantic: A/B 20 queries, user pick hybrid result ≥60%
- [ ] Storage: 384-dim float32 blob per node = ~1.5KB, 10K nodes ≈ 15MB — acceptable
- [ ] Watcher invalidation: đổi body function → embedding reindex <30s
- [ ] Graceful degrade: sqlite-vec load fail → fallback keyword search, not crash

## Files Touched

- `packages/server/src/codegraph/embedding/` — new dir
  - `indexer.ts` — new (~200 LOC)
  - `model-loader.ts` — new (~150 LOC, ONNX runtime init)
  - `vector-store.ts` — new (~180 LOC, sqlite-vec wrapper)
  - `query.ts` — new (~150 LOC)
- `packages/server/src/codegraph/ranking.ts` — new (~100 LOC, hybrid scorer)
- `packages/server/src/db/schema.ts` — modify (embedding table)
- `packages/server/src/db/migrations/00XX_codegraph_embedding.sql` — new
- `packages/server/src/db/embedded-migrations.ts` — regenerate
- `packages/server/src/routes/codegraph.ts` — modify (search endpoint)
- `packages/server/src/mcp/codegraph-tools.ts` — modify (register `codegraph_semantic_search` + `codegraph_find_similar`, primary)
- `.claude/skills/codegraph-semantic.md` — new (~40 LOC)
- `packages/web/src/app/codegraph/semantic-search.tsx` — new (OPTIONAL, ~200 LOC)
- `packages/web/src/components/codegraph/similarity-bar.tsx` — new (OPTIONAL, ~50 LOC)

## Dependencies

- Requires: Phase 0 telemetry (measure ROI)
- Requires: Phase 1 watcher (keep embeddings fresh)
- Recommended: Phase 2 temporal (hybrid rank 3rd component)
- Library: `onnxruntime-node` (~35MB binary) + embedding model file (~23MB)
- Library: `sqlite-vec` — verify compat với Bun's `bun:sqlite`. Fallback: pure-JS cosine brute-force (đủ cho <20K nodes)

## Gate / Decision

**Build nếu** (tất cả):
- Phase 2 gate đạt (temporal dùng ≥15% queries)
- Phase 0 telemetry: keyword search fail rate >25% (agent query 2+ lần cho cùng intent) → evidence semantic needed
- Infra budget OK (35MB binary + 23MB model trong Docker image chấp nhận được)

**Kill / permanent defer nếu**:
- Hit rate <10% sau 4 tuần → semantic không thêm value; agent đã effective với keyword+graph
- Install size issue (model bundled Docker >500MB total)
- Docker runtime ONNX perf yếu trên arm64 (user device đa dạng)

**Consider remote API nếu** (alt track):
- User deploy profile có budget API cost (>10 project) → switch `text-embedding-3-small`, cache aggressive, reindex on-demand only

## Out of Scope

- Multi-language embedding (tập trung TS/JS first)
- Fine-tuned code model (CodeBERT, StarEncoder) — v2 nếu cần
- Embedding file-level (chỉ symbol-level)
- Cross-project semantic search
