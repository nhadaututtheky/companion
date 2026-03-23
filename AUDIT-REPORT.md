# Audit Report: Companion

**Date:** 2026-03-22
**Auditor:** Rune Audit (claude-opus-4-6)
**Scope:** Full 8-phase + 4-perspective audit (User, Developer, Designer, Business)

---

- **Verdict**: ⚠️ WARNING
- **Overall Health**: **5.4/10**
- **Total Findings**: 42 (CRITICAL: 7, HIGH: 12, MEDIUM: 13, LOW: 6, INFO: 4)
- **Framework Checks Applied**: React 19, Next.js 16, Node.js/Hono, Bun, Docker, Zustand

---

## Health Score

| Dimension        | Score  | Notes                                                    |
|------------------|:------:|----------------------------------------------------------|
| Security         | 4/10   | 2 critical vulns, 5 high — path traversal, IP spoofing   |
| Code Quality     | 4/10   | 5 modules critical (CC>100), 44/100 autopsy score        |
| Architecture     | 7/10   | Clean layers, no circular deps, but oversized modules    |
| Performance      | 5/10   | Sequential awaits in hot paths, no code splitting        |
| Dependencies     | 7.5/10 | 1 moderate CVE (dev-only), zod v3→v4 migration overdue   |
| Infrastructure   | 5/10   | CI builds but doesn't test/lint, no monitoring           |
| Documentation    | 6/10   | README good, missing API docs + deployment guide         |
| UI/UX Design     | 5/10   | 100+ inline styles, partial dark mode, no error boundary |
| Mesh Analytics   | 2/10   | No skill tracking data — all sessions show 0 invocations |
| **Overall**      | **5.4/10** | **WARNING — ship-blocking issues exist**            |

---

## Phase Breakdown

| Phase            | Issues |
|------------------|--------|
| Dependencies     | 4      |
| Security         | 17     |
| Code Quality     | 8      |
| Architecture     | 5      |
| Performance      | 6      |
| Infrastructure   | 5      |
| Documentation    | 3      |
| UI/UX Design     | 8      |
| Mesh Analytics   | 1      |

---

## 🔴 CRITICAL Findings (Fix Immediately)

### C-1: Path traversal — `startsWith` check bypassable
**Files:** `packages/server/src/routes/filesystem.ts:61,186` | `packages/server/src/routes/sessions.ts:136`

`resolved.startsWith(root)` passes for `/mnt/c_evil/secret` when root is `/mnt/c`. Classic path prefix confusion.

**Fix:**
```typescript
const allowed = roots.some((root) =>
  resolved === root || resolved.startsWith(root + "/") || resolved.startsWith(root + "\\")
);
```

---

### C-2: Rate limiter IP spoofing bypass
**File:** `packages/server/src/middleware/rate-limiter.ts:53-55`

Reads `x-real-ip` header without proxy trust verification. Attacker sets `x-real-ip: 127.0.0.1` → bypasses ALL rate limits (localhost check returns true).

**Fix:** Only trust `x-real-ip` from known proxy IPs. Use socket address as fallback.

---

### C-3: Docker runs as root with full host filesystem access
**File:** `Dockerfile:51-69` | `docker-compose.yml:19-21`

No `USER` directive in Dockerfile. Drive mounts `C:/` and `D:/` are read-write. Root container = unrestricted host filesystem write access.

**Fix:** Add `USER companion` before CMD. Make drive mounts `:ro` unless write needed.

---

### C-4: `anti-cdp.ts` — 2,470 LOC, CC~513, 50+ silent catch blocks
**File:** `packages/server/src/services/anti-cdp.ts`

Cyclomatic complexity 513, nesting depth 15 at line 977. 50+ `catch(e) {}` blocks silently swallow errors throughout. Highest-risk file in codebase (score: 12/100).

**Fix:** Split into `cdp-transport.ts` / `dom-scraper.ts` / `message-extractor.ts`. Replace silent catches with proper error handling.

---

### C-5: `ws-bridge.ts` — 1,391 LOC danger zone with zero tests
**File:** `packages/server/src/services/ws-bridge.ts`

