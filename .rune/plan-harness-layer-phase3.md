# Phase 3: Meta-tool `companion_ask`

## Goal

Một tool duy nhất agent gọi để hỏi repo bất kỳ câu nào. Server route
nội bộ: Wiki search + CodeGraph search + (optional) source file
peek → RTK compress → trả 1 unified answer kèm sources. Giống
Perplexity cho repo: agent không phải chọn tool nào, chỉ ask.

## Tasks

- [ ] Define orchestrator service — `packages/server/src/services/companion-ask.ts` (new)
  - Input: `{ question: string, scope?: "code" | "docs" | "both" (default), max_tokens?: number (default 2000) }`
  - Pipeline: parallel `wikiRetriever.search(q)` + `codegraphSearch(q)` (timeout 3s mỗi cái) → merge top-K → RTK compress → format answer
  - Output: `{ answer: string, sources: Array<{type, id, snippet, score}>, durationMs, layers: { wiki: boolean, codegraph: boolean, compressed: boolean } }`
- [ ] Source merger — `packages/server/src/services/companion-ask-merger.ts` (new): rerank wiki + codegraph snippets bằng score đơn giản (term frequency + recency), giữ top 8 trong budget
- [ ] Format answer — markdown template: 1 paragraph synthesis (extractive), bullet list sources với `[type:id]` link để agent fetch chi tiết
- [ ] MCP tool `companion_ask` — `packages/server/src/mcp/tools.ts` register; schema input/output match service
- [ ] Timeout budget — total 5s. Nếu wiki/codegraph timeout 1 layer, vẫn trả answer từ layer còn lại với note `partial: true`. Nếu cả 2 fail → throw structured error có `code: "no-sources"` agent biết fallback grep.
- [ ] Skill update — `.claude/skills/companion-ask.md` (new): triggers ["how does", "what is", "explain", "where is documented"]; tool: `companion_ask`. Lưu ý: trùng triggers Phase 1 — Phase 1 skills nên giảm priority hoặc retire khi `companion_ask` có (decision below).
- [ ] Decision skill priority — Phase 3 ship → set `companion-knowledge.md` priority thấp, ưu tiên `companion-ask.md`. Hoặc: retire Phase 1 starter skills và để `companion_ask` là default. Quyết: GIỮ cả hai, `companion_ask` priority 9, knowledge priority 6 — agent thử ask trước, fallback qua wiki search nếu cần raw doc.
- [ ] Unit tests: merger rerank đúng; format answer đúng schema; timeout 1 layer vẫn trả partial; both fail throws structured error
- [ ] Integration test: gọi `companion_ask` với câu hỏi thực ("how does session lifecycle work") → answer chứa snippet từ Wiki INV doc + CodeGraph reference đến `ws-session-lifecycle.ts`
- [ ] Smoke test latency: P95 < 3s với cache warm, < 5s cold

## Acceptance Criteria

- [ ] MCP `companion_ask` callable, trả structured answer
- [ ] Câu "how does session lifecycle work" trả answer có ít nhất 1 wiki source + 1 code source
- [ ] Wiki layer timeout (mock) → answer vẫn ship với `partial: true`
- [ ] Cả 2 layer fail → throw `no-sources` error code
- [ ] Answer length tôn trọng `max_tokens` (default 2K)
- [ ] Sources unique (không trùng id), tối đa 8 entries
- [ ] Skill `companion-ask.md` xuất hiện trong activation hints khi enabled
- [ ] 6+ unit tests, 2+ integration tests
- [ ] Không regression: `companion_wiki_*`, `companion_codegraph_*` vẫn callable độc lập

## Files Touched

### New
- `packages/server/src/services/companion-ask.ts`
- `packages/server/src/services/companion-ask-merger.ts`
- `packages/server/src/services/__tests__/companion-ask.test.ts`
- `packages/server/src/services/__tests__/companion-ask-merger.test.ts`
- `.claude/skills/companion-ask.md`

### Modified
- `packages/server/src/mcp/tools.ts` — register `companion_ask`
- `packages/server/src/services/skill-router.ts` (Phase 1) — accept new skill, priority sort

## Dependencies

- Phase 1 (skill router) ship trước để skill `companion-ask.md` được inject
- Phase 2 (RTK API) ship trước để compress kết quả merger
- Reuses Wiki retriever + CodeGraph search hiện có

## Design notes

**Pipeline timing** (target P95):
```
t=0     parallel start
t=2000  wiki + codegraph timeout boundary
t=2200  merger rerank (sync, ~200ms)
t=2700  RTK compress (~500ms)
t=3000  format + return
```

