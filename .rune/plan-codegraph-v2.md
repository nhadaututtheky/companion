# Feature: CodeGraph v2 — Agent-Grade Capabilities

## Overview

Tree-sitter integration đã ship (regex→AST precision). Giai đoạn này thêm 3 capability giúp agent dùng CodeGraph hiệu quả hơn: **freshness** (không stale), **temporal context** (ai đổi gì gần đây), **semantic recall** (tìm theo ý nghĩa, không phải tên). Riêng với tree-sitter plan — tree-sitter là extraction layer; v2 là capability layer build trên đó. Ship tuần tự, decision gate sau mỗi phase.

## Phases

| # | Name | Status | Plan File | Effort | Prerequisite |
|---|------|--------|-----------|--------|--------------|
| 0 | Telemetry baseline | ✅ Done (97affcd) | plan-codegraph-v2-phase0.md | 2-3d | None |
| 1 | Real-time diff tracking | ⬚ Pending | plan-codegraph-v2-phase1.md | 5-7d | Phase 0 live |
| 2 | Temporal query (git blame/log) | ⬚ Pending | plan-codegraph-v2-phase2.md | 3-4d | Phase 1 gate pass |
| 3 | Semantic embedding search | ⬚ Pending | plan-codegraph-v2-phase3.md | 8-12d | Phase 2 gate pass |

## Key Decisions

- **Agent-facing, NOT human-facing** — CodeGraph phục vụ agent reasoning. Mọi phase ship value qua **MCP tool + skill entrypoint**, không phải dashboard UI. Dashboard là observability phụ, có thể defer/bỏ mà không ảnh hưởng gate.
- **Separate from tree-sitter plan** — tree-sitter đã live; v2 build trên top, không bundle để mỗi phase có thể kill độc lập.
- **Gate-driven shipping** — sau mỗi phase phải đạt metric thresholds mới ship tiếp. Tránh invest mù, đặc biệt phase 3 (embedding) có effort cao nhất.
- **Phase 0 first** — không có telemetry thì không biết phase nào thật sự có ROI. Phase 0 rẻ, unblock mọi decision sau.
- **Server-side only (v1)** — không expose embedding model ra web bundle. CodeGraph luôn là server feature.

## Gate Criteria (tóm tắt, chi tiết ở phase file — mọi metric agent-facing)

| Sau phase | Proceed nếu | Kill/Defer nếu |
|-----------|-------------|----------------|
| 0 | Log capture >90% agent queries, MCP tool callable, skill discoverable | Không — phase 0 là foundation |
| 1 | Graph staleness <5min p95, incremental update <500ms/file, MCP freshness tool agent dùng ≥5 lần/ngày | Stale >30min hoặc update >5s → revisit architect |
| 2 | ≥15% agent query call MCP `codegraph_temporal_query` sau 2 tuần | <5% MCP calls → feature bỏ, roll back |
| 3 | Semantic MCP hit rate ≥20%, token/query giảm ≥30% vs keyword | Hit rate <10% → kill, giữ keyword-only |

## Parallel Track Plan

Chạy song song với Inline Suggest (track B — web/UX feature). CodeGraph v2 là track A — server/agent feature, không đụng web files trừ optional dashboards. Workflow mỗi phase (cả 2 tracks):
1. Implement per plan file
2. Local verify (lint + typecheck + tests)
3. **Sub-agent review** (code-reviewer) — blocking
4. Address CRITICAL + HIGH findings
5. Commit + push
6. Gate metric check (sau ≥2 tuần live data) trước khi mở phase kế

## Files Touched (high-level)

- `packages/server/src/codegraph/` — mở rộng: watcher.ts (P1), temporal.ts (P2), embedding/* (P3)
- `packages/server/src/codegraph/telemetry.ts` — P0 new
- `packages/server/src/mcp/codegraph-tools.ts` — mở rộng tool mỗi phase (primary delivery)
- `packages/server/src/db/schema.ts` — bảng mới cho telemetry + embedding
- `skills/codegraph-*.md` — skill entries giúp Claude Code discover tool (1 file/phase)
- `packages/web/src/app/codegraph/*` — dashboard (optional, defer-able)

## Out of Scope

- Cross-project graph walk (v3)
- LLM-powered query rewriting (v3)
- Multi-language semantic search (v1 tập trung TS/JS, Python later)
- Replacing tree-sitter (đã ship)
