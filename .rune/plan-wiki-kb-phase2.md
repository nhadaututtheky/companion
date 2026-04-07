# Phase 2: Wiki KB Integration — Session Injection + Budget Manager

## Goal
Wire Wiki KB into the session lifecycle: auto-inject L0 at start, let agent request L1
articles on-demand, and upgrade Context Estimator into a unified Budget Manager that
coordinates ALL context sources (Wiki, CodeGraph, NM, CLAUDE.md).

## Tasks

### A. Context Budget Manager (upgrade from Estimator)
- [x] Create `context-budget.ts` alongside `context-estimator.ts`
  - Keeps estimation logic via re-export, adds budget allocation
  - Priority-based allocation (see master plan token budget table)
  - `allocateBudget(maxContextTokens, reservePercent)` → returns per-source token caps
  - `shouldInject(sourceId, currentUsagePercent)` → boolean gate
- [x] Centralized adaptive sizing thresholds (70/85/95%) in budget manager
  - Budget manager owns the "should I inject?" decision for ALL sources
- [x] Add Wiki as a budget source (priority 3 for L0, priority 5 for L1)
- [x] Broadcast `context_breakdown` with wiki entries via `getFullBreakdown()`

### A2. Per-Feature Toggle System
- [x] Settings keys: `features.<name>.enabled` for wiki, codegraph, pulse, agentContext, rtk
- [x] Budget Manager checks `isFeatureEnabled()` before injecting
  - Disabled source → skip entirely, zero token cost
- [x] `GET /api/settings/features/toggles` + `PUT /api/settings/features/toggles/:feature`
- [x] Default: all features ON for new installs (user opts out, not in)

### B. Session Injection — L0 (always loaded)
- [x] In `ws-bridge.ts` `handleSystemInit()`:
  - After context breakdown, load wiki L0 via `getWikiStartContext()`
  - Inject as system context + emit `context_injection` event
- [ ] In `telegram-bridge.ts`:
  - Same injection for Telegram sessions (deferred to Phase 3)
- [x] Domain resolution via `getWikiConfig().defaultDomain`

### C. Agent Tools — L1 on-demand
- [ ] Create wiki tools that agent can call:
  - `wiki_search(domain, query)` → returns matching article titles + snippets
  - `wiki_read(domain, slug)` → returns full article content
  - `wiki_list(domain)` → returns index
- [ ] Register as virtual tools in session (similar to how CodeGraph injects)
- [ ] Budget-aware: `wiki_read` checks remaining budget before returning full content
  - If over budget, return summary (first 500 tokens) + "use wiki_read_full for complete article"

### D. Feedback Loop — session findings → raw
- [x] After session ends, `saveSessionFindings()` in `wiki/feedback.ts`:
  - Waits for auto-summarizer, then saves to `wiki/<domain>/raw/session-<date>-<id>.md`
  - Only for meaningful sessions (≥3 turns, non-error)
  - Content: summary + key decisions + files modified
- [x] Raw material gets compiled on next `compile` trigger

## Acceptance Criteria
- [ ] Session start loads Wiki L0 (~2-3K tokens) automatically
- [ ] Budget manager correctly prioritizes: system > claude.md > wiki L0 > codegraph > wiki L1 > NM
- [ ] Agent can search and read wiki articles mid-session
- [ ] Budget gate prevents wiki from blowing context (hard cap per source)
- [ ] Context breakdown shows wiki tokens in web UI + Telegram
- [ ] Session findings auto-saved to raw/ on session end

## Files Touched
- `packages/server/src/services/context-budget.ts` — **new** (budget manager + feature toggles)
- `packages/server/src/services/ws-bridge.ts` — modify (injection + feedback hook)
- `packages/server/src/routes/settings.ts` — modify (feature toggle endpoints)
- `packages/server/src/wiki/feedback.ts` — **new** (session findings → raw)
- `packages/server/src/wiki/index.ts` — modify (re-export feedback)

## Dependencies
- Phase 1 complete (wiki store + retriever)
- Existing Context Estimator (being upgraded)
