# Feature: Pulse — Agent Operational Health Monitor

## Overview
Real-time operational health scoring for agent sessions based on observable behavior signals (tool errors, edit churn, cost acceleration, context pressure). Inspired by Anthropic's emotion concepts research — but uses proxy signals, not internal activation vectors. **Human-in-the-loop**: system detects + suggests, user decides actions.

## Research Basis
- Anthropic "Emotion Concepts Function" (2026): desperation vectors → reward hacking, calm steering reduces it
- Key insight: emotion states influence behavior even WITHOUT visible text markers
- Our approach: measure behavioral proxies (failure rate, churn, cost) since we can't access internal vectors

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Signal Engine | ✅ Done | plan-pulse-phase1.md | PulseEstimator service, 7 signal collectors, composite scoring |
| 2 | Session Pulse UI | ✅ Done | plan-pulse-phase2.md | Pulse indicator in header, warning banner, action buttons |
| 3 | Telegram Alerts | ✅ Done | plan-pulse-phase3.md | /mood command, auto-alert on state transition, cooldown |
| 4 | Guided Intervention | ✅ Done | plan-pulse-phase4.md | Send Guidance editor, Inject Calm confirm, Telegram reply routing |

## Key Decisions
- **Human-in-the-loop**: System shows warnings + action buttons. User clicks to intervene. NO auto-injection.
- **Zero agent interruption**: PulseEstimator is observe-only. pulse:update events go to browser/Telegram ONLY, never to CLI process. Agent execution is never paused, blocked, or injected into by Pulse. Even user-triggered guidance (P4) is delivered as a normal user_message at natural turn boundary — same as typing in chat.
- **Observable signals only**: We don't claim to read emotions. This is operational health monitoring.
- **Sliding window**: Score based on last 5 turns with exponential decay. Sessions start at 0.
- **Fire-and-forget pattern**: PulseEstimator taps ws-bridge events like event-collector does.
- **Telegram**: Auto-alert is notification only. No auto-action on agent.

## Operational States
```
flow       → Productive, diverse tools, low errors, steady cost
focused    → Deep work, long thinking, moderate cost
cautious   → Self-correcting, careful edits
struggling → Rising errors, edit churn, cost climbing
spiraling  → Consecutive failures, same-file loop
blocked    → Waiting for permission, idle
```

## Thresholds
| Score | State | Color | Frontend | Telegram |
|-------|-------|-------|----------|----------|
| 0-20 | flow/focused | #10B981 | Green dot | — |
| 21-40 | cautious | #6366F1 | Indigo dot | — |
| 41-60 | struggling | #F59E0B | Amber warning + buttons | Info alert |
| 61-80 | spiraling | #EF4444 | Red warning + buttons | Warning alert |
| 81-100 | critical | #DC2626 | Urgent banner + buttons | Urgent alert |
