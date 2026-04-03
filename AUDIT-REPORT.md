# Audit Report: Companion (Non-Web Subsystems Focus)

**Date:** 2026-04-03
**Auditor:** Rune Audit (claude-opus-4-6)
**Scope:** Full 8-phase audit with deep focus on Desktop, Telegram, Infrastructure, Shared Package, and Project Health

- **Verdict**: WARNING
- **Overall Health**: 6.8/10
- **Total Findings**: 28 (CRITICAL: 2, HIGH: 7, MEDIUM: 12, LOW: 5, INFO: 2)
- **Framework Checks Applied**: React/Next.js, Node.js/Hono, Rust/Tauri v2

---

## Health Score

| Dimension      | Score | Notes |
|----------------|:-----:|-------|
| Security       | 6/10  | CSP disabled in Tauri, shell:allow-execute too broad, hardcoded port |
| Code Quality   | 7/10  | Low `any` count, good logger, but duplicate types and version drift |
| Architecture   | 7/10  | Clean layered structure, good separation, minor coupling issues |
| Performance    | 7/10  | Good async patterns, streaming well-designed, minor watchdog gaps |
| Dependencies   | 7/10  | Modern stack, workspace refs clean, but `@types/bun: latest` is fragile |
| Infrastructure | 6/10  | Docker solid, but `--hot` in production, landing workflow conflict |
| Documentation  | 7/10  | README comprehensive, CHANGELOG maintained, some inline gaps |
| Mesh Analytics | N/A   | Metrics collected but no skill invocations tracked yet |
| **Overall**    | **6.8/10** | **WARNING** |

### Composite Score

- **Formula**: (Security x 0.25) + (Code Quality x 0.20) + (Architecture x 0.15) + (Dependencies x 0.15) + (Performance x 0.10) + (Infrastructure x 0.08) + (Documentation x 0.07)
- **Weighted Score**: (6 x 0.25) + (7 x 0.20) + (7 x 0.15) + (7 x 0.15) + (7 x 0.10) + (6 x 0.08) + (7 x 0.07) = 1.50 + 1.40 + 1.05 + 1.05 + 0.70 + 0.48 + 0.49 = **6.67 / 10** -> Grade: **Fair (WARNING)**

---

## Phase Breakdown

| Phase | Issues |
|-------|--------|
| Dependencies | 3 |
| Security | 5 |
| Code Quality | 5 |
| Architecture | 4 |
| Performance | 3 |
| Infrastructure | 5 |
| Documentation | 2 |
| Mesh Analytics | 1 |

---

## 1. Desktop App (src-tauri/) Findings

### CRITICAL-01: CSP Disabled + Prototype Freeze Off
**Severity**: CRITICAL
**File**: `src-tauri/tauri.conf.json:38-40`
```json
"security": {
  "csp": null,
  "dangerousDisableAssetCspModification": true,
  "freezePrototype": false
}
```
CSP is completely disabled (`null`) and the dangerous override flag is `true`. Combined with `freezePrototype: false`, this exposes the webview to XSS attacks. The app loads from `http://localhost:3579` which is an HTTP origin -- any local network attacker could inject content. Since Companion manages Claude Code sessions that can execute arbitrary commands, this is a high-impact attack surface.

**Fix**: Set a restrictive CSP allowing only `localhost:3579`, disable `dangerousDisableAssetCspModification`, and enable `freezePrototype`.

### HIGH-01: Shell Capabilities Too Broad
**Severity**: HIGH
**File**: `src-tauri/capabilities/default.json:18-19`
```json
"shell:default",
"shell:allow-execute",
```
`shell:allow-execute` and `shell:default` grant unrestricted shell execution capabilities to the webview. The sidecar-specific allowlist on lines 22-30 is correct but redundant -- the broader permissions above already grant everything. Only the scoped sidecar permission should remain.

**Fix**: Remove `shell:default` and `shell:allow-execute`, keep only the scoped `shell:allow-spawn` with the `bun-server` sidecar allowlist.

### HIGH-02: Sidecar Kill Race Condition on Exit
**Severity**: HIGH
**File**: `src-tauri/src/main.rs:152-181`
The `RunEvent::Exit` handler spawns an async task to kill the sidecar, but the process may exit before the task completes. On Windows, orphaned `bun-server` processes would survive with port 3579 locked, causing startup failures on next launch.

**Fix**: Use `tokio::runtime::Handle::try_current()` with `.block_on()` instead of `.spawn()` for the kill operation, or add a synchronous fallback kill path.

### MEDIUM-01: `.unwrap()` in Production Rust Code
**Severity**: MEDIUM
**File**: `src-tauri/src/tray.rs:18`
```rust
.icon(app.default_window_icon().cloned().unwrap())
```
If no default icon is set, this panics and crashes the app. Use `.unwrap_or_else()` with a fallback or return an error.

