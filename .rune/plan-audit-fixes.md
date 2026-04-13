# Feature: Audit Fixes — Post-Audit Remediation Sprint

## Overview
Address all critical, high, and medium findings from the 2026-04-13 comprehensive audit.
11 phases covering: CI, build reproducibility, design tokens, Telegram UX, WsBridge decomposition,
web tests, security, performance, Telegram bugs, inline style migration, and linting.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | CI Quality Gates | ✅ Done | plan-audit-fixes-phase1.md | Removed continue-on-error, fixed failing tests |
| 2 | Build Reproducibility | ✅ Done | plan-audit-fixes-phase2.md | .gitignore bun.lockb, pinned @types/bun |
| 3 | Design Token Unification | ✅ Done | plan-audit-fixes-phase3.md | Outfit display font, unified radius/shadow/chart tokens |
| 4 | Telegram UX: Clean Start Flow | ✅ Done | plan-audit-fixes-phase4.md | Removed Back button, Cancel→Pause rename |
| 5 | Telegram Bug Fixes | ✅ Done | plan-audit-fixes-phase5.md | Model validation, debate formatting, error strings |
| 6 | Web Test Suite Bootstrap | ✅ Done | plan-audit-fixes-phase6.md | 7 test files, 163 tests (bun:test), stores + z-index + components |
| 7 | WsBridge Decomposition | ⏸ Deferred | plan-audit-fixes-phase7.md | Needs test coverage first (Phase 6) |
| 8 | Security Hardening | ✅ Done | plan-audit-fixes-phase8.md | AES-256-GCM crypto, CSP tightened, userFriendlyError |
| 9 | Performance: z-index scale | ✅ Done | plan-audit-fixes-phase9.md | 32 files migrated to Z constants; async FS deferred |
| 10 | Inline Style Migration | ✅ Done | plan-audit-fixes-phase10.md | 2128→1456 inline styles (-32%), 672 migrated to TW4 classes |
| 11 | Linting & Formatting | ✅ Done | plan-audit-fixes-phase11.md | ESLint 10 + Prettier 3.8 + Tailwind plugin |

## Key Decisions
- Phases ordered by risk × effort ratio (highest impact + lowest effort first)
- Phase 1-2 are blockers — must fix before any feature work
- Phase 3-5 are brand/UX critical — visible to users immediately
- Phase 6-11 are infrastructure debt — can be batched across multiple sessions
- Each phase is independently shippable (no cross-phase dependencies except 1→2)
