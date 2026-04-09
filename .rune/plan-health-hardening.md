# Feature: Companion Health Hardening (6.5 → 8.5/10)

## Overview
Address all critical, high, and medium findings from the April 2026 autopsy.
Goal: improve maintainability, close integration gaps, harden security, add safety nets.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Safety Nets | ✅ Done | plan-health-hardening-phase1.md | Error boundaries, input validation, rate limiter |
| 2 | Integration Gaps | ⬚ Pending | plan-health-hardening-phase2.md | CodeGraph↔Wiki, Debate↔Mentions, incomplete stubs |
| 3 | ws-bridge Surgery | ⬚ Pending | plan-health-hardening-phase3.md | Split 3,023-line god file into modules |
| 4 | God File Cleanup | ⬚ Pending | plan-health-hardening-phase4.md | telegram-bridge, settings-tabs, new-session-modal |
| 5 | Security Hardening | ⬚ Pending | plan-health-hardening-phase5.md | Zod on all routes, auth defaults, iframe policy |
| 6 | Test Coverage | ⬚ Pending | plan-health-hardening-phase6.md | Critical path tests: ws-bridge, debate, telegram |

## Key Decisions
- Memory leak (sessionDebateParticipants) — VERIFIED NOT A LEAK, cleanup exists at sessions.ts:380
- ws-bridge split is highest-impact refactor — do AFTER safety nets are in place
- Tests come LAST — need stable module boundaries first
- Each phase is 1 session max — load only that phase's plan file

## Constraints
- Zero downtime — all changes must be backwards-compatible
- No feature regressions — existing behavior preserved
- Build must pass after every phase
