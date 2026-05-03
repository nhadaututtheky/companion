# Phase 2: RTK MCP Exposure + Auto-Chain

## Goal

Đưa RTK ra khỏi silo: expose `companion_compress` MCP tool cho agent
gọi explicit, đồng thời auto-chain compress kết quả Wiki/CodeGraph
khi vượt 4K tokens trước khi trả agent. Mục tiêu: giảm context
bloat khi agent dùng harness, để mỗi tool call cost ít token hơn.

## Tasks

- [ ] Audit RTK pipeline — `packages/server/src/rtk/pipeline.ts`: xác định export hàm nào (compress, summarize, fold) và signature ổn định không
- [ ] Wrap RTK thành 2 hàm public: `compressText(text, budgetTokens)` và `compressStructured(items, budgetTokens)` — `packages/server/src/rtk/api.ts` (new)
- [ ] Thêm MCP tool `companion_compress` — `packages/server/src/mcp/tools.ts`: input `{ text: string, budget_tokens: number (default 2000), mode?: "summary" | "fold" }`, output `{ compressed: string, original_tokens: number, compressed_tokens: number, ratio: number }`
- [ ] Auto-chain layer — `packages/server/src/mcp/auto-chain.ts` (new): wrapper bao quanh tool dispatch. Nếu output > AUTO_CHAIN_THRESHOLD (default 4K tokens), gọi RTK compress trước khi trả. Append meta `_compressed: true`. Tools trong scope: `companion_wiki_search`, `companion_wiki_read`, `companion_codegraph_impact`, `companion_codegraph_search`, `companion_codegraph_neighbors`. Tool `companion_compress` chính nó skip để tránh đệ quy.
- [ ] Settings flag — extend `packages/shared/src/types/settings.ts` (hoặc nơi RTK settings hiện ở): `harness.autoCompressThreshold` (default 4000), `harness.autoCompressEnabled` (default true)
- [ ] REST endpoint — `packages/server/src/routes/rtk.ts` (extend nếu có, new nếu chưa): `GET /api/harness/rtk-settings`, `POST /api/harness/rtk-settings`
- [ ] Web UI — `packages/web/src/components/settings/rtk-settings.tsx` (extend) thêm 2 control: toggle auto-compress + slider threshold (1K→16K)
- [ ] Telemetry hook — mỗi auto-compress emit event `{ tool, original_tokens, compressed_tokens, ratio, durationMs }` (sẽ ghi file ở Phase 4; phase này chỉ ra event qua console.debug + EventEmitter)
- [ ] Unit tests: `compressText` đảm bảo output ≤ budget; auto-chain skip nếu < threshold; auto-chain skip cho `companion_compress` tool itself; ratio đúng
- [ ] Integration test: gọi `companion_wiki_search` với fake big result → output bị compress, marker `_compressed: true` xuất hiện

## Acceptance Criteria

- [ ] MCP `companion_compress` callable từ agent (test với mock big text, returns compressed ≤ budget)
- [ ] Wiki search trả result > 4K tokens → tự compress, agent nhận ≤ 4K kèm `_compressed: true`
- [ ] CodeGraph impact result > 4K tokens → tự compress
- [ ] Auto-compress disabled qua settings → output raw không compress
- [ ] `companion_compress` tự gọi không infinite loop (skip-self verified)
- [ ] Threshold slider điều chỉnh được, persist qua reload
- [ ] 5+ unit tests cho RTK API + auto-chain logic
- [ ] 2+ integration test phủ wiki + codegraph paths
- [ ] Không regression: tool nhỏ < threshold trả y nguyên

## Files Touched

### New
- `packages/server/src/rtk/api.ts`
- `packages/server/src/rtk/__tests__/api.test.ts`
- `packages/server/src/mcp/auto-chain.ts`
- `packages/server/src/mcp/__tests__/auto-chain.test.ts`

### Modified
- `packages/server/src/mcp/tools.ts` — register `companion_compress`, wrap dispatch với auto-chain
- `packages/shared/src/types/settings.ts` (hoặc tương đương) — `harness.autoCompress*` fields
- `packages/server/src/routes/rtk.ts` (hoặc tạo nếu chưa) — settings endpoints
- `packages/web/src/components/settings/rtk-settings.tsx` — toggle + slider
- `packages/web/src/lib/api/rtk.ts` (hoặc tương đương) — API client

## Dependencies

