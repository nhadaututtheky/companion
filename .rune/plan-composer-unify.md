# Feature: Composer & Session-View Unification

## Overview

Chat composer is implemented twice (`MessageComposer` 621 LOC + `CompactComposer` ~130 LOC inline in `mini-terminal.tsx`). Font sizes drift, visual styling diverges, every behavioral fix has to land in two places. Extract a shared `<ComposerCore>` primitive with `variant: "full" | "compact"` and opt-in feature props so both views render from one source of truth.

## Goals

1. **One composer**, two variants. Font, focus ring, slash menu, send semantics shared.
2. **Maintain parity** — neither view loses a feature it has today.
3. **Visual breathing room** — tighten the design so the composer doesn't look plain (user complaint: "khá đơn điệu, chưa tận dụng được khoảng trống").
4. **Long-term**: same pattern for message feed (`MessageFeed` ↔ `CompactMessageFeed`) once composer ships clean.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Safety net + characterization | ✅ Done | plan-composer-unify-phase1.md | Lock current behavior, document shared/diverged surface |
| 2 | Extract ComposerCore | ✅ Done | plan-composer-unify-phase2.md | New primitive + variant prop, no migration yet |
| 3 | Migrate MessageComposer | ✅ Done | plan-composer-unify-phase3.md | Full variant uses ComposerCore, regression-free |
| 4 | Migrate CompactComposer | ✅ Done | plan-composer-unify-phase4.md | Compact variant uses ComposerCore, delete inline dup |
| 5 | Visual polish + feed unify (stretch) | ✅ Done | plan-composer-unify-phase5.md | Whitespace, font sync (FeedCore deferred) |

## Results so far (after Phase 4)

- `message-composer.tsx`: 621 → 508 LOC
- `mini-terminal.tsx`: 487 → 376 LOC
- New shared primitive: 389 LOC across 4 files
- Tests: 47 passing (Phase 1 + Phase 2 contracts both green)
- TS check: clean
- **One source of truth**: any composer fix now lands in `composer-core.tsx` and applies to both views

## Key Decisions

- **Variant prop, not two components**. `<ComposerCore variant="compact" features={{ attachments: false, voice: false, ... }}>` — single render path, easier to test.
- **Opt-in feature props default OFF** — compact variant turns nothing on; full variant turns everything on. Prevents accidental feature creep into mini-terminal.
- **Slash menu logic moves to a hook** (`useSlashMenu`) since both variants need it identically.
- **Auto-resize logic moves to a hook** (`useAutoResizeTextarea`) — same reason.
- **State stays local to each call site**. Composer text is not lifted into a store — current local-state pattern is fine and avoids cross-session contamination.
- **NO behavioral changes in Phases 2-4** — pure refactor. Visual polish is Phase 5 only.

## Risk

Both composers are user-facing primary surfaces. Breaking either = users immediately notice. Phase 1 safety net is non-negotiable.
