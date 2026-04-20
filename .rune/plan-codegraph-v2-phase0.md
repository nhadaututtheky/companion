# Phase 0: Telemetry Baseline

> ✅ **Shipped** in commit `97affcd feat(codegraph): v2 phase 0 — query telemetry + MCP tool + skill`.

## Goal

Log mọi CodeGraph query từ agent (type, input, hit count, token saved, latency) để làm chứng cứ quyết định các phase sau. Không có phase 0 = plan 1-3 là đoán mò.

## Tasks

- [x] Task 1 — schema: bảng `code_query_log` — `packages/server/src/db/schema.ts`
- [x] Task 2 — migration `0041_codegraph_telemetry.sql`
- [x] Task 3 — middleware: logger trong `query-engine.ts` + `agent-context-provider.ts` — `packages/server/src/codegraph/telemetry.ts`
- [x] Task 4 — rotation cap 10K rows/day/project
- [x] Task 5 — **MCP tool** `codegraph_telemetry_summary` registered in `packages/server/src/mcp/tools.ts`
- [x] Task 6 — **skill entry** `.claude/skills/codegraph-telemetry.md`
- [x] Task 7 — API route `GET /api/codegraph/telemetry/:projectSlug?range=Nd`
- [ ] Task 8 — *(optional, deferred)* dashboard UI tab — not blocking gate
- [x] Task 9 — tests: logger write/read/rotation + MCP shape

## Acceptance Criteria

- [ ] Agent gọi query bất kỳ → log row xuất hiện <100ms sau
- [ ] MCP tool `codegraph_telemetry_summary` callable từ Claude Code, trả JSON shape đúng schema
- [ ] Skill entry discoverable: `claude` CLI list skills → thấy `codegraph-telemetry`
- [ ] Log capture ≥90% agent queries (verify: manual trigger 20 queries, đếm log rows)
- [ ] Rotation chạy đúng: chèn 10001 rows → oldest bị xóa, count=10000
- [ ] Zero impact lên query latency (benchmark: before/after p50 diff <5%)
- [ ] Dashboard (nếu làm) load <1s với 10K rows

## Files Touched

- `packages/server/src/db/schema.ts` — modify (add table)
- `packages/server/src/db/migrations/00XX_codegraph_telemetry.sql` — new
- `packages/server/src/db/embedded-migrations.ts` — modify (regenerate per user feedback memory)
- `packages/server/src/codegraph/telemetry.ts` — new (~150 LOC)
- `packages/server/src/codegraph/query-engine.ts` — modify (inject logger)
- `packages/server/src/codegraph/agent-context-provider.ts` — modify (inject logger)
- `packages/server/src/routes/codegraph.ts` — modify (telemetry endpoint)
- `packages/server/src/mcp/codegraph-tools.ts` — modify (register `codegraph_telemetry_summary` tool)
- `.claude/skills/codegraph-telemetry.md` — new (skill entry, ~40 LOC)
- `packages/web/src/app/codegraph/telemetry.tsx` — new (OPTIONAL, ~200 LOC)
- `packages/web/src/lib/api/codegraph.ts` — modify (telemetry fetcher)

## Dependencies

- Requires: tree-sitter engine live (đã ship)
- Requires: existing CodeGraph query surface (stable)

## Gate to Next Phase

**Proceed to Phase 1 nếu**:
- Telemetry live ≥7 ngày
- ≥500 queries logged tổng cộng
- Data cho thấy ≥1 query type có hit-rate thấp hoặc latency cao → lý do business cho Phase 1/2/3

**Pause nếu**:
- <100 queries/week → agent chưa dùng CodeGraph đủ; ưu tiên UX surface graph trước khi build capability mới

## Out of Scope

- Cross-project telemetry aggregation
- Telemetry export to external (Posthog/Sentry)
- Cost tracking (embedding cost — Phase 3 lo)