CC~135, max nesting 9. 6 git changes (high churn). 11 downstream dependents. Zero test coverage on the file that manages ALL session lifecycles.

**Fix:** Extract `SessionLifecycleManager` + `MessageRouter`. Add integration tests immediately.

---

### C-6: Settings API exposes secrets in plaintext
**Files:** `packages/server/src/routes/settings.ts:24-37` | `packages/server/src/services/ai-client.ts:58`

`GET /api/settings` returns ALL settings including `ai.apiKey`, `ai.openrouterApiKey`, Telegram bot tokens. Any authenticated client can exfiltrate all credentials.

**Fix:** Mask sensitive keys (`*.apiKey`, `*.token`, `*.secret`) in GET responses. Return `"***"` for values.

---

### C-7: Test coverage catastrophically low (<5%)
**Files:** 4 test files for ~85 TS files across project

Server: ~5% coverage (4 test files). Web: 0% (no test files). The 3 highest-churn files (`ring-window.tsx` ×13, `ring-selector.tsx` ×13, `sessions.ts` ×9) have zero coverage. CI doesn't run tests.

**Fix:** Add tests for danger zone files first. Add `bun test` to CI workflow.

---

## 🟠 HIGH Findings (Fix Before Production)

### H-1: No HTTP security headers
**File:** `packages/server/src/index.ts:108-113`

Missing: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`.

**Fix:** `app.use("*", secureHeaders())` from `hono/secure-headers`.

---

### H-2: MCP `permissionMode` accepts arbitrary strings
**File:** `packages/server/src/mcp/tools.ts:57`

REST API uses `z.enum()` validation, but MCP path accepts `z.string()` — inconsistent security boundary.

**Fix:** Apply same enum validation: `z.enum(["default", "acceptEdits", "bypassPermissions", "plan"])`.

---

### H-3: Sequential `await` in debate engine — N× slower
**File:** `packages/server/src/services/debate-engine.ts:376-411`

Each debate agent waits for previous agent's AI call. 3 agents = 3× latency.

**Fix:** `Promise.all(state.agents.map(agent => callDebateAI(...)))`.

---

### H-4: Sequential broadcast in Ring — blocks UI
**File:** `packages/web/src/components/ring/ring-window.tsx:93-103`

Broadcasting to N sessions sequentially. 3 sessions = 300ms+ delay.

**Fix:** `Promise.all(linkedSessionIds.map(sid => api.sessions.message(sid, content)))`.

---

### H-5: No React error boundaries anywhere
**File:** `packages/web/src/app/layout.tsx`

No error boundary in layout or any page. Unhandled render error = white screen for user.

**Fix:** Add `<ErrorBoundary>` wrapper in root layout with fallback UI.

---

### H-6: 10 components exceed 300 LOC limit
| Component | LOC |
|-----------|-----|
| `settings/page.tsx` | 1,312 |
| `new-session-modal.tsx` | 1,107 |
| `channel-panel.tsx` | 687 |
| `telegram-preview.tsx` | 514 |
| `telegram-bot-card.tsx` | 479 |
| `message-feed.tsx` | 465 |
| `ring-window.tsx` | 461 |
| `expanded-session.tsx` | 449 |
| `directory-browser.tsx` | 421 |
| `activity-terminal.tsx` | 383 |

---

### H-7: 100+ inline styles across web package
Most inline `style={{}}` use hardcoded colors (`#4285F4`, `#EA4335`, etc.) instead of CSS variables/Tailwind classes. Breaks theme consistency and dark mode.

---

### H-8: CI/CD doesn't run tests or linting
**File:** `.github/workflows/docker-publish.yml`

Builds and publishes Docker image directly — no test gate, no lint gate, no type check.

**Fix:** Add `bun test && bun run lint && tsc --noEmit` before `docker build`.

---

### H-9: No monitoring or error tracking
No Sentry, Datadog, or any APM integration. Production errors only visible in server logs with no alerting.

---

