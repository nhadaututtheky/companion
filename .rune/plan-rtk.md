# RTK (Runtime Token Keeper) — Master Plan

> Goal: CLI output proxy that compresses tool outputs before LLM context, saving 30-60% tokens
> Priority: P1 — unique competitive advantage, direct cost savings for users
> Status: ✅ All Phases Done

## Architecture

```
Tool Output → RTK Pipeline → ┬→ Full output    → Web UI / Telegram (user sees everything)
                              └→ Compressed     → LLM context (saves tokens)
```

Integration: `handleAssistant()` in ws-bridge.ts processes ContentBlocks.
RTK transforms `tool_result` blocks, tracks savings, shows metrics.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Core Pipeline + Quick Wins | ✅ Done | plan-rtk-phase1.md | RTK service, ANSI strip, dedup, truncation |
| 2 | Smart Compressors | ✅ Done | plan-rtk-phase2.md | Stack trace, error aggregation, test summary, diff summary, JSON limiter, boilerplate |
| 3 | Intelligence Layer | ✅ Done | plan-rtk-phase3.md | Cross-turn cache, token budget, RTK config, disabled strategies |
| 4 | Metrics + UI | ✅ Done | plan-rtk-phase4.md | Dashboard widget, RTK savings card, settings panel, API |

## Key Decisions

- RTK is a pure-function pipeline — no side effects, easy to test
- Dual output: `{ compressed: string, original: string, savings: TokenSavings }`
- Strategies are pluggable — each implements `RTKStrategy` interface
- Applied in `handleAssistant()` on `tool_result` ContentBlocks
- Configurable per project via settings (aggressive/balanced/minimal)
- Full output always preserved for UI — compression only affects LLM context view + metrics