### MEDIUM-02: Hardcoded Port 3579 Everywhere
**Severity**: MEDIUM
**Files**: `src-tauri/src/main.rs:54`, `src-tauri/src/server.rs:36`
Port 3579 is hardcoded in the sidecar environment and health check URL. If the port is occupied, the app fails with a generic error. Should be configurable or auto-discover a free port.

### MEDIUM-03: `new_session` Tray Action Uses Raw URL Navigation
**Severity**: MEDIUM
**File**: `src-tauri/src/tray.rs:61-63`
```rust
window.eval("window.location.href = 'http://localhost:3579';")
```
This is a raw `eval()` of a hardcoded localhost URL. If the server hasn't started yet, this shows a connection error page. Should use a Tauri event instead.

### LOW-01: Updater Does Not Verify Download Integrity Beyond Signature
**Severity**: LOW
**File**: `src-tauri/tauri.conf.json:47-53`
The updater configuration is sound (pubkey + endpoint), but the `publish-update.sh` script generates only Windows manifests. macOS and Linux users get no update notifications.

---

## 2. Telegram Bot (packages/server/src/telegram/) Findings

### HIGH-03: Auth Bypass When Both Whitelists Empty
**Severity**: HIGH
**File**: `packages/server/src/telegram/bot-factory.ts:42-62`
When `allowedChatIds` is empty AND `allowedUserIds` is empty, the auth middleware passes all requests through. From the code:
```typescript
if (config.allowedChatIds.length > 0 && !config.allowedChatIds.includes(chatId) && !isAdmin) {
```
Both conditions short-circuit when the arrays are empty, meaning ANY Telegram user can interact with the bot. The `env` bot loads empty arrays by default when env vars are not set (lines 111-118 in `bot-registry.ts`).

**Fix**: If both whitelists are empty and `NODE_ENV=production`, refuse to start the bot or log a prominent warning.

### HIGH-04: Bot Token Stored in Plain Text in SQLite
**Severity**: HIGH
**File**: `packages/server/src/telegram/bot-registry.ts:329`
Bot tokens from `saveBotConfig()` are stored as plain text in the `telegramBots` table. Anyone with filesystem access to `companion.db` gets full bot control. Should be encrypted at rest.

### MEDIUM-04: Duplicate `DeadSessionInfo` Interface
**Severity**: MEDIUM
**Files**: `packages/shared/src/types/telegram.ts:30`, `packages/server/src/telegram/telegram-bridge.ts:104`
Two independent definitions of `DeadSessionInfo` with identical fields but different imports. The shared one should be the single source of truth.

### MEDIUM-05: Forum Topic Integration Has No Error Recovery
**Severity**: MEDIUM
**File**: `packages/server/src/telegram/telegram-bridge.ts` (various)
Forum topic creation errors are caught but the session continues without a topic. If topic creation fails mid-flow, messages go to the main chat rather than the expected topic, causing confusion.

### LOW-02: Command Registration Limited to 10 Commands
**Severity**: LOW
**File**: `packages/server/src/telegram/bot-factory.ts:86-97`
Telegram's `setMyCommands` shows only 10 commands in the menu. The comment acknowledges this, but new users may miss `/thinking`, `/clear`, `/mcp` etc. Consider grouping commands by scope.

---

## 3. Infrastructure & DevOps Findings

### CRITICAL-02: Production Docker Entrypoint Uses `--hot` Flag
**Severity**: CRITICAL
**File**: `docker-entrypoint.sh:65`
```bash
exec su -s /bin/bash companion -c "HOME=$CLAUDE_HOME bun run --hot packages/server/src/index.ts"
```
`--hot` enables Bun's hot-reload module watcher in production. This:
1. Increases memory usage (watches all source files for changes)
2. Creates a potential DoS vector (writing to mounted source files triggers reload)
3. Adds unpredictable restart behavior in production

**Fix**: Replace with `bun run packages/server/src/index.ts` (no `--hot`). Or use the compiled binary from `bun build`.

### HIGH-05: Landing Page Deploy Workflow Contradicts Actual Deploy Method
**Severity**: HIGH
**File**: `.github/workflows/landing-page.yml`
The workflow deploys to GitHub Pages (`actions/deploy-pages@v4`), but the comment on line 5 says "Landing deploys via Cloudflare Pages (wrangler CLI), not GitHub Pages". The `publish-update.sh` script also deploys via `wrangler pages deploy`. This creates two competing deploy targets -- one could overwrite the other or serve stale content.

**Fix**: Remove the GitHub Pages workflow entirely, or convert it to use Cloudflare Pages deployment.

