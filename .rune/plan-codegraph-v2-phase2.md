# Phase 2: Temporal Query — "Ai đổi X gần đây"

## Goal

Cho agent hỏi: "function này thay đổi gần đây không, ai đổi, commit nào" → join `git blame` + `git log --follow` vào graph query. Quick win rẻ: reuse git CLI sẵn có, không model ML, không embedding.

## Tasks

- [ ] Task 1 — temporal service: wrap `git log --follow --pretty=format:%H|%an|%at|%s -- <file>` trả array `{sha, author, timestamp, subject}` — `packages/server/src/codegraph/temporal.ts`
- [ ] Task 2 — blame service: `git blame --line-porcelain -L <start>,<end> <file>` → parse per-line author+timestamp → aggregate top-3 authors, last-touched timestamp — cùng file temporal.ts
- [ ] Task 3 — cache layer: LRU cache (500 entries, 10min TTL) cho blame result per `(file, lineStart, lineEnd, headSha)` — invalidate khi head đổi
- [ ] Task 4 — query API extension: add query params vào existing CodeGraph query endpoints:
  - `?changedSince=7d` (filter nodes có commit trong 7d)
  - `?author=@me` hoặc `?author=nhadaututtheky` (filter theo author)
  - `?includeTemporal=true` (attach `{lastTouchedAt, topAuthors, recentCommits}` vào mỗi node response)
- [ ] Task 5 — impact query: mở rộng `impact-analyzer.ts` — "ai đã đổi caller của X trong 30d qua" → list file + author + sha
- [ ] Task 6 — **MCP tool** `codegraph_temporal_query` (primary): agent hỏi "ai đổi function này", "changes last 7d", "my recent edits" — `packages/server/src/mcp/codegraph-tools.ts`
- [ ] Task 7 — **skill entry** `.claude/skills/codegraph-temporal.md`: trigger "gần đây", "ai sửa", "recent activity", "changed since"
- [ ] Task 8 — *(optional)* Node detail panel "Recent Activity" section — `packages/web/src/app/codegraph/node-detail.tsx`
- [ ] Task 9 — tests: 4 unit (git log parse, blame parse, cache hit/miss, author filter) + 1 integration (scan repo → query `changedSince=1d` → trả đúng nodes trong commit gần nhất) + 1 MCP e2e

## Acceptance Criteria

- [ ] `changedSince` filter chính xác: seed commit trên 3 files → query 1d → chỉ 3 files đó
- [ ] Blame cache hit rate >80% sau warmup 50 queries (verify via Phase 0 telemetry)
- [ ] Latency: query có temporal join <200ms p95 (git log cached), <1s cold
- [ ] Non-git project → graceful fallback (`temporal: null`, no error)
- [ ] Author resolver `@me` đọc `git config user.name` hoặc `user.email`
- [ ] UI section "Recent Activity" render đúng relative time ("2 days ago"), link commit về GitHub nếu origin có

## Files Touched

- `packages/server/src/codegraph/temporal.ts` — new (~220 LOC)
- `packages/server/src/codegraph/query-engine.ts` — modify (wire temporal params)
- `packages/server/src/codegraph/impact-analyzer.ts` — modify (author-scoped impact)
- `packages/server/src/mcp/codegraph-tools.ts` — modify (register `codegraph_temporal_query`, primary)
- `.claude/skills/codegraph-temporal.md` — new (~40 LOC)
- `packages/web/src/app/codegraph/node-detail.tsx` — modify (OPTIONAL, ~50 LOC added)
- `packages/web/src/components/codegraph/recent-activity.tsx` — new (OPTIONAL, ~100 LOC)
- `packages/web/src/lib/api/codegraph.ts` — modify (type updates)

## Dependencies

- Requires: Phase 1 ship (watcher đảm bảo file hash đúng → blame map chính xác sang node)
- Requires: `git` CLI available in host (Docker image đã có)
- Optional: `simple-git` lib cho parse an toàn; hoặc dùng `execSync` + regex (ưu tiên vì tránh thêm dep)

## Gate to Next Phase

**Proceed to Phase 3 nếu** (đo sau 2 tuần):
- ≥15% queries dùng temporal filter → feature có demand
- User feedback: temporal trả kết quả đúng, giúp decide trước khi refactor
- Latency acceptance đạt

**Kill / roll back nếu**:
- <5% queries dùng → feature không resonate, gỡ UI + giữ API như dormant
- Telemetry cho thấy agent không prompt về "recent" / "who changed" → assumption sai, skip Phase 3 cho đến khi có signal mới

**Defer Phase 3 bất kể nếu**:
- Infra budget hạn chế (embedding model + vector store là commitment lâu dài)
- Team nhỏ, ưu tiên polish v2 Phase 1+2 trước

## Out of Scope

- PR-level integration (link node → PR chứa edit)
- Blame tại runtime của 3rd-party submodule
- Authorship heuristics (refactor rename attribution)