### H-10: CORS fallback returns first allowed origin instead of rejecting
**File:** `packages/server/src/index.ts:109`

Disallowed origins get `allowedOrigins[0]` instead of `null`. Should reject outright.

---

### H-11: WebSocket API key accepted via query parameter
**File:** `packages/server/src/index.ts:149`

API keys in URLs appear in logs, browser history, and proxy access logs.

---

### H-12: `project.envVars` stored and returned unencrypted
**Files:** `packages/server/src/db/schema.ts:11` | `packages/server/src/routes/projects.ts:54-67`

Per-project env vars (potentially containing secrets) stored as plaintext JSON, returned verbatim in API responses.

---

## 🟡 MEDIUM Findings

| # | Finding | File |
|---|---------|------|
| M-1 | Settings route has direct DB calls (no service layer) | `routes/settings.ts:26-80` |
| M-2 | Telegram route has inline DB calls | `routes/telegram.ts:99-133` |
| M-3 | No API versioning (`/api/` not `/api/v1/`) | `routes/index.ts` |
| M-4 | No database indexes declared for frequent queries | `db/schema.ts` |
| M-5 | N+1 pattern in `getChannel` (3 queries per fetch) | `services/channel-manager.ts:160-185` |
| M-6 | No WebSocket message size limit | `index.ts:172-174` |
| M-7 | `dangerouslySetInnerHTML` in layout without CSP | `web/app/layout.tsx:27` |
| M-8 | Dead code: 3 unused components | `stats-grid.tsx`, `three-column.tsx`, `fan-layout.ts` |
| M-9 | `telegram-bridge.ts` at 1,155 LOC (CC~147) | `services/telegram-bridge.ts` |
| M-10 | Touch targets < 44px (step pills 22px, bubbles 40px) | `new-session-modal.tsx:93`, `ring-window.tsx` |
| M-11 | Missing `aria-label` on 2-3 inputs | `projects/page.tsx:149`, `channel-panel.tsx:205` |
| M-12 | Dark mode broken by hardcoded hex colors | `activity-terminal.tsx:21-27`, `ring-window.tsx:9` |
| M-13 | Zustand selector creates new array each render | `ring-window.tsx:29-43` |

---

## 🟢 LOW Findings

| # | Finding | File |
|---|---------|------|
| L-1 | `bun.lock` in `.gitignore` (should be committed) | `.gitignore:18` |
| L-2 | `timingSafeEqual` compares `a` with itself (no-op) | `middleware/auth.ts:16-18` |
| L-3 | Health endpoint exposes version + DB table count | `routes/health.ts:17-47` |
| L-4 | No React.memo on Ring list items | `ring-window.tsx:180-270` |
| L-5 | `session-store.ts` at 584 LOC (at-risk, score 48) | `services/session-store.ts` |
| L-6 | Weak dev API key (`companion-dev-2026`) | `.env:1` |

---

## ℹ️ INFO

| # | Observation |
|---|-------------|
| I-1 | No CSRF needed (API key auth, not cookies) — but add if cookies introduced |
| I-2 | Telegram bot auth correctly implements chat/user allowlists |
| I-3 | All DB operations use Drizzle ORM — no raw SQL injection risk |
| I-4 | Mesh metrics tracking not producing data — all 51 sessions show 0 skill invocations |

---

## ✅ Positive Findings

1. **TypeScript strict mode everywhere** — `noUncheckedIndexedAccess` enabled, only 1 `any` in production code
2. **Zero circular dependencies** — clean dependency graph across all modules
3. **Zustand stores are exemplary** — all 5 stores use proper immutable patterns, narrow selectors, isolated concerns
4. **API design is consistent** — RESTful verbs, pagination, consistent error format (`{ success, error }`), proper HTTP status codes
5. **Drizzle ORM eliminates SQL injection** — no raw queries with user input anywhere
6. **ESLint configured strict** — `no-explicit-any: error`, only 11 warnings total across entire codebase
7. **WebSocket cleanup is correct** — `use-websocket.ts` properly clears timeouts and closes connections
8. **`prefers-reduced-motion` respected** — both CSS and JS check for motion sensitivity

