# Companion v3 — Performance, Orchestration, QR Streaming & DevTools

> Generated: 2026-04-01 | Updated: 2026-04-02 (1DevTool deep analysis)
> Predecessor: plan-companion-v2.md (all 7 phases completed)

## Overview

Performance-first improvement pass, then flagship features (QR Stream Sharing, Workflow Templates), and developer tooling. Prioritized by impact: fix foundations → complete in-progress work → add differentiators.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Core Performance | ✅ Done | plan-companion-v3-phase1.md | Resume detection, terminal lock, debounced save, virtual screen, idle detection |
| 2 | Protocol & Capture | ✅ Done | plan-companion-v3-phase2.md | Virtual screen capture (WS namespacing deferred) |
| 3 | QR Stream Sharing | ✅ Done | plan-companion-v3-phase3.md | Flagship: shareable live session via QR code |
| 4 | Security & Monitoring | ✅ Done | plan-companion-v3-phase4.md | 40+ prompt injection patterns, analytics (Docker dashboard deferred) |
| 5 | DevTools & Polish | ✅ Done | plan-companion-v3-phase5.md | DB browser, themes, error tracking, command presets, prompt history (auto-updater deferred) |

## Related Plans (execute in parallel or after v3)

| Plan | Status | Summary |
|------|--------|---------|
| Workflow Templates | ⬚ Pending | **Agent orchestration** — pre-built workflow pipelines (Fix Bug, Multi-Agent Build, etc.) |
| Integrated DevTools | ⬚ Pending | Terminal PTY, code viewer, diff viewer, **multi-session layout** |
| Agent SDK Migration | 🔄 Ph1 Done | SDK polish (Ph2) + session features (Ph3) |
| Stream Bridge | ⬚ Pending | Web ↔ Telegram bidirectional streaming (4-6h quick win) |
| Scheduled Sessions | ⬚ Pending | Cron-based auto sessions |

## Key Decisions

- Performance (P0) before features — existing users benefit immediately
- QR Stream Sharing is standalone Phase 3 — flagship marketing feature
- **Workflow Templates extend existing debate engine** — not replace (1DevTool insight)
- **Virtual screen reconstruction** fixes garbled TUI output (1DevTool pattern)
- **40+ prompt injection patterns** ported from 1DevTool security analysis
- Docker dashboard is read-only monitoring only (not full CRUD)
- Database browser supports SQLite/Postgres/MySQL read-only queries
- Auto-updater uses Tauri 2 built-in updater with custom endpoint

## Risk Register

| Risk | Mitigation |
|------|------------|
| QR sharing exposes session data | Token-scoped read-only links, auto-expire after 24h |
| Terminal lock deadlocks | Timeout-based lock release (30s max hold) |
| Docker API access from Tauri | Use Bun sidecar to proxy Docker socket |
| DB browser SQL injection | Parameterized queries + read-only connection mode |
| Screen capture perf impact | Snapshot on-demand only, not continuous |
