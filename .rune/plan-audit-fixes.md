# Feature: Audit Fixes — Post-Audit Remediation Sprint

## Overview
Address all critical, high, and medium findings from comprehensive audits.
Round 1 (2026-04-13): 11 phases — CI, build, design, Telegram, security, perf, linting.
Round 2 (2026-04-13): 5 phases — registry docs, WsBridge split, api-client split, telegram-bridge split, test gaps.

## Phases — Round 1 (Complete)
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | CI Quality Gates | ✅ Done | plan-audit-fixes-phase1.md | Removed continue-on-error, fixed failing tests |
| 2 | Build Reproducibility | ✅ Done | plan-audit-fixes-phase2.md | .gitignore bun.lockb, pinned @types/bun |
| 3 | Design Token Unification | ✅ Done | plan-audit-fixes-phase3.md | Outfit display font, unified radius/shadow/chart tokens |
| 4 | Telegram UX: Clean Start Flow | ✅ Done | plan-audit-fixes-phase4.md | Removed Back button, Cancel→Pause rename |
| 5 | Telegram Bug Fixes | ✅ Done | plan-audit-fixes-phase5.md | Model validation, debate formatting, error strings |
| 6 | Web Test Suite Bootstrap | ✅ Done | plan-audit-fixes-phase6.md | 7 test files, 163 tests (bun:test), stores + z-index + components |
| 7 | WsBridge Decomposition | ⏸ Deferred→R2 | plan-audit-fixes-phase7.md | Moved to Round 2, Phase 12 |
| 8 | Security Hardening | ✅ Done | plan-audit-fixes-phase8.md | AES-256-GCM crypto, CSP tightened, userFriendlyError |
| 9 | Performance: z-index scale | ✅ Done | plan-audit-fixes-phase9.md | 32 files migrated to Z constants; async FS deferred |
| 10 | Inline Style Migration | ✅ Done | plan-audit-fixes-phase10.md | 2128→1456 inline styles (-32%), 672 migrated to TW4 classes |
| 11 | Linting & Formatting | ✅ Done | plan-audit-fixes-phase11.md | ESLint 10 + Prettier 3.8 + Tailwind plugin |

## Phases — Round 2 (Active)
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 12 | Feature Registry & Docs | 🔄 Active | plan-audit-fixes-phase12.md | Add 19 missing services, fix RTK 8→10 |
| 13 | WsBridge Decomposition | ⬚ Pending | plan-audit-fixes-phase13.md | 2718→<500 LOC, extract 6 modules |
| 14 | api-client.ts Split | ⬚ Pending | plan-audit-fixes-phase14.md | 1687 LOC → domain-grouped files |
| 15 | telegram-bridge.ts Split | ⬚ Pending | plan-audit-fixes-phase15.md | 1610 LOC → focused modules |
| 16 | Critical Test Gaps | ⬚ Pending | plan-audit-fixes-phase16.md | Tests for cli-launcher, ai-client, ws-bridge |

## Key Decisions — Round 2
- Phase 12 first: cheap docs fix, immediate accuracy win
- Phase 13 (WsBridge): highest risk, highest impact — 14 responsibilities → 6 modules
- Phase 14-15: web + telegram bridges split in parallel after WsBridge proves pattern
- Phase 16: test gaps for danger-zone files (cli-launcher, ai-client)
- Skip files 500-800 LOC for now — focus on >1000 LOC monsters first