---

## 4-Perspective Analysis

### 👤 User Perspective

| Aspect | Rating | Detail |
|--------|--------|--------|
| **Core UX** | 6/10 | Chat works well, Ring/Debate is innovative, but no error boundary = white screen on crash |
| **Responsiveness** | 5/10 | Mobile CSS exists but hardcoded widths (260px, 300px, 320px sidebars) limit flexibility |
| **Loading feedback** | 7/10 | Skeleton loaders present, CircleNotch spinners for async operations |
| **Accessibility** | 5/10 | Most buttons have aria-labels, but small touch targets (22px, 40px), missing input labels |
| **Dark mode** | 5/10 | CSS variables exist but 100+ hardcoded hex colors override theme in many places |
| **Reliability** | 4/10 | No test suite = bugs ship to users; no monitoring = silent failures in production |

**User pain points:**
- Debate mode waits sequentially — feels sluggish with 3+ agents
- Ring broadcast blocks UI while sending to multiple sessions
- Settings page is a massive scroll — no navigation/tabs within it
- No error recovery — unhandled error = restart needed

---

### 🛠️ Developer Perspective

| Aspect | Rating | Detail |
|--------|--------|--------|
| **Onboarding** | 7/10 | README covers quick start, Docker + dev mode documented |
| **Code quality** | 5/10 | TypeScript strict is great, but 5 modules are critically complex |
| **Architecture** | 7/10 | Clean layers, good separation — but monolithic files need splitting |
| **Testing** | 2/10 | 4 test files, <5% coverage, CI doesn't run tests |
| **DX tooling** | 6/10 | ESLint configured, Prettier installed, hot reload works |
| **Maintainability** | 4/10 | `anti-cdp.ts` (2,470 LOC), `ws-bridge.ts` (1,391 LOC) are unmaintainable |

**Developer pain points:**
- Touching `ws-bridge.ts` is terrifying — 1,391 LOC, zero tests, 11 dependents
- `anti-cdp.ts` is a 2,470-line black box with 50+ silent catch blocks
- No API docs — must read route handlers to understand endpoints
- No test gate in CI — broken code can ship to production

---

### 🎨 Designer/UI-UX Perspective

| Aspect | Rating | Detail |
|--------|--------|--------|
| **Design system** | 5/10 | CSS variables defined in globals.css but not used consistently |
| **Component quality** | 4/10 | 10 components > 300 LOC, heavy inline styles |
| **Visual consistency** | 5/10 | Google color palette defined but scattered as hardcoded hex across 40 files |
| **Animation** | 7/10 | Ring magnification, smooth transitions, respects reduced-motion |
| **Accessibility** | 5/10 | Focus rings exist globally, but some inputs lack labels, small touch targets |
| **Responsive** | 5/10 | Mobile breakpoint exists (@media 767px) but sidebars use hardcoded px |

**Design debt:**
- 100+ inline `style={{}}` — violates "no inline styles" rule
- Colors like `#4285F4`, `#a855f7` appear 30+ times as raw hex instead of `var(--color-google-blue)`
- Settings page (1,312 LOC) is a single scrollable page — needs tab navigation
- `new-session-modal` (1,107 LOC) should be a multi-step wizard with extracted sub-components
- No design tokens for spacing — inconsistent padding/margins

---

### 💼 Business Perspective

| Aspect | Rating | Detail |
|--------|--------|--------|
| **Ship readiness** | 4/10 | Security vulns (path traversal, IP spoofing) block production deployment |
| **Monetization** | 7/10 | License system + Polar.sh payments integrated, tier-based features |
| **Scalability** | 5/10 | SQLite is single-user; sequential debate = poor multi-agent performance |
| **Competitive edge** | 8/10 | Ring/Debate mode is unique, Telegram integration is strong |
| **Reliability** | 3/10 | No tests, no monitoring, no error tracking = customer-facing failures |
| **Time to market** | 6/10 | Core features work, but security fixes needed before public launch |

