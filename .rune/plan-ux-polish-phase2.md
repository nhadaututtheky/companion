# Phase 2: ModalStack Orchestrator

## Status
**DONE (2026-04-17)** — shipped as a minimal priority-selector refactor on top of the existing ui-store, not a new provider+hook system.

## Goal
Replace the 4 concurrent modals in `app/page.tsx` with a single orchestrator. One modal at a time, clear dismiss chain, priority ordering. Removes modal-cascade UX friction (severity 5).

## Strategy (chosen)
Instead of introducing a dedicated ModalStack store + provider + registration hooks (larger blast radius, more files, duplicate source of truth), extend the existing `ui-store` with a pure priority selector:

- Individual per-modal boolean flags remain the "intent to show" source of truth.
- `selectTopOpenModal(state)` is a pure function returning the highest-priority modal whose flag is set (or null).
- `closeTopModal()` pops whichever modal is currently top.
- Each modal render gate in `app/page.tsx` becomes `topModal === 'X'` — automatically exclusive.

This preserves every existing call site (`setNewSessionModalOpen`, `setFeatureGuideOpen`, etc.), so no hook-registration or provider wiring is needed. Minimum viable fix.

## Priorities
| Modal | Priority |
|---|---|
| Onboarding | 10 |
| Resume Sessions | 8 |
| New Session | 5 |
| Feature Guide | 3 |

Side panels (NavSidebar, ExpandedSession, right panel) are **not** modals and remain inline.

## Tasks
- [x] **Task 2.1** — Add `ModalType`, `MODAL_PRIORITY`, `onboardingOpen` state, `setOnboardingOpen`, `closeTopModal`, `selectTopOpenModal` to `packages/web/src/lib/stores/ui-store.ts`
- [x] **Task 2.2** — Refactor `OnboardingWizard` to drive its "show me" intent through the store flag; gate render on `topModal === 'onboarding'`. The component stays mounted so its setup-status fetch still runs.
- [x] **Task 2.3** — Gate each modal render in `app/page.tsx` on the top selector:
  - `<NewSessionModal open={topModal === "new-session"} />`
  - `<ResumeSessionsModal open={topModal === "resume-sessions"} />`
  - `{topModal === "feature-guide" && <FeatureGuideModal />}`
  - OnboardingWizard remains always-mounted (internal render gate)
- [x] **Task 2.4** — Route `Esc` / `Ctrl+S` through `closeTopModal` when any modal is on; fall through to side-panel close chain when no modal is on. FeatureGuideModal still owns its own `Esc` (avoids double-close/flicker with its "collapse sub-category first" behavior).
- [x] **Task 2.5** — Unit tests: 6 new tests in `ui-store.test.ts` for selector + close semantics (null, single, priority, pop+reveal, no-op close, toggle).

## Acceptance Criteria
- [x] Only 1 modal visible at any time (enforced by `topModal === 'X'` gates)
- [x] Esc dismisses top modal first, then side panels
- [x] Priority ordering works (test: `onboarding + new-session` → onboarding wins; close onboarding → new-session appears)
- [x] No regression: 169/169 web unit tests pass, typecheck clean
- [ ] `app/page.tsx` reduced from 757 lines to ~500 — **scope de-risk: NOT targeted** (the bulk of that file is grid/layout rendering, not modal state; line count stayed ~756 but modal-rendering complexity is centralized)
- [ ] Manual QA (review gate, see below)

## Files Touched
- `packages/web/src/lib/stores/ui-store.ts` — modal priority + selector + closeTopModal + onboardingOpen
- `packages/web/src/components/onboarding-wizard.tsx` — local `visible` → store flag + top-gate
- `packages/web/src/app/page.tsx` — topModal selector, three modal render gates, Esc routing
- `packages/web/src/__tests__/stores/ui-store.test.ts` — 6 new modal-stack tests

## Dependencies
- None — parallel to Phase 1

## Review Gate
Before merging Phase 2, manual QA on a running instance:
- [ ] Trigger new-session via Ctrl+N → modal opens
- [ ] With new-session open, run `setOnboardingOpen(true)` from devtools — onboarding should cover new-session; closing onboarding should reveal new-session
- [ ] Press Ctrl+/ → feature guide opens; Esc closes it; Esc again collapses nav/right panel as before
- [ ] Reset onboarding (`localStorage.removeItem("onboarding_completed")`) + reload on a fresh setup → wizard appears
- [ ] Reload with resumable sessions on disk → only the resume banner/modal appears, not two modals stacked

## Estimated Effort
1 day (actual: ~0.5 day)

## Deviations From Original Plan
- No separate `modal-stack.ts` store file — selector lives next to the flags in `ui-store.ts`.
- No `<ModalStackProvider>` wrapper — unneeded since only `/app/page.tsx` opens these modals.
- No `useModalRegister(type, Component)` hook — modals remain imported + rendered inline in `page.tsx`.
- OnboardingWizard keeps its setup-status effect in the component (could move to a provider, but the effect writes to the store flag so the coupling is already there and clean).

If a second page ever needs to open these modals, upgrade to the full provider/hook design then.
