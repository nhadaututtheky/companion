# Phase 4: Security & Monitoring

## Goal

Add prompt safety scanning, Docker container monitoring, and session analytics. Hardening and observability layer.

## Tasks

### 4.1 Prompt Risk Detection — DONE
- [x] Create `PromptScanner` service with rule engine — `packages/server/src/services/prompt-scanner.ts`
- [x] 40+ detection rules across 10 categories (shell injection, path traversal, privilege escalation, data exfiltration, destructive, encoded payloads, prompt injection, credential theft, network abuse, package attacks)
- [x] Severity levels: `info` (flag only), `warn` (show warning), `block` (prevent forwarding)
- [x] Hook into ws-bridge `handleUserMessageInternal` — scan before forwarding to CLI
- [x] `prompt_scan` WS event type — broadcasts scan results to browsers
- [x] Risk badge in session header (ShieldWarning icon, red=blocked, yellow=warnings)
- [x] Toast notifications for scan results (error for blocked, warning for risks)
- [x] Settings toggle in General tab for enabling/disabling prompt scanning
- [ ] Unit tests for detection patterns — deferred (no test framework configured)

### 4.2 Docker Dashboard (Read-Only) — DEFERRED

> **Why deferred**: Separate concern from core AI agent orchestration.
> Requires Docker socket mount + env-specific handling (Windows/Linux/DinD).
> High complexity, zero core UX value. Better as a standalone plugin/feature post-v3.
> Will revisit if users request container management integration.

### 4.3 Session Analytics — DONE
- [x] Session records already have cost/token/turn tracking fields (from prior phases)
- [x] CLI output parsing for token usage already in ws-bridge (system:init handler)
- [x] Extended `/api/stats` with: dailyCost, recentSessions detail, avgDurationMs
- [x] Analytics page — `packages/web/src/app/analytics/page.tsx` (new)
- [x] Charts: daily sessions bar chart, daily cost bar chart (CSS-only, no deps)
- [x] KPI cards: today, week, streak, all-time, avg duration
- [x] Model usage breakdown with progress bars
- [x] Top projects (30d) with bar indicators
- [x] Recent sessions table with links, model badges, cost, turns, tokens, duration
- [x] "View full analytics" link from StatsPanel sidebar

## Acceptance Criteria

- [x] Dangerous prompts show warning badge + toast before execution
- [x] `block`-level prompts are prevented from forwarding to CLI
- [ ] ~~Docker containers displayed with status, ports, uptime~~ (deferred)
- [ ] ~~Container restart works with confirmation~~ (deferred)
- [ ] ~~Missing Docker socket shows graceful fallback~~ (deferred)
- [x] Analytics page shows cost per session and daily trends
- [x] Token counting is best-effort (parsed from CLI output)

## Status: 4.1 DONE, 4.3 DONE, 4.2 DEFERRED

## Files Touched

- `packages/server/src/services/prompt-scanner.ts` — new
- `packages/server/src/services/docker-monitor.ts` — new
- `packages/server/src/services/ws-bridge.ts` — modify (scanner hook, token parsing)
- `packages/server/src/routes/docker.ts` — new
- `packages/server/src/db/schema.ts` — modify (analytics columns)
- `packages/server/src/__tests__/prompt-scanner.test.ts` — new
- `packages/web/src/components/chat/risk-badge.tsx` — new
- `packages/web/src/app/docker/page.tsx` — new
- `packages/web/src/app/analytics/page.tsx` — new
- `packages/web/src/app/settings/` — modify (scanner toggle)

## Dependencies

- Phase 2 completed (WS namespacing for clean message hooks)
- Docker socket access requires host mount in Docker Compose
