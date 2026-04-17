# Phase 0: Telemetry Baseline

## Goal

Log mọi CodeGraph query từ agent (type, input, hit count, token saved, latency) để làm chứng cứ quyết định các phase sau. Không có phase 0 = plan 1-3 là đoán mò.

## Tasks

- [ ] Task 1 — schema: bảng `code_query_log` (id, project_slug, query_type, query_text, result_count, tokens_returned, latency_ms, agent_source, created_at) — `packages/server/src/db/schema.ts`
- [ ] Task 2 — migration: `packages/server/src/db/migrations/00XX_codegraph_telemetry.sql`
- [ ] Task 3 — middleware: wrap tất cả query functions trong `query-engine.ts` + `agent-context-provider.ts` để log trước return — `packages/server/src/codegraph/telemetry.ts`
- [ ] Task 4 — sampling + cap: log tối đa 10K rows/day/project, oldest-first rotation (tránh SQLite bloat)
- [ ] Task 5 — **MCP tool** `codegraph_telemetry_summary` (primary): cho agent hỏi "hit rate 7d qua", "top query bị miss", "query nào slow". Return structured JSON. — `packages/server/src/mcp/codegraph-tools.ts`
- [ ] Task 6 — **skill entry** `.claude/skills/codegraph-telemetry.md`: doc cho Claude Code biết khi nào invoke tool trên (trigger: "phân tích hiệu quả codegraph", "query nào agent miss")
- [ ] Task 7 — API route `GET /api/codegraph/telemetry/:projectSlug?range=7d` — shared by MCP tool + optional dashboard
- [ ] Task 8 — *(optional)* dashboard UI tab trong CodeGraph page — chỉ làm nếu thời gian cho phép, không block gate — `packages/web/src/app/codegraph/telemetry.tsx`
- [ ] Task 9 — tests: 3 unit (logger write/read/rotation) + 1 integration (query → log row) + 1 MCP e2e (mock agent call tool → nhận response đúng shape)

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
