# Feature: Harness Engineer Layer

## Overview

Biến CodeGraph + Wiki KB + RTK từ "configured but unused" thành một
harness layer Claude/Codex/Gemini/OpenCode thật sự dùng tự động. Hiện
tại 3 thứ này tồn tại độc lập: Wiki và CodeGraph có MCP tools nhưng
agent không biết khi nào gọi (chains.jsonl 0 entries); RTK chỉ là
server-side compression, agent không thấy. Mục tiêu: agent tự động
gọi đúng tool khi gặp đúng context, có metrics đo được hiệu quả.

## Architecture

```
                  ┌──────────────────────┐
   adapter        │  skill-router        │  ← inject activation rules
   session start  │  (frontmatter+toggle)│    vào context prefix
                  └──────────┬───────────┘
                             ▼
              ┌─────────────────────────────┐
              │  MCP tools (per-CLI inject) │
              │  ┌─────────────────────┐    │
              │  │ companion_ask       │ ←──┼─ meta-tool (Phase 3)
              │  │   ├─ wiki_search    │    │
              │  │   ├─ codegraph_*    │    │
              │  │   └─ rtk_compress   │ ←──┼─ silo→tool (Phase 2)
              │  └─────────────────────┘    │
              └──────────────┬──────────────┘
                             ▼
                  ┌──────────────────┐
                  │ harness metrics  │  ← Phase 4
                  │ harness-tools.jsonl
                  └──────────────────┘
```

## Phases

| # | Name | Status | File | Summary |
|---|------|--------|------|---------|
| 1 | Skill activation rules | ✅ Done | plan-harness-layer-phase1.md | Frontmatter triggers + skill-router inject rules vào adapter prefix; toggle UI |
| 2 | RTK MCP exposure | ✅ Done | plan-harness-layer-phase2.md | `companion_compress` tool + auto-chain wiki/codegraph results > 4K tokens |
| 3 | Meta-tool `companion_ask` | ✅ Done | plan-harness-layer-phase3.md | 1 tool route 3 layer parallel, trả 1 unified answer kèm sources |
| 4 | Harness metrics + dashboard | ✅ Done | plan-harness-layer-phase4.md | Log MCP call latency/tokens; "Harness Usage" tab analytics |

## Key Decisions

- **MCP-first, không slash command** — agent-triggered cross-CLI duy nhất; slash command chỉ Claude và đẩy gánh nặng "biết khi nào" sang user.
- **Skill = activation rules, không phải doc** — frontmatter triggers + tool mapping inject 5-10 dòng vào prefix; toggle on/off per project (DB), không phải file existence.
- **Toggle ở DB level, không filesystem** — `harness_skill_toggles` table per-project, react ngay không cần restart adapter.
- **RTK auto-chain mặc định ON** — kết quả tool > 4K tokens tự compress trước khi trả agent (giảm context bloat). Toggle tắt được nếu cần raw.
- **Meta-tool optional** — `companion_ask` thêm vào sau cùng, không thay thế tools cũ. Agent chọn dùng khi cần "ask repo a question".
- **Metrics là proof-gate cho phase tiếp** — không có data chứng minh adoption thì không invest thêm. Phase 4 phải ship trước khi cân nhắc phase 5+.

## Non-goals (v1)

- Không sửa CodeGraph indexing / Wiki schema (chỉ thêm exposure layer)
- Không thay session lifecycle, không animation INV-1..INV-15
- Không build CLI binary (defer; web/MCP cover all needs)
- Không multi-project skill sharing (per-project toggle only)
- Không AI-generated triggers (curated rules, không infer từ usage)

## Touch zones (none in INV paths)

- `packages/server/src/services/skill-router.ts` (new)
- `packages/server/src/services/adapter-context-builder.ts` (extend prefix only — NOT in adapters/ INV path)
- `packages/server/src/mcp/tools.ts` (add tools, không sửa cũ)
- `packages/server/src/rtk/pipeline.ts` (export compress fn)
- `packages/server/src/services/companion-ask.ts` (new orchestrator)
- `packages/server/src/db/schema.ts` (new `harness_skill_toggles` table)
- `packages/server/src/routes/skills.ts` (toggle endpoint)
- `packages/server/src/routes/analytics-harness.ts` (new)
- `packages/web/src/components/settings/skills-tab.tsx` (toggle UI)
- `packages/web/src/components/analytics/harness-usage.tsx` (new)

INV paths NOT touched: `ws-*`, `session-store`, `compact-manager`,
`telegram/**`, `services/adapters/**`, `session-settings-service`.
