# Feature: Multi-CLI Platform Support + Unified Debate

## Overview
Support multiple AI coding CLI platforms (Claude Code, Codex, Gemini CLI, OpenCode) as first-class session backends, and enable cross-platform debates where CLI agents with full tool access argue in real-time.

## Current State
- **CLI Sessions**: Only Claude Code, hardcoded in `cli-launcher.ts`
- **API Debates**: Multi-provider via `debate-engine.ts` + `provider-registry.ts` (no tool access)
- **Free Models**: Debate-only via API (Gemini, Groq, Pollinations, etc.)
- These are 3 separate systems with no cross-talk

## Target State
```
┌─────────────────────────────────────────────────────┐
│                   Session Layer                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Claude   │ │ Codex    │ │ OpenCode │  ← CLI     │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │    Adapters │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       └─────────┬───┴───────────┘                    │
│           CLIAdapter interface                       │
│                 │                                    │
│           ws-bridge.ts (unified routing)             │
│                 │                                    │
│  ┌──────────────┴──────────────────┐                │
│  │         Debate Engine           │                │
│  │  ┌─────────┐  ┌──────────────┐  │                │
│  │  │API Agent│  │ CLI Agent    │  │                │
│  │  │(current)│  │(new: spawns  │  │                │
│  │  │         │  │ real CLI)    │  │                │
│  │  └─────────┘  └──────────────┘  │                │
│  └─────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | CLI Adapter Interface | ✅ Done | plan-multi-cli-phase1.md | Abstract interface, refactor Claude into adapter |
| 2 | Codex + Gemini + OpenCode Adapters | ✅ Done | plan-multi-cli-phase2.md | All 4 adapters registered, detection working |
| 3 | Multi-CLI Sessions UI + Rich Composer | ✅ Done | plan-multi-cli-phase3.md | Platform picker, dynamic models, type-while-running |
| 4 | CLI-Powered Debate | ✅ Done | plan-multi-cli-phase4.md | Cross-CLI debate engine, turn protocol, API route |
| 5 | Unified Debate UX | ✅ Done | plan-multi-cli-phase5.md | Debate create modal, feed, agent cards, Ring integration |
| 6 | Telegram Multi-Bot Debate | ✅ Done | plan-multi-cli-phase6.md | `/debate` + `/verdict` + guide shipped; B2B loop guards added |

## Key Decisions
- CLI adapters normalize output to a common message format (superset of current CLIMessage)
- Codex uses `codex -q --json` (quiet + JSON), Gemini uses `gemini -p --output-format json`
- OpenCode has TWO modes: `opencode run --format json` (per-request) or `opencode serve` (persistent HTTP server)
- OpenCode serve = universal backend for Provider tab (75+ providers via Models.dev, including free local + cloud)
- Gemini CLI has generous free tier (60 req/min, 1000/day) — ideal as free debate agent
- OpenCode Zen free models: Big Pickle, Qwen3.6, Nemotron 3, MiniMax M2.5
- CLI debate = 2+ CLI processes running in parallel, output merged into single channel
- API debate stays as-is — CLI debate is a new debate type, not a replacement
- Claude Desktop excluded (no automation API)

## Key Decisions
- Antigravity CLI is editor-only launcher, cannot spawn AI sessions — excluded
- Gemini CLI is separate from Antigravity, installed via npm, has FREE tier (1000 req/day)
- Session creation uses tabbed UI: Claude | Codex | Gemini | Provider (API)
- Provider tab splits into Local (Ollama/LM Studio) and Cloud (free + configured)
- Telegram debate: each CLI platform = separate bot in group, natural multi-bot conversation
- DM debate fallback: single bot plays all roles (current behavior preserved)

## Risk Areas
- Output format differences between CLIs → need robust parser per adapter
- Process lifecycle: Codex/OpenCode may not support resume like Claude
- Cost tracking: Codex/OpenCode don't report token usage the same way
- Concurrent process limits on user's machine (memory, CPU)
- Telegram multi-bot: need coordination layer so bots don't talk over each other
- Local model detection: Ollama/LM Studio may not be running
