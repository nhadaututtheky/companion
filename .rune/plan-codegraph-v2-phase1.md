# Phase 1: Real-Time Diff Tracking

## Goal

Giữ CodeGraph luôn fresh (<5min lag) bằng file watcher + incremental re-parse, thay vì chỉ rely vào manual/git-diff batch. Đây là correctness foundation — stale graph = agent bullshit.

## Tasks

- [ ] Task 1 — watcher service: `chokidar`-based file watcher trên project root, filter theo `language` registry, debounce 500ms per file — `packages/server/src/codegraph/watcher.ts`
- [ ] Task 2 — incremental update pipeline: reuse `scanFileAsync()` cho 1 file, apply `upsertFile` + `deleteNodesForFile` + `insertNodes` + edge recalc chỉ cho file changed — tích hợp vào watcher
- [ ] Task 3 — cross-file edge refresh: khi file A đổi, find files import A → re-resolve edges trong các file đó (dùng `getReverseDependentFileIds` sẵn có trong `diff-updater.ts`)
- [ ] Task 4 — mutex/lock: reuse `rescanLocks` từ `diff-updater.ts` — tránh watcher trigger khi manual diff đang chạy
- [ ] Task 5 — config flag: `codegraph.realtimeWatcher` trong settings (default off), opt-in per project — `packages/server/src/config/schema.ts`
- [ ] Task 6 — lifecycle: watcher start on project load, stop on project close — hook vào project store
- [ ] Task 7 — resource guards: max concurrent re-parses (3), backpressure khi queue >50 files (fallback: batch mode)
- [ ] Task 8 — staleness metric: `GET /api/codegraph/:slug/freshness` trả `{lastIndexAt, pendingFiles, p95StaleMs}`
- [ ] Task 9 — **MCP tool** `codegraph_freshness_check` (primary): agent tự verify graph fresh trước khi trust result — return `{fresh: bool, staleMs, pending}`. Existing query tools cũng auto-attach `_freshness` metadata vào response
- [ ] Task 10 — **skill entry** `.claude/skills/codegraph-freshness.md`: trigger "codegraph có fresh không", "đợi index xong rồi query"
- [ ] Task 11 — *(optional)* freshness badge UI trong CodeGraph page
- [ ] Task 12 — tests: 5 unit (debounce, single-file update, cross-file edge refresh, mutex, backpressure) + 1 integration (edit file → wait 600ms → query graph → thấy symbol mới) + 1 MCP e2e

## Acceptance Criteria

- [ ] Edit 1 file → graph updated <5s end-to-end (p95)
- [ ] 10 files đổi đồng loạt → tất cả xử lý <15s, không crash
- [ ] Cross-file edge: đổi function body A → caller B vẫn thấy edge; đổi signature A → graph update đúng
- [ ] Watcher off → zero overhead (benchmark verify)
- [ ] Mutex: manual `diff-updater` + watcher đồng thời → không corrupt (seed 100 random edits, verify edge count match full-rescan)
- [ ] Memory: watcher chạy 1h không tăng RSS >50MB (soak test)
- [ ] Staleness metric chính xác ±100ms

## Files Touched

- `packages/server/src/codegraph/watcher.ts` — new (~250 LOC)
- `packages/server/src/codegraph/diff-updater.ts` — modify (extract shared single-file update helper)
- `packages/server/src/codegraph/index.ts` — modify (watcher lifecycle exports)
- `packages/server/src/config/schema.ts` — modify (flag)
- `packages/server/src/routes/codegraph.ts` — modify (freshness endpoint)
- `packages/server/src/services/project-lifecycle.ts` — modify (start/stop watcher)
- `packages/server/src/mcp/codegraph-tools.ts` — modify (register `codegraph_freshness_check`, attach metadata to existing query tools)
- `.claude/skills/codegraph-freshness.md` — new (~40 LOC)
- `packages/web/src/app/codegraph/freshness-badge.tsx` — new (OPTIONAL, ~80 LOC)

## Dependencies

- Requires: Phase 0 live (để đo staleness impact)
- Requires: tree-sitter incremental parse (đã có trong `tree-sitter-engine.ts`)
- Library: `chokidar` đã có trong tree? Nếu chưa, add `chokidar@^4`

## Gate to Next Phase

**Proceed to Phase 2 nếu**:
- Sau 2 tuần bật watcher trên ≥3 project:
  - p95 staleness <5min
  - p95 single-file update <500ms
  - Không tăng CPU baseline >5% ở idle
  - 0 edge corruption báo từ agent query

**Roll back + revisit nếu**:
- Staleness p95 >30min hoặc update p95 >5s (bottleneck trầm trọng)
- Watcher gây >10% CPU steady-state
- Bug report edge corruption ≥3 cases/week

**Defer Phase 2/3 nếu**:
- Phase 1 acceptance fail → fix Phase 1 xong mới đi tiếp. Stale graph là blocker cho temporal + semantic.

## Out of Scope

- Watch bên ngoài project dir (node_modules, dist — skip hard)
- Distributed multi-host watcher (v3)
- Optimistic UI (pre-show pending update) — phase sau
