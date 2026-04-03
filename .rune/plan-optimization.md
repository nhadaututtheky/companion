# Feature: v0.8.0 Optimization — Security, Architecture, UX

## Overview
Full optimization pass addressing 30 audit findings across security, architecture, UI/UX, performance, and feature gaps. Prioritized by blast radius and user impact.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Security Hardening | ✅ Done | plan-optimization-phase1.md | 8 security fixes (S01-S08): hook auth, path validation, CSP, error handler |
| 2 | Architecture Cleanup | ✅ Done | plan-optimization-phase2.md | DB indexes, ws-bridge partial split, N+1 fix, version drift, test dedup |
| 3 | UI/UX Standards | ✅ Done | plan-optimization-phase3.md | 75 outline-none a11y fixes, lazy loading (4 components), brand color |
| 4 | Feature Gaps & Polish | ✅ Done | plan-optimization-phase4.md | Compact mode UI, RTK hash upgrade, empty states, RTK skeleton |

## Key Decisions
- Phase 1 MUST ship before any feature work — security issues are exploitable
- ws-bridge split done pragmatically: extracted web-intel-handler.ts (286 LOC) + compact-manager.ts (168 LOC), ws-bridge 2717→2354 LOC
- Inline style migration deferred — automated replacement creates duplicate className attrs on multi-line JSX. Manual migration recommended.
- Component splits (settings 1932 LOC, ai-context 1570 LOC) deferred — high-risk, low-urgency

## Remaining Work (follow-ups)
- U01-U04: Split oversized components (settings, ai-context, new-session-modal, api-client)
- U06-U07: Migrate ~1868 inline styles to Tailwind classes (manual per-file)
- F01: Voice input button in session composer
- F03: Database browser page UI
- F04: Persist pinned messages to server
- F06: Session forking UI trigger
