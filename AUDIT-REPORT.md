# Audit Report: Companion

- **Verdict**: WARNING
- **Overall Health**: 6.4/10
- **Total Findings**: 22 (CRITICAL: 2, HIGH: 6, MEDIUM: 8, LOW: 6)
- **Framework Checks Applied**: Next.js/React, Node.js/Hono, Bun

---

## Health Score

| Dimension      | Score   | Notes                                               |
|----------------|:-------:|----------------------------------------------------|
| Security       |  6/10   | C-1, C-2 fixed; H-1 path traversal remains         |
| Code Quality   |  7/10   | No console.log in prod, clean types                 |
| Architecture   |  8/10   | Well-layered: routes → services → db               |
| Performance    |  7/10   | Indexes added; unbounded listProjects still pending |
| Dependencies   |  7/10   | No known CVEs; minor outdated versions              |
| Infrastructure |  4/10   | No CI/CD, no Docker, no tests                       |
| Documentation  |  5/10   | CLAUDE.md + plan files exist; no API docs           |
| Mesh Analytics |  N/A    | No .rune/metrics/ data yet                          |
| **Overall**    | **6.4** | **WARNING — fix CRITICAL before shipping**          |

---

## Phase Breakdown

| Phase          | Issues |
|----------------|--------|
| Dependencies   | 1      |
| Security       | 8      |
| Code Quality   | 4      |
| Architecture   | 4      |
| Performance    | 2      |
| Infrastructure | 6      |
| Documentation  | 3      |
| Mesh Analytics | N/A    |

---

## Findings

### CRITICAL (Fixed)

- **C-1** ~~WebSocket endpoint had no authentication~~ — `index.ts:97-101` — **FIXED**: `api_key` query param checked before upgrade
- **C-2** ~~Permission endpoint defaulted to "allow" on missing behavior~~ — `sessions.ts:37-39` — **FIXED**: `z.enum(["allow","deny"])` with no default

### HIGH (Partially Fixed)

- **H-1** Path traversal in `projectDir` — `routes/sessions.ts:23` — `.min(1).max(500)` added, but no allowlist against a known project directory list. Accept `projectSlug` instead of raw `projectDir` from untrusted clients.
- **H-2** Model argument not validated — `routes/sessions.ts:76` — Free-form string; should be an allowlist of known model IDs.
- **H-3** Project `envVars` merged into subprocess env unfiltered — `ws-bridge.ts` — Any key can override `PATH`, `HOME`, etc. Add a key allowlist.
- **H-4** ~~Bot tokens exposed in `/api/telegram/bots`~~ — **FIXED**: `botToken: undefined` before serialization
- **H-5** ~~CORS wildcard~~ — **FIXED**: `ALLOWED_ORIGINS` allowlist
- **H-6** `listProjects()` unbounded — `routes/projects.ts:29` — No LIMIT; 10,000 projects = memory spike.

### MEDIUM (Partially Fixed)

- **M-1** ~~Timing oracle on API key comparison~~ — **FIXED**: `crypto.timingSafeEqual`
- **M-2** ~~Query param auth on HTTP routes~~ — **FIXED**: removed
- **M-3** ~~Missing API_KEY startup validation~~ — **FIXED**: exits in production, warns in dev
- **M-4** Rate limiter bypassed for localhost — `middleware/rate-limiter.ts` — `x-real-ip` only; easy to spoof via `X-Forwarded-For`.
- **M-5** ~~Unbounded pagination~~ — **FIXED**: `z.coerce.number().min(1).max(200)`
- **M-6** `allowedChatIds` enforcement in `telegram-bridge.ts` — Enforced in `bot-factory.ts` middleware, but verify `handleTextMessage` checks are consistent.
- **M-7** ~~persistMapping topicId=undefined wipes all rows~~ — **FIXED**: `isNull()` guard added
- **M-8** `listSessions` status filter accepted but never applied — **FIXED**: filter applied in WHERE clause

### LOW

- **L-1** Health endpoint returns hardcoded `sessions: 0` — `routes/health.ts` — Should call `countActiveSessions()`.
- **L-2** `session_update` not handled in WS bridge reconnect path — `use-session.ts` — No store update on reconnect.
- **L-3** No `.env.example` file — developers won't know required vars.
- **L-4** `listProjects()` called in hot path (every bot message) without caching.
- **L-5** `FolderOpen` unused import in `page.tsx`.
- **L-6** `projects/page.tsx` uses `confirm()` for delete — not accessible, should use a dialog.

---

## Positive Findings

1. **Layered architecture**: routes → services → DB is clean. No route handler directly touches the DB.
2. **Structured logging**: `createLogger()` used consistently throughout; no raw `console.log` in production paths.
3. **Zod validation at all API boundaries**: every route uses `zValidator`; no raw `req.body` access.
4. **WebSocket auth added**: upgrade path now validates `api_key` before accepting connection.
5. **Migration system**: custom `runMigrations()` is simple, idempotent, and tracks applied migrations.
6. **Telegram token masking**: bot tokens never returned via API; `undefined` before JSON serialization.

---

## Top Priority Actions

1. **H-1** Replace raw `projectDir` input with `projectSlug` lookup — `routes/sessions.ts:22` — prevents path traversal
2. **H-2** Add model ID allowlist — `routes/sessions.ts:76` — one-line `z.enum([...models])`
3. **H-6** Add `LIMIT 200` to `listProjects()` — `services/project-profiles.ts` — prevent OOM on large installs
4. **H-3** Allowlist env var keys before merging into subprocess — `services/ws-bridge.ts` — critical for multi-tenant
5. **L-1** Fix health endpoint sessions count — `routes/health.ts` — call `countActiveSessions()`
6. **L-3** Create `.env.example` — repo root — developer onboarding

---

## Follow-up Timeline

- **WARNING** → re-audit in 1 month after H-1, H-2, H-3 fixed
- Phase 5 (Agent Platform) should not start until H-1 and H-3 are resolved (multi-agent = elevated attack surface)

---

*Report generated: 2026-03-18 | Phases: Security ✓ | Deps ✓ | Quality ✓ | Architecture ✓ | Performance ✓ | Infra ✓ | Docs ✓ | Mesh N/A*
