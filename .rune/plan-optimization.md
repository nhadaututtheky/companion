# Feature: v0.8.0 Optimization — Security, Architecture, UX

## Overview
Full optimization pass addressing 30 audit findings across security, architecture, UI/UX, performance, and feature gaps. Prioritized by blast radius and user impact.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Security Hardening | ⬚ Pending | plan-optimization-phase1.md | Fix 5 CRITICAL + 3 HIGH security issues |
| 2 | Architecture Cleanup | ⬚ Pending | plan-optimization-phase2.md | Break god objects, add indexes, fix version drift |
| 3 | UI/UX Standards | ⬚ Pending | plan-optimization-phase3.md | Inline styles → Tailwind, a11y fixes, component splits |
| 4 | Feature Gaps & Polish | ⬚ Pending | plan-optimization-phase4.md | Wire stubs, add missing UI, lazy loading |

## Key Decisions
- Phase 1 MUST ship before any feature work — security issues are exploitable
- Inline style migration (Phase 3) is largest by volume — 1,042 occurrences across 50 files
- ws-bridge.ts split (Phase 2) is highest-risk refactor — needs careful testing
- Feature gaps (Phase 4) are nice-to-have, not blockers
