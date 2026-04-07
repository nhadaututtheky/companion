# Feature: Wiki Knowledge Base + Feature Discovery UX

## Overview
Build a Karpathy-style LLM Wiki KB into Companion (local-first, LLM-compiled, domain-scoped)
AND redesign Settings/UX so users actually discover and understand all ~30 features.

Two problems, one plan: Wiki KB is the most complex new feature, and it's the perfect
test case for "how do we explain features to users" — solve both together.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Wiki KB Core | ✅ Done | plan-wiki-kb-phase1.md | Store, compile, retrieve — filesystem-based wiki engine |
| 2 | Wiki KB Integration | ✅ Done | plan-wiki-kb-phase2.md | Budget manager, feature toggles, session injection, feedback loop |
| 3 | Wiki KB Web UI | Pending | plan-wiki-kb-phase3.md | Wiki browser, article editor, raw drop zone |
| 4 | Feature Discovery UX | Pending | plan-wiki-kb-phase4.md | Settings redesign, feature guide, onboarding |
| 5 | Wiki KB Advanced | Pending | plan-wiki-kb-phase5.md | NM graduation, Obsidian MCP, auto-lint, CodeGraph xref |

## Key Decisions
- **Local-first filesystem** — no Notion/external dependency required
- **LLM compiles wiki** — user drops raw, agent writes articles (Karpathy pattern)
- **Context-loading > RAG** — load full articles, not chunks (works at <100 articles scale)
- **Budget allocator** — shared priority system across Wiki, CodeGraph, NM, CLAUDE.md
- **Feature Discovery** in Phase 4 — not just Settings tabs, but contextual help everywhere
- **Per-feature toggle** — every context-injecting feature can be ON/OFF in Settings
- **MCP = user's own** — Companion does NOT build/bundle Obsidian MCP or any external MCP.
  We only build the wiki engine + optional import bridge that reads from user's existing MCPs.

## System Interaction Map
```
                Wiki KB (NEW)
               /     |      \
              /      |       \
  Neural Memory  CodeGraph   RTK
  (episodic)    (structural) (compression)
       \           |          /
        \          |         /
     Context Budget Manager (upgraded from Estimator)
              |
      Session Context Window
```

## Non-Goals (explicitly out of scope)
- Vector DB / embedding-based RAG
- Real-time Notion/Google Docs sync
- Multi-user wiki editing (single-instance product)
- NotebookLM integration (no public API)
- Building/bundling any external MCP server (Obsidian, Notion, etc.)
  → We recommend, user installs and manages their own MCPs

## Token Budget Design
```
Priority | Source              | Budget  | When            | Toggleable
---------|---------------------|---------|-----------------|----------
1        | System prompt       | 10K     | Always          | No
2        | CLAUDE.md chain     | 2-5K    | Always          | No
3        | Wiki L0 (core)      | 2-3K    | If domain set   | YES
4        | CodeGraph map       | 1.5K    | Session start   | YES
5        | Wiki L1 (articles)  | 5K cap  | On-demand       | YES (with wiki)
6        | Neural Memory       | 1K      | On-demand       | YES
7        | Agent Context (B-E) | 0-2K    | Per-message     | YES
---------+---------------------+---------+-----------------+----------
Total    |                     | ~25-30K | 70%+ free       |

Feature Toggle Design (Phase 2 + 4):
- Settings key: `features.<name>.enabled` (boolean)
- Budget Manager skips disabled sources entirely
- Panel shows empty state with "Enable in Settings" CTA
- Toggleable features: wiki, codegraph, rtk, pulse, agent-context
- Non-toggleable: system prompt, CLAUDE.md (core to Claude Code)
```