- Phase 1 không bắt buộc, nhưng có Phase 1 thì agent biết khi nào gọi `companion_compress` (skill rule trỏ tới)
- Reuses `packages/server/src/rtk/pipeline.ts` core compression
- Reuses MCP tool registration pipeline

## Design notes

**Auto-chain wrapper pattern**:
```typescript
async function dispatchWithAutoChain(toolName: string, args: unknown) {
  const result = await rawDispatch(toolName, args);
  if (toolName === "companion_compress") return result; // skip self
  if (!settings.harness.autoCompressEnabled) return result;
  const tokens = estimateTokens(result);
  if (tokens <= settings.harness.autoCompressThreshold) return result;
  const compressed = await rtk.compressStructured(result, settings.harness.autoCompressThreshold);
  return { ...compressed, _compressed: true, _original_tokens: tokens };
}
```

**Token estimation** — dùng heuristic 4 chars ≈ 1 token để tránh
gọi tokenizer thật cho mỗi result (overhead). Sai số chấp nhận
được vì chỉ làm threshold check.

**Compress mode**:
- `summary` (default cho wiki) — extractive summarization
- `fold` (default cho codegraph) — hide section nội dung lớn,
  giữ skeleton với ID để agent fetch lại nếu cần

**Concurrent safety** — RTK pipeline đã in-memory, no shared
state với session lifecycle. Không cần lock.

## Out of scope (defer)

- AI-based compression (LLM summary) — Phase 5+ nếu RTK regex không đủ
- Per-tool threshold override — global threshold đủ cho v1
- Compress streaming / partial — chỉ buffered output
- Cross-session cache compress result — recompute mỗi lần
- Meta-tool `companion_ask` (Phase 3)
- Metrics persistence (Phase 4)

## Implementation deltas vs original plan (2026-05-03)

**Status**: ✅ SHIPPED. 12 unit tests pass on rtk/api.test.ts (29 RTK
total inc. existing). Typecheck clean. Lint 0 issues on new files.
INV paths untouched.

**Deltas from original plan**:

1. **`compressStructured` not implemented** — only `compressText`.
   Agents JSON.stringify objects before calling. Document in
   `companion_compress` description (currently says "free-form text").

2. **`mode: "summary" | "fold"` skipped** — RTK pipeline strategies
   pick mode internally based on toolName + content shape. Agent has
   no override. Acceptable for v1.

3. **Auto-chain scope: 5 tools (not 6)** — plan listed
   `companion_codegraph_search` and `_neighbors` which don't exist.
   Wrapped: wiki_search, wiki_read, wiki_note, codegraph_impact, explain.

4. **Sentinel verbatim path** — when pipeline produces no compression
   (text under threshold or strategies all skipped), tools-agent emits
   `<!-- companion-rtk: N tokens, no compression needed -->` instead
   of misleading "100% via none" marker.

## Adversary review fixes applied

- **B1** Cache poisoning fixed: `compressText` no longer defaults to
  shared sessionId `"harness-compress"` — passes empty string, which
  bypasses RTK's per-session cache. Cross-session cache leak prevented.
- **B2** Misleading marker fixed: when no strategies fire OR compressed
  ≥ original tokens, auto-chain returns raw payload (no marker added);
  `companion_compress` direct call switches marker to "verbatim" form.
- **W4** Multi-content guard: auto-chain skips compression when
  `result.content.length !== 1` or first part isn't text — preserves
  structure for future tools that emit multiple parts.
- **W5** Compress tool error leak fixed: response is generic
  `"Compression failed (see server logs)"`; raw error written to
  stderr only (server-side).
- **W6** Auto-chain failure now writes to `process.stderr` (was silent
  catch). Phase 4 metrics will replace with structured emit.
- **W2** Hard-truncate suffix length extracted to `TRUNCATION_SUFFIX`
  constant; slice math reserves room so final tokens ≤ budgetTokens.

## Adversary findings deferred to Phase 4 / hardening

- **W3** Stale auto-chain config in MCP process (≤ session lifetime).
  UI hint "changes apply to new agent sessions" — Phase 1.5 polish.
- **W7** Verify Hono request logger doesn't capture body of
  `/api/rtk/compress` — quick audit deferred.
- **I3** Routes test for POST /api/rtk/compress + auto-compress-config
  — Phase 4 alongside metrics endpoints.
- **I4** Starter skill `companion-compress.md` — phase 4 once metrics
  show whether agents actually call manually vs auto-chain handles.
- **I5** UX: char preview next to threshold slider.
- **I6** UX: success toast on persist (currently only error).
