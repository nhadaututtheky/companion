# Feature: UX Polish + Multi Account Bug Fix (v0.22.0)

## Overview
Fix critical Multi Account dedup bug (1 login → N ghost rows over time), then cleanup top 6 UX clutter hotspots identified by audit. Target: noticeable quality lift without adding new features.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Multi Account bug fix | ⬚ Pending | plan-ux-polish-phase1.md | Switch fingerprint from accessToken to stable identity + migrate duplicates |
| 2 | ModalStack orchestrator | ⬚ Pending | plan-ux-polish-phase2.md | 1 modal at a time, dismiss chain, remove race from app/page.tsx |
| 3 | Nav sidebar refactor | ⬚ Pending | plan-ux-polish-phase3.md | Split 4-space mega-menu into Workspace/Tools/Appearance tabs |
| 4 | Quick wins (toolbar + resume banner) | ⬚ Pending | plan-ux-polish-phase4.md | Error toolbar consolidation + resume banner dedup |
| 5 | Magic Ring simplification | ⬚ Pending | plan-ux-polish-phase5.md | Data-driven renderer, drop redundant SVG defs |
| 6 | Spacing system + Theme page | ⬚ Pending | plan-ux-polish-phase6.md | 8px baseline rhythm + theme editor modal |

## Key Decisions
- **No new features** — only fix existing surface
- **Review gate** after each phase — ship behind-the-scenes tweaks but user-visible changes need manual QA
- **Ship as v0.22.0** bundled release (not per-phase releases)
- **Bug fix (Phase 1) first** — orthogonal to UX, highest severity, unblocks user trust
- **Modal + Nav (Phase 2-3)** before polish — structural fixes before cosmetic
- **Magic Ring (Phase 5)** deferred if time tight — nice-to-have

## Estimated Timeline
~6-7 days solo (1 day per phase avg, Phase 5 = 1.5 day)

## Risks
- Phase 1 migration: existing users have N duplicate rows — need safe migration that picks "canonical" one
- Phase 2 ModalStack: refactor touches hottest component (app/page.tsx 757 lines) — regression risk
- Phase 3 Nav sidebar: 594-line component, high blast radius
