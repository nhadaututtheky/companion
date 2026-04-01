# Feature: Claude Code Integration Improvements

## Overview
Cherry-pick safe patterns from Claude Code source analysis to improve Companion's session management, context tracking, and multi-agent capabilities.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Control Protocol | ✅ Done | plan-cc-integration-phase1.md | Context meter, interrupt, model switch via control_request |
| 2 | HTTP Hooks | ✅ Done | plan-cc-integration-phase2.md | Event system via HTTP hooks instead of stdout parsing |
| 3 | Debate Mode Upgrade | ⬚ Pending | plan-cc-integration-phase3.md | Coordinator system prompt, task-notification format, scratchpad |
| 4 | CLI Flag Optimization | ⬚ Pending | plan-cc-integration-phase4.md | --include-partial-messages, --replay-user-messages, --bare |

## Key Decisions
- Only adopt PUBLIC/STABLE patterns — no feature-gated APIs
- Coordinator mode: port PATTERN (system prompt + format), not implementation
- Keep stdin/stdout NDJSON architecture — do NOT migrate to claude server