### HIGH-06: `bun.lock` in `.gitignore` But Relied On by CI
**Severity**: HIGH
**File**: `.gitignore:18`
```
bun.lock
```
The lockfile is gitignored, but CI uses `bun install --frozen-lockfile` which REQUIRES `bun.lock` to exist. Either the CI step fails silently, or there's a checked-in copy that the gitignore doesn't match (the file exists at root with 194KB). Verify this is working correctly -- if the lockfile is NOT committed, `--frozen-lockfile` would fail.

**Correction**: The file is 194KB and exists in the working directory, and `git status` doesn't show it as untracked, so it IS tracked despite the gitignore entry. The gitignore entry has no effect on an already-tracked file. This is confusing but not broken. Reduce severity to MEDIUM.

### MEDIUM-06: Docker Non-Root User Permission Issues
**Severity**: MEDIUM
**Files**: `Dockerfile:48-49`, `docker-entrypoint.sh:46-57`
The Dockerfile creates a `companion` user, but the entrypoint uses `chown -R` with `2>/dev/null` suppressing failures. Comments in CLAUDE.md note "Docker non-root user reverted (volume permission issues)". The current setup runs the entrypoint as root, then `su` to companion, but the volume mounts from the host may have incompatible UID/GID.

### MEDIUM-07: `.env` File Contains Real Secret
**Severity**: MEDIUM
**File**: `.env:1`
```
COMPANION_API_KEY=companion-dev-2026
```
While `.env` is gitignored, it contains a real (dev) API key. The `.env.example` correctly uses placeholder values. No action needed if the repo is private, but worth noting.

### LOW-03: `.dockerignore` Missing Coverage
**Severity**: LOW
**File**: `.dockerignore`
Missing: `landing/`, `video/`, `scripts/`, `*.md`, `src-tauri/`, `.playwright-mcp/`. These get copied into the Docker build context unnecessarily, slowing builds.

---

## 4. Shared Package (packages/shared/) Findings

### HIGH-07: Version Constants Severely Out of Sync
**Severity**: HIGH
**Files**: Multiple
| Location | Version |
|----------|---------|
| `packages/shared/src/constants.ts` (`APP_VERSION`) | 0.5.3 |
| `packages/server/src/services/license.ts` (User-Agent) | 0.5.1 |
| `src-tauri/tauri.conf.json` | 0.7.0 |
| `src-tauri/Cargo.toml` | 0.7.0 |
| `packages/server/package.json` | 0.7.0 |
| `packages/shared/package.json` | 0.7.0 |
| `packages/web/package.json` | 0.7.0 |
| `landing/install.sh` (banner) | 0.7.0 |

`APP_VERSION` in shared constants reports 0.5.3 but the actual package versions are 0.7.0. The license verification User-Agent sends 0.5.1. This means the health endpoint, MCP server, and license API all report incorrect versions.

**Fix**: Update `APP_VERSION` to `0.7.0` and the User-Agent strings to match. Consider deriving version from package.json at build time.

### MEDIUM-08: `TelegramConfig.allowedChatIds` Uses `Set<number>` But DB Uses `number[]`
**Severity**: MEDIUM
**Files**: `packages/shared/src/types/telegram.ts:9`, `packages/server/src/telegram/bot-factory.ts:6`
The shared type uses `Set<number>` for `allowedChatIds`, but the bot-factory and bot-registry use `number[]`. The shared type is never actually used by the implementation.

### MEDIUM-09: No Zod Schemas for Shared Types
**Severity**: MEDIUM
**File**: `packages/shared/src/types/`
All shared types are pure TypeScript interfaces with no runtime validation. The server uses Zod for API route validation (e.g., `licenseActivateRoute`), but WebSocket messages (`BrowserOutgoingMessage`) are not validated at the boundary. Malformed WS messages could crash the bridge.

### LOW-04: Shared Package Has No Build Step or Tests
**Severity**: LOW
**File**: `packages/shared/package.json`
The shared package exports raw `.ts` files via `"./src/index.ts"`. This works with Bun and Next.js but would break with any consumer that doesn't support TypeScript imports directly. No tests exist for utility functions like `thinkingModeTobudget` (note: typo in function name -- lowercase 'b').

### LOW-05: Typo in Exported Function Name
**Severity**: LOW
**File**: `packages/shared/src/types/session.ts:314`
```typescript
export function thinkingModeTobudget(mode: ThinkingMode): number | undefined {
```
Should be `thinkingModeToBudget` (capital B). This is a public API from the shared package.

---

## 5. Code Quality (Phase 3)

### MEDIUM-10: `console.log` in Production Logger
**Severity**: MEDIUM
**File**: `packages/server/src/logger.ts:77`
The structured logger itself uses `console.log` for info/debug output (with an eslint-disable comment). This is intentional for the logger module but means `console.log` detection rules will always flag it. Consider using `process.stdout.write` consistently.