**Merger scoring** (đơn giản, không cần ML):
```
score = 0.6 * term_overlap + 0.3 * source_priority + 0.1 * recency_decay

source_priority:
  wiki/L0: 1.0
  wiki/L1-L3: 0.8
  codegraph/exact symbol: 0.9
  codegraph/neighbor: 0.6
```

**Partial answer format**:
```markdown
**Note**: CodeGraph search timed out; answer based on Wiki only.

Session lifecycle is orchestrated by `ws-session-lifecycle.ts`...

**Sources**:
- [wiki:invariants/session-lifecycle] — INV-1..INV-3
- [wiki:adr/session-resume]
```

**Why không AI-summarize** — extractive (snippet + paste) giữ
fidelity, agent có thể đọc raw source. AI summarize có nguy cơ
hallucinate. Khi nào RTK regex không đủ (Phase 5+) mới cân nhắc
LLM trên server side.

**Concurrency** — `Promise.allSettled` cho 2 layer, mỗi layer
có own timeout. Không cần queue/throttle ở v1.

## Out of scope (defer)

- LLM-based answer synthesis (extractive only v1)
- Conversational follow-up ("what about X?") — mỗi call standalone
- Re-ranking dùng embeddings — TF + priority đủ cho v1
- Caching answer per question hash — recompute mỗi lần (volatile data)
- Agent-side feedback loop ("answer was good/bad")
- Cross-project ask (chỉ scope project hiện tại)
- Phase 4 metrics persistence (Phase 4)

## Implementation deltas vs original plan (2026-05-03)

**Status**: ✅ SHIPPED. 16 unit tests pass. Typecheck clean. Lint 0
issues on new files. INV paths untouched.

**Deltas from original plan**:

1. **Rerank formula intentionally diverges** — plan said
   `0.6 * term_overlap + 0.3 * source_priority + 0.1 * recency_decay`.
   Implemented: `0.6 * src.score + 0.3 * TYPE_PRIORITY + 0.1 * overlapScore`.
   Reason: layer-local `src.score` (wiki's title/tag/content scoring,
   codegraph's term-position-and-exact-match heuristic) carries far more
   signal than naive substring overlap. Recency decay deferred — wiki
   articles + code symbols rarely have meaningful "recency" within a
   single query window.

2. **Skill priority matrix** — plan said `companion-ask=9, knowledge=6`.
   Implemented `ask=9, impact=8, knowledge=7, explore=6`. One-step drift;
   functional ordering preserved.

3. **No `cwd` in public REST body** — adversary W4 caught this as a
   filesystem probe vector. Server-side default (project's wiki dir)
   used implicitly by retriever.

## Adversary review fixes applied

- **B2 mitigation** CodeGraph hot path: `MIN_CODEGRAPH_TERM_LEN=4`
  filters out 3-char terms (`set`, `get`, `use`) that would full-scan
  the project; also reduced `MAX_CODEGRAPH_TERMS` from 4 → 2 (each is
  a sequential `LIKE '%term%'`). Adding a proper FTS5 index deferred
  to Phase 4 hardening if metrics show LIKE scans dominate.
- **W1** Snippet/title sanitisation in `formatAnswer`: code fences
  replaced with visually-similar inert chars, leading heading markers
  stripped, body capped at 240 chars. Title strips backticks/brackets,
  capped 120 chars.
- **W2** `wikiOk`/`codeOk` now explicitly gated on `wantWiki`/`wantCode`
  so audit-time grep sees the contract clearly.
- **W4** `cwd` removed from public POST body — was a filesystem probe
  vector. Server resolves wiki root from projectSlug.
- **W5** `project_slug` + `wiki_domain` validated against
  `^[a-z0-9][a-z0-9_-]{0,127}$/i` at the route boundary.

## Adversary findings deferred

- **B1** Rerank formula divergence — documented as intentional
  delta above; reread + add formal ADR in Phase 4 if metrics show
  ranking quality issues.
- **B2 full** FTS5 / better index for `code_nodes.symbol_name` —
  Phase 4 hardening.
- **W3** Asymmetric all-failed semantics — wiki layer has no equivalent
  guard. Documented but not changed; current behaviour is "any throw =
  layer fails entirely" which matches sync wiki retriever.
- **I1** Skill priority drift — functional behaviour preserved.
- **I2** Non-English question test — extractTerms strips non-ASCII;
  layer degrades to wiki-only. Add explicit test in Phase 4 hardening.
- **I4** `DEFAULT_TIMEOUT_MS` is unused (no top-level race) — rename
  or wire in Phase 4.