**Business risks:**
1. **Security blockers**: Path traversal + IP spoofing + secrets exposure must be fixed before any public deployment
2. **No monitoring**: Production issues will be reported by users, not detected proactively
3. **No tests**: Every feature addition risks breaking existing functionality
4. **SQLite limitation**: Single concurrent writer — fine for self-hosted, problematic if scaling to multi-tenant SaaS
5. **Tech debt accumulation**: 5 critical modules getting worse with each change

---

## Mesh Analytics

| Metric | Value |
|--------|-------|
| Total sessions tracked | 51 |
| Skill invocations | 0 (all sessions) |
| Tool calls range | 2–186 per session |
| Avg session duration | ~130 min |
| Skills.json | Empty (`{}`) |
| Chains data | Not available |

**Verdict:** Mesh tracking is not producing useful data. All 51 sessions show `"skill_invocations": 0` and `"skills_used": []`. The hooks that populate skill metrics are either not firing or not installed for this project.

**Action:** Verify `.rune/hooks/` configuration and ensure skill tracking hooks are active.

---

## Top Priority Actions (Ordered by Impact)

### 🔴 Week 1 — Security & Stability (Ship-Blockers)

| # | Action | File(s) | Impact |
|---|--------|---------|--------|
| 1 | Fix `startsWith` path traversal | `filesystem.ts:61,186`, `sessions.ts:136` | Prevents unauthorized file access |
| 2 | Fix rate limiter IP spoofing | `rate-limiter.ts:53-55` | Prevents rate limit bypass |
| 3 | Mask secrets in GET /api/settings | `settings.ts:24-37` | Prevents credential exfiltration |
| 4 | Add HTTP security headers | `index.ts:108-113` | OWASP compliance |
| 5 | Add MCP permissionMode enum validation | `mcp/tools.ts:57` | Closes privilege escalation vector |
| 6 | Fix CORS to reject unknown origins | `index.ts:109` | Correct CORS behavior |
| 7 | Remove WS API key from query param | `index.ts:149` | Prevent key leakage in logs |

### 🟠 Week 2 — Testing & CI

| # | Action | Impact |
|---|--------|--------|
| 8 | Add `bun test` + `tsc --noEmit` to CI workflow | Prevents broken code shipping |
| 9 | Write tests for `ws-bridge.ts` (danger zone) | Protect critical session lifecycle |
| 10 | Write tests for `session-store.ts` | Protect state management |
| 11 | Add React error boundary in layout | Prevent white-screen crashes |

### 🟡 Week 3-4 — Code Quality & Performance

| # | Action | Impact |
|---|--------|--------|
| 12 | Parallelize debate engine AI calls | 2-3× faster debates |
| 13 | Parallelize Ring broadcast | Instant multi-session broadcast |
| 14 | Split `anti-cdp.ts` (2,470 LOC → 3 files) | Maintainability |
| 15 | Split `ws-bridge.ts` (1,391 LOC → 2-3 files) | Reduce risk |
| 16 | Extract settings service from route | Clean architecture |
| 17 | Replace 100+ inline styles with CSS vars/Tailwind | Theme consistency |

### 🔵 Month 2 — Polish & Scale

| # | Action | Impact |
|---|--------|---------|
| 18 | Split mega-components (settings 1,312, modal 1,107 LOC) | Developer experience |
| 19 | Add Sentry/error tracking | Production visibility |
| 20 | Plan zod v3→v4 migration | Resolve peer dependency tension |
| 21 | Add database indexes | Query performance |
| 22 | Add API documentation | Developer onboarding |
| 23 | Delete dead code (stats-grid, three-column, fan-layout) | Clean codebase |

---

## Follow-up Timeline

- **Verdict: WARNING** → Re-audit in 2-3 weeks after security fixes (Week 1 actions)
- After security fixes: health should jump to ~6.5/10
- After testing + CI: health should reach ~7.5/10
- Target: **PASS (8+/10)** by end of Month 2

---

*Report saved to: `AUDIT-REPORT.md`*
*Generated by Rune Audit — 8 phases, 4 perspectives, 8 parallel agents*