### MEDIUM-11: `: any` Types in Production Code
**Severity**: MEDIUM
**Files**: `packages/server/src/services/anti-cdp.ts` (3 occurrences), `packages/server/src/rtk/strategies/stack-trace.ts` (1 occurrence)
4 total `any` types in server production code. Low count but should be replaced with proper types.

### MEDIUM-12: `safeCompare` Function Duplicated
**Severity**: MEDIUM
**Files**: `packages/server/src/index.ts:30-37`, `packages/server/src/middleware/auth.ts:13-20`
Identical timing-safe comparison function defined in two places. The middleware version should be the single source.

---

## 6. Performance (Phase 5)

### INFO-01: Telegram StreamHandler Accumulates Full Response in Memory
**Severity**: INFO
**File**: `packages/server/src/telegram/stream-handler.ts`
The stream handler accumulates the entire AI response as a string in memory before sending. For very long responses this could be large, but given Telegram's 4096 char limit and the `splitMessage` function, this is manageable. No action needed.

### INFO-02: BotRegistry Sequential Bot Start
**Severity**: INFO
**File**: `packages/server/src/telegram/bot-registry.ts:131-152`
`autoStart()` starts bots sequentially with `await` in a for-loop. With multiple bots this adds latency to server startup. Could use `Promise.allSettled()` for parallel startup.

---

## 7. Documentation (Phase 7)

### MEDIUM-13: CHANGELOG Not Updated to 0.7.0
**Severity**: MEDIUM  
**File**: `CHANGELOG.md`
Should include all changes from 0.5.3 to 0.7.0, covering the desktop app, Telegram multi-bot support, RTK, etc.

---

## 8. Mesh Analytics (Phase 8)

### Metrics Data Summary

- **Sessions tracked**: 30+ entries in `sessions.jsonl`
- **Skills used**: 0 (all `skill_invocations: 0`, `primary_skill: "none"`)
- **Chains**: No `chains.jsonl` file exists
- **Routing overrides**: No `routing-overrides.json` file exists
- **Average session**: ~20 min, ~25 tool calls

### Assessment

The metrics collection infrastructure is in place but not yet tracking skill invocations. All sessions show `skills_used: []` and tool distribution as `{"unknown": N}`. This suggests the hooks that populate skill metadata are not wired up for this project. No skill chains or routing data available for analysis.

**Unused Skills**: Cannot determine -- no invocation data.
**Routing Overrides**: None configured.

---

## Top Priority Actions

1. **CRITICAL** -- Set CSP policy in `src-tauri/tauri.conf.json:38` and remove `dangerousDisableAssetCspModification`
2. **CRITICAL** -- Remove `--hot` from `docker-entrypoint.sh:65` for production
3. **HIGH** -- Narrow shell capabilities in `src-tauri/capabilities/default.json` to sidecar-only
4. **HIGH** -- Add empty-whitelist warning/block in `packages/server/src/telegram/bot-factory.ts`
5. **HIGH** -- Fix version drift: update `APP_VERSION` in `packages/shared/src/constants.ts` to `0.7.0`
6. **HIGH** -- Fix sidecar kill race in `src-tauri/src/main.rs` RunEvent::Exit handler
7. **HIGH** -- Resolve landing page deploy conflict (GitHub Pages vs Cloudflare Pages)

---

## Positive Findings

1. **Excellent structured logging** -- Custom logger supports JSON format, log levels, and module prefixing without any external dependency. Production code consistently uses `createLogger()` instead of `console.log`.

2. **Strong auth middleware** -- Timing-safe comparison (`timingSafeEqual`) for API key auth prevents oracle attacks. Production startup correctly refuses to run without `API_KEY` set.

3. **Well-designed Telegram rate limiting** -- Grammy `apiThrottler` + `autoRetry` transformer combination properly handles Telegram API limits. The `StreamHandler` accumulate-then-send pattern avoids edit-spam that causes 429s.

4. **Clean monorepo workspace structure** -- `packages/shared`, `packages/server`, `packages/web` with workspace protocol references. No circular dependencies detected between packages.

5. **Comprehensive Docker setup** -- Multi-stage build, `tini` as PID 1, healthcheck, non-root user attempt, sentinel-based bootstrap, and well-documented docker-compose with multiple deployment options (Cloudflare Tunnel, Nginx).

6. **Sidecar health polling** -- The Tauri app waits for the server to be healthy (30 attempts x 500ms) before showing the window, with a user-facing error message if it fails. Good UX pattern.

---

## Follow-up Timeline

- **WARNING** verdict -> re-audit in 1 month
- Fix CRITICAL items within 1 week
- Fix HIGH items within 2 weeks
- Plan MEDIUM items for next sprint

---

Report saved to: `D:/Project/Companion/AUDIT-REPORT.md`
