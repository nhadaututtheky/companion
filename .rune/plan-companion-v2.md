# Companion v2 — Comprehensive Improvement Plan

> Generated: 2026-03-31 | Sources: MyTrend PR analysis, E2E user journey audit, Tauri 2 feasibility study
> Rule: Review + test after EACH phase. Ship only after Phase 7 full review.

## Overview

Systematic overhaul of Companion covering bug fixes, Telegram UX (primary mobile interface), Web UX, core feature gaps, MyTrend feature ports, and Tauri 2 desktop app preparation. Each phase is self-contained with its own review checkpoint.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Quick Wins | ✅ Done | plan-companion-v2-phase1.md | Bug fixes, version sync, command cleanup |
| 2 | Telegram UX Overhaul | ✅ Done | plan-companion-v2-phase2.md | Command reduction, media upload, mobile UX |
| 3 | Web App UX Overhaul | ✅ Done | plan-companion-v2-phase3.md | Login page, responsive, notifications |
| 4 | Core Feature Gaps | ✅ Done | plan-companion-v2-phase4.md | Onboarding, message persistence, export |
| 5 | MyTrend Port | ✅ Done | plan-companion-v2-phase5.md | Compact re-injection, WS race fix, stats UI |
| 6 | Tauri 2 Desktop | ✅ Done | plan-companion-v2-phase6.md | Static export, sidecar, system tray |
| 7 | Final Review + Ship | ✅ Done | plan-companion-v2-phase7.md | Full E2E test, regression check, ship |

## Key Decisions

- Telegram is PRIMARY interface (most users on mobile) → Phase 2 before Phase 3
- Quick wins first to reduce bug surface before feature work
- Tauri 2 uses sidecar architecture (zero server rewrite)
- Static export benefits both Docker and Desktop targets
- Review gate after every phase — no skipping

## Review Protocol

After each phase:
1. `bun run build` — verify no build errors
2. Manual test changed features (Telegram + Web)
3. Check for regressions in adjacent features
4. Update phase status in this file
5. Commit with semantic message: `feat: companion v2 phase N — <summary>`

## Risk Register

| Risk | Mitigation |
|------|------------|
| Telegram 64-byte callback_data limit | Audit all callbacks in Phase 1, use short prefixes |
| Next.js static export breaks dynamic routes | Hono catch-all fallback to index.html |
| Bun sidecar size (~50MB) | Acceptable for desktop app, document in release notes |
| Breaking existing Docker users | Phase 1-5 are additive, no breaking changes |
