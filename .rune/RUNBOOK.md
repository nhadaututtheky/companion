# Companion Intelligence Layer — Execution Runbook

> Historical cross-session execution log. Both plans below have shipped;
> WebIntel was subsequently removed (see 2026-04-20 entry). Kept for
> context on why certain CodeGraph code exists.

## Execution History

| # | Plan | Phase | Status | Commit |
|---|------|-------|--------|--------|
| 1-5 | WebIntel | All phases + review | 🗑️ Removed 2026-04-20 | — |
| 6 | CodeGraph | Phase 1: Scanner + Store | ✅ Shipped | 0c7ca9a |
| 7 | CodeGraph | Phase 2: Semantic + Diff | ✅ Shipped | — |
| 8 | CodeGraph | Phase 3: Agent Interface | ✅ Shipped | — |
| 9 | CodeGraph | Phase 4: API + Web UI | ✅ Shipped | — |
| 10 | CodeGraph | Full Review + Integration Test | ✅ Shipped | — |
| 11 | ~~Bridge: CodeGraph ↔ WebIntel~~ | ~~Integration~~ | 🗑️ Removed with WebIntel | — |
| 12 | Final | E2E test all features | ✅ Shipped | — |

## 2026-04-20 — WebIntel removal

WebIntel (webclaw Docker sidecar + `/docs` `/research` `/crawl` commands,
auto doc injection, MCP scrape tools) was retired because:

- Overlap with Context7 MCP (better at library docs)
- Overlap with Claude CLI built-in `WebSearch` / `WebFetch`
- Docker sidecar friction undermined the "1-click self-hosted" USP
- `feedback_not_claudecode.md` — don't duplicate Claude Code features

CodeGraph's external-package summary was preserved (the file once called
`codegraph/webintel-bridge.ts` is now `codegraph/external-packages.ts`
and has no WebIntel dependency — it just extracts npm package names
from import edges).

## CodeGraph Reference

| File | Purpose |
|------|---------|
| `.rune/plan-codegraph.md` | CodeGraph master plan |
| `.rune/plan-codegraph-phase1.md` | Phase 1 detail (tree-sitter) |
| `.rune/plan-codegraph-phase2.md` | Phase 2 detail |
| `.rune/plan-codegraph-phase3.md` | Phase 3 detail |
| `packages/server/src/codegraph/` | All CodeGraph code |
| `packages/server/src/codegraph/external-packages.ts` | External package summary (was webintel-bridge.ts) |
| `packages/server/src/services/ws-user-message.ts` | CodeGraph injection points |
