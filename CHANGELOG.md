# Changelog

All notable changes to Companion are documented here.

## [0.24.0] - 2026-04-20

### Fixed
- **Session settings survive resume across all entry points** — idleTimeoutMs / keepAlive / autoReinjectOnCompact / thinking_mode / context_mode / idleTimeoutEnabled now stay attached to the session when resuming from Web "Resume" button, Telegram `/use @shortid`, Telegram `/resume`, or auto-reconnect. The 1-hour-exact edge case (silently dropped by the old `!== 3_600_000` inheritance guard) is now covered by a contract test. See `.rune/INVARIANTS.md` historic violation #5 for the full regression story.

### Changed
- **Single writer for per-session settings** — introduced `SessionSettingsService` (`packages/server/src/services/session-settings-service.ts`). Every read goes through it; every write emits `session:settings:updated` on the typed event bus so `ws-bridge` and `telegram-idle-manager` caches stay in sync. Removed three independent writers that had been the root cause of recurring "timeout resets" bugs.
- **Consolidated defaults** — new `DEFAULT_*` constants in `@companion/shared` (`DEFAULT_IDLE_TIMEOUT_ENABLED`, `DEFAULT_KEEP_ALIVE`, `DEFAULT_AUTO_REINJECT_ON_COMPACT`, `DEFAULT_THINKING_MODE`, `DEFAULT_CONTEXT_MODE`, `DEFAULT_COMPACT_MODE`, `DEFAULT_COMPACT_THRESHOLD`). Previously 4 sites had 3 different values.
- **`sessions` table owns settings** — migrations `0044_session_settings_unify.sql` (add 6 columns + backfill from telegram_session_mappings) and `0045_drop_telegram_idle_columns.sql` (drop the now-dead legacy columns).
- **API routes** — `POST /api/sessions/:id/resume` no longer hardcodes a 1-hour fallback; client-supplied overrides are the only explicit writes, inheritance comes from the service.
- **Telegram bridge** — removed the `!== 3_600_000` inheritance guard and the redundant DB read in `startSessionForChat`; lifecycle-level inheritance covers every path.

### Added
- **`.rune/INVARIANTS.md` INV-13/14/15** — mandatory single-reader/single-writer/new-setting-checklist rules. Every new session-level setting now requires constants + type + DB column + contract scenario.
- **`scripts/check-settings-consistency.ts`** — CI gate. Fails the build if any file outside `SessionSettingsService` mutates the sessionSettings/sessionConfigs Maps or writes to `telegram_session_mappings.idle_timeout_*`. Wired through `bun run check:settings`.
- **Contract tests (`settings-resume-inheritance.test.ts`)** — 10 scenarios: every persisted setting × resume, the `idleTimeoutMs === 3_600_000` edge case, inheritance isolation, event emission.
- **Service integration tests (`session-settings-service.test.ts`)** — 8 cases covering persistence, event payload shape, cache invalidation, partial-patch preservation, validation errors, no-op patch emission.
- **Migration tests** — `migration-0044.test.ts` (4 cases) and `migration-0045.test.ts` (3 cases) verify backfill + column removal + INSERT compatibility.

### Deferred
- **Web UI `useSessionSettings` hook with live WS subscription** — server already broadcasts `session_update` on settings change; the hook is purely a cross-tab UX improvement. Will ship when two-tab-edit becomes a reported pain.

### Tests
- **1019 tests pass, 0 fail** — server suite (726 including 10 new contract + 8 service + 7 migration + 42 ws-bridge reworked), web (271), tsc clean across server/shared/web.

## [0.22.0] - 2026-04-17

### Fixed
- **Credential dedup live-session guard** — `dedupeAccountsByIdentity` now queries `sessions.status NOT IN ["ended","error"]` before picking a survivor. Rows that own a live session win the merge unconditionally; if more than one row in a group owns a live session the merge is skipped entirely with a warning. Prevents `cli-launcher` subprocess breakage when a migration/cleanup collides with a running session. Added 2 unit tests (10/10 dedup tests pass).
- **Resume AI Sessions modal theme leak** — Modal used CSS vars that don't exist in the project stylesheet (`--bg-card`, `--text-primary`, `--accent`, `--profit` instead of `--color-*`). All occurrences replaced with correctly prefixed tokens; hardcoded `border-white/10`, `bg-white/5`, `divide-white/5`, `hover:bg-white/[0.03]` replaced with `--color-border`, `--color-bg-elevated`, `--color-bg-hover`. Modal now fully reactive to Light/Dark/Mono theme switch.
- **Esc handler double-fire on Feature Guide** — Top-modal branch returned without `preventDefault()`, letting browser defaults fire alongside the modal's own Esc handler.
- **Landing hero stats wrap** — "100+ Library Auto-Detect" was wrapping to a new row on mid-width viewports because `.stat` padding was `0 32px`. Dropped to `0 24px` (base) and `0 16px` at 769–1024px.

### Changed
- **Modal stack (centralized Esc/backdrop)** — Modal registration flows through `useUiStore.modalStack` so Esc/backdrop click always closes the top-most modal, resolving overlap bugs between `SettingsModal`, `ResumeSessionsModal`, `FeatureGuideModal`, etc.
- **Nav sidebar file split** — `nav-sidebar.tsx` went from 594 → 48 lines (shell only). Each feature surface (Panels / AI / Layout) now lives in its own file under `components/layout/sidebar/`. Dead code removed (`applyPreset`, `uiTheme`, `BUILT_IN_PRESETS`, unused `useEffect`). Zero user-facing change — full UX tab-bar reorg intentionally deferred.
- **Error log toolbar** — Export became an icon-only ghost button; Clear kept as the single labeled danger action. Filter sits on the left with a flex spacer, pagination already at footer.
- **Projects page spacing** — Card padding `p-5 → p-4`, title margin `mb-0.5 → mb-1`, badge `py-0.5 → py-1`, banner `mb-5 → mb-4`, copy-dir button `p-0.5 → p-1`. All on 4/8px rhythm.
- **Projects page copy-dir affordance** — Button now renders at `opacity-50` baseline, `opacity-100` on hover/group-hover (was invisible until hover).
- **Theme page delete button** — Custom-theme delete (bare `x` text) replaced with a Phosphor `X` icon that reveals on card hover only. Reduces resting interactive-element count on the page.
- **Theme page "Add Theme" CTA** — Inline "Import VS Code Theme" card replaced with a `+ Add Theme` button in the page header that opens a new `AddThemeModal` component. Import flow unchanged, layout tightened.

### Added
- **`AddThemeModal` component** — `packages/web/src/components/settings/add-theme-modal.tsx`. Wraps the VS Code theme file-upload flow in a focused modal (parse → map to `ThemeColors` → persist to `companion_custom_themes` localStorage).

### Deferred
- **Phase 5 — Magic Ring refactor** — Pure internal SVG/props cleanup with no user-visible benefit. Skipped per its own plan's defer option; `magic-ring.tsx` still works and looks correct.
- **Theme in-modal color editor** — Users can delete + re-import custom themes today; full palette editor will ship if demand emerges.

### Tests
- **10/10 credential-dedup tests pass** (2 new: live-session guard promotes owner, skips merge on multi-live-owner).
- **169/169 web unit tests pass** (no regressions from ModalStack / nav split / AddThemeModal).

## [0.21.9] - 2026-04-17

### Tests
- **Added 80 new unit tests** — `cli-launcher` (11), `ws-bridge` (42), `ws-message-handler` (27) covering adapter delegation, plan-mode watchdog, session lifecycle, subscriber fan-out, early-result replay, NDJSON routing, idle timing, cost/token tracking.
- **`test:services` script splits mock-heavy tests into isolated `bun test` invocations** — `mock.module` persists globally within a Bun process, so `ws-bridge.test.ts` mocking `./ws-message-handler.js` (and vice-versa) poisoned each other when run in the same invocation. Fixed by running `cli-launcher`, `ws-message-handler`, and `ws-bridge` each in their own process after the non-polluting tests.

### Internal
- Typed `getIdleDetector: mock(() => mockIdleDetector as any)` in `ws-message-handler.test.ts` to match the existing `mockRtkPipeline as any` pattern (stub only covers 3 of 7 `IdleDetector` surface methods — the other 4 aren't exercised by the handler code paths under test).

## [0.21.8] - 2026-04-17

### Changed
- **Free trial extended from 7 to 14 days** — unified across server-signed flow (`pay.theio.vn/trial`) and local offline fallback in `license.ts`. Rationale: 7 days was too short for devs to fully evaluate Pro features (WebIntel, CodeGraph, RTK Pro strategies, unlimited sessions). Matches competitor norms (Cursor, Raycast). Landing page + install-script banners updated accordingly.

### Fixed
- **CodeGraph diagram endpoint ignores whitespace-padded query params** — `GET /api/codegraph/diagram?project=%20foo%20` previously passed the literal `" foo "` through to the graph lookup and returned 404. Query params are now `.trim()`-ed before use.

## [0.21.7] - 2026-04-17

### Fixed
- **License / RTK Pro gate silently stuck on Free** — `GET /api/license` had TWO Hono handlers: a legacy flat-shape version in `routes/health.ts` and the canonical wrapped `{success, data}` version in `routes/index.ts`. Hono resolved the first-registered (flat) handler, so every web consumer that read `res.data.tier` / `res.data.features` got `undefined` and silently fell back to the Free-tier defaults. Symptom: users on Pro/Trial/Dev-mode saw the correct tier badge in the settings panel (which read the flat shape directly) but `useLicenseStore` stayed at `tier: "free"` and `rtk-settings` hid every Pro strategy.
- **Settings → License activation form** now reads the wrapped `GET` response at `res.data.tier` (the flat `res.tier` path was the only thing holding the flat handler in place — fixed both sides of the mismatch).

### Internal
- Dropped the shadow handler in `packages/server/src/routes/health.ts` with a breadcrumb comment explaining the removal. `GET /api/license` is now exclusively served by `routes/index.ts` with `satisfies ApiResponse`.

## [0.21.6] - 2026-04-17

### Fixed
- **CI Quality Gates green** — removed the lone `no-useless-escape` error in `diagram-generator.ts` (`\[` inside a character class is redundant) that was failing the lint job on `main` even though v0.21.5 tag builds were green.
- **Settings / tip-banner React 19 compliance** — refactored three `set-state-in-effect` violations (`DesktopTab`, `TipsSection`, `TipBanner`) to derive state at render via lazy `useState` initializers or `useMemo`, eliminating cascading re-renders flagged by the React 19 ESLint plugin.

### Internal
- `TipBanner` no longer uses a 300ms fade transition on dismiss — the early `return null` made the opacity animation dead code anyway. Selection logic now runs in `useMemo` keyed on a `dismissCounter` that bumps on dismiss to force `availableTips` to re-filter against `localStorage`.

## [0.21.5] - 2026-04-17

### Fixed
- **Claude CLI 2.1+ compatibility** — Replaced removed `--thinking-budget` flag with `--effort low|medium|high|xhigh|max` (mapped from `thinking_mode`). Previously any session with `thinking_mode = "deep"` silently failed to apply extended thinking.
- **Context window defaulted correctly** — `getMaxContextTokens(model, mode)` now returns 200K by default. Previously Opus/Sonnet sessions reported 1M even when the CLI was actually using 200K, breaking compact thresholds and `/info` progress bars.
- **Opus 4.5 / Sonnet 4.5 context** — Correctly reports 200K (they never supported 1M). Previously treated as 1M-capable.
- **Haiku 4.5 thinking mode** — `modelSupportsDeepThinking` / bare alias detection now covers Haiku 4.5 and the `opus`/`sonnet` shorthands Claude Code CLI accepts.
- **Context-estimator + Telegram /info + settings panel** — All now read `state.context_mode` instead of hardcoding `model.includes("haiku") ? 200k : 1M`.

### Added
- **1M context beta toggle (web + Telegram)** — New-session modal shows a 200K / 1M switch next to MODEL (only when the selected model supports 1M). Active-session header exposes `ContextModeSelector` for live switching; Telegram settings panel gains matching `panel:ctx:200k|1m` buttons. Toggling re-applies the model with the `[1m]` suffix via `set_model` control_request so the CLI opts in without a restart.
- **`set_context_mode` WS message type** — handled in `ws-user-message.ts` and broadcast as `session_update` so every client stays in sync.

### Internal
- `SessionState.context_mode?: "200k" | "1m"` — persisted and surfaced to browsers.
- `applyContextSuffix(model, mode)` / `modelSupports1M(model)` — single source of truth for `[1m]` suffix logic across adapter, UI, Telegram.
- Deprecated `thinkingModeTobudget` (CLI no longer honors it); use `thinkingModeToEffort`.

## [0.21.1] - 2026-04-17

### Added
- **Multi-Account Manager Phase 4 — Topbar Indicator** — `AccountIndicator` component shows the active account's status dot + label directly in the header, with a dropdown offering instant "Switch to next ready" and "Manage accounts" shortcuts. Full WAI-ARIA menu pattern (arrow-key navigation, Home/End, Escape returns focus, aria-haspopup/controls).

### Fixed
- **Telegram rate-limit label** — `account_rate_limited` notifications now carry the real account label instead of showing "Unknown" (resolved at emission time in `claude-adapter`).
- **Auto-switch deadlock** — Auto-switch now falls back to `skip-in-rotation` accounts when every non-skipped candidate is rate-limited, instead of silently leaving the session stuck.
- **Round-robin tiebreaker drift** — `findNextReady` computes its cost tiebreaker from a scoped `SUM(sessions.total_cost_usd) WHERE accountId IN (...)` query rather than the denormalized `accounts.totalCostUsd` column that can drift.
- **Orphaned session history** — `deleteAccount` wraps the delete in a transaction that first nulls `sessions.accountId`, preserving per-session cost history while removing the account.

## [0.21.0] - 2026-04-17

### Added
- **Smart Orchestration UI** — Dispatch suggestion badge in message composer. When the task classifier detects a workflow/debate pattern (confidence >= 0.5), a compact banner appears with pattern icon, confidence %, override dropdown, and confirm/dismiss buttons. Fully wired: EventBus → WebSocket → Zustand store → UI.
- **Architecture Diagrams** — New "Architecture" tab in AI Context panel. Generates Mermaid diagrams from CodeGraph data: architecture overview (community clusters), module dependency trees, and call flow diagrams. Client-side Mermaid rendering with dark theme.
- **CodeGraph Intelligence (5 phases)** — Community detection (Leiden algorithm) with AI cluster labels, pre-commit impact analysis with blast radius scoring, auto-reindex on file changes (debounced 5s), skills generator (4 Claude skill files per project), and diagram generator.
- **MCP Tools for Wiki KB + CodeGraph** — `companion_wiki_search`, `companion_wiki_save`, `companion_codegraph_search`, `companion_codegraph_impact`, `companion_codegraph_diagram`, `companion_generate_skills` — autonomous agent access to knowledge base and code intelligence.
- **Dispatch Preview API** — `GET/POST /api/sessions/dispatch-preview` (regex-only sync + AI-powered async) and `POST /api/sessions/dispatch-confirm` for programmatic orchestration control.

### Changed
- Smart Orchestration pipeline now auto-classifies every user message (non-blocking, async) and emits `dispatch:classified` events to all connected browsers.
- `MessageComposer` accepts `sessionId` prop for session-scoped dispatch suggestions.
- Cleaned up 9 completed plan files (audit-fixes, perf phases).

### Fixed
- Cross-session dispatch suggestion contamination — store filters by sessionId.
- Dispatch confirm race condition — suggestion cleared only after successful API response.
- Input length validation on dispatch preview endpoints (GET: 2000 chars, POST: 10000 chars).
- Single-pattern suggestions filtered out (no UI intervention needed for single-session tasks).

## [0.20.0] - 2026-04-16

### Added
- **Desktop Autostart** — Start with Windows toggle via tauri-plugin-autostart.
- **Show/Hide on Startup** — Desktop setting to control window visibility on launch.
- **Desktop Settings Tab** — Tauri-only settings section (autostart, show on startup).
- **Opus 4.7 Support** — Model-aware thinking modes and updated model registry.

## [0.10.2] - 2026-04-06

### Added
- **Let's Encrypt Auto-SSL** — Certbot sidecar container with automatic certificate issuance and 12h renewal cycle. SSL mode selector (Let's Encrypt / Manual) in domain settings UI.
- **Issue Certificate Button** — One-click SSL cert issuance from Settings UI when Let's Encrypt mode is active.
- **Multi-Bot Debate Guide** — Collapsible 4-step setup guide for running multi-platform AI debates in Telegram groups.
- **Agent Pulse Health Monitor** — Live health monitoring with pulse indicators for active sessions.
- **Inline Diff Summary** — Diff summary blocks rendered inline in chat feed.
- **Free Model Debate** — Provider registry + model picker UI for cross-provider debate sessions.

### Fixed
- **Docker Apply** — Replaced broken `fetch` to unix socket with `Bun.spawn` for reliable `docker compose up -d` execution.
- **WebIntel API Key UX** — Clarified that API key is not required for most features, moved to collapsed Advanced section.
- **Memory Leak** — Fixed cost tracking memory leak and rate limit retry logic.
- **Certbot Template Literal** — Escaped `$${!}` properly in docker-compose YAML generation.

### Changed
- Multi-platform bot roles: Claude, Codex, Gemini, OpenCode (removed deprecated Anti role)
- Expanded Telegram command reference with `/templates`, `/mood`, debate commands
- NGINX config generation now supports ACME challenge + HTTPS redirect + TLS 1.2/1.3

## [0.10.1] - 2026-04-06

### Added
- **Multi-CLI Platform Support** — Adapters for Codex, Gemini CLI, OpenCode alongside Claude. Abstract CLI interface with normalized message format.
- **CLI Debate Engine** — Cross-platform turn-based debates with sequential execution, agent cards, creation modal, and live feed with round dividers.
- **Update Notification** — Dual-channel update detection: server-side GitHub API polling + Tauri native `update-available` event. Toast banner with dismiss-per-version.
- **MCP Auto-Detect** — Reads `~/.claude.json`, `settings.json`, `settings.local.json` to discover MCP servers. One-click import into Companion's config.
- **Recursive Skills Scanner** — Skills detection now recurses into nested subdirs and scans `~/.claude/commands/` for custom slash commands.

### Fixed
- **Orphan Hooks Cleanup** — Companion now cleans up `.claude/settings.local.json` hooks on shutdown + startup, preventing ECONNREFUSED when running Claude Code standalone.
- **Codex/Gemini/OpenCode adapter fixes** — cwd propagation, tool_result typing, randomUUID for tool IDs, send() warns on non-interactive stdin.
- **New Session Modal** — SSR-safe localStorage, model sync on platform change, template model validation per platform.

### Changed
- Removed hardcoded recommended skill packs with incorrect git links
- Enabled `withGlobalTauri: true` for native update event listening

## [0.9.0] - 2026-04-06

### Added
- **Tree-sitter WASM AST Parser** — 4-phase upgrade from regex to proper AST parsing. Multi-language support (TS, Python, Rust, Go, Java, C#), correct call graph with shadowing/trust/builtins.
- **CodeGraph Advanced Analysis** — 5 ported features from code-review-graph:
  - **FTS5 Full-Text Search** — Porter stemming, auto-sync triggers, snippet extraction
  - **Blast Radius Scoring** — 5-factor risk score (0.0–1.0) with security keyword detection
  - **Execution Flow Tracing** — BFS from entry points, max depth 15, cycle-safe
  - **Community Detection** — File-path grouping with cohesion scoring
  - **RRF Search Fusion** — FTS5 + symbol LIKE merged via Reciprocal Rank Fusion
- **Settings Modal** — Overlay modal replacing /settings route, with tabs for all config
- **Skills Browser** — API endpoint scanning ~/.claude/skills + tree UI with search, preview pane, and recommended skills section
- **Cross-Provider Debate Engine** — Free model integration (Gemini, Groq, Ollama) with rate limit retry
- **Provider Registry + Model Picker** — Dropdown below chat for main model + free model selection
- **Agent Pulse Health Monitor** — Live codegraph visualization + UX overhaul + personas
- **Inline Diff Summary** — Diff summary block rendered directly in chat feed
- **10 Built-in Themes** — Expanded from 3 to 10 themes
- **Per-Tool Renderers** — Dedicated icons, inputs, and outputs for each tool type

### Fixed
- CodeGraph: incremental rescan ordering + concurrency guard
- CodeGraph: call graph correctness — shadowing, trust upgrade, builtins filtering
- CodeGraph: race condition in scanner, memoization fixes
- Memory leak in cost tracking, rate limit retry logic
- Terminal spawn on Windows, chat input border softening
- Terminal cleanup leak, border shift, error messages
- Signing pubkey updated, updater artifacts enabled
- CI: bun.lock synced for frozen-lockfile

### Changed
- Session list: collapsed controls, compact layout
- Search endpoint upgraded to RRF fused search by default (legacy mode available)
- Graph endpoint: O(n²) edge filter replaced with Set lookup

## [0.7.0] - 2026-04-03

### Added
- **RTK (Runtime Token Keeper)** — CLI output compression pipeline with 10 strategies: ANSI strip, boilerplate removal, stack trace compression, error aggregation, test summary, diff summary, JSON depth limiter, blank collapse, deduplication, and truncation. Saves 30-60% tokens on tool outputs.
- **RTK Intelligence Layer** — Cross-turn output cache (FNV-1a hashing), token budget allocator (aggressive/balanced/minimal/unlimited), per-strategy enable/disable from settings.
- **RTK Dashboard** — Token savings card in session details showing tokens saved, estimated cost savings, and compression count with cache hit stats.
- **RTK Settings Panel** — New "RTK" tab in Settings page with compression level selector and individual strategy toggles.
- **Local AI Providers** — Google AI Studio preset (Gemma 4 27B/12B, Gemini models), Gemma 4 added to Ollama and Groq presets.

### Fixed
- ANSI strip: removed `|/-\` from progress/spinner regex to prevent false-positive deletion of markdown tables and log lines
- Error aggregate: preserved line ordering (interleave non-error lines at original positions)
- Boilerplate: use replacements map instead of mutating input array mid-loop
- RTK config: internal try/catch so DB errors don't crash server startup
- Cache cleanup on all session exit paths (sweep, scheduled timer, kill)

## [0.6.0] - 2026-04-03

### Added
- **Telegram Forum Topics** — Auto-create forum topics per project in group chats. Each project gets its own topic thread for organized conversations.
- **Agent SDK Engine** — New `sdk-engine.ts` replaces NDJSON CLI wrapping with `@anthropic-ai/claude-agent-sdk` typed async iterator. Feature flag: `USE_SDK_ENGINE=1`.
- **Comprehensive Test Suite** — 432 tests across 22 files covering security scanning, concurrency, code intelligence, Telegram formatting, and DB operations.
- **Telegram Commands** — `/forum list|reset` for managing forum topic mappings, `/thinking`, `/clear`, `/mcp` commands.

### Fixed
- SDK model switching now uses `sdkQuery.setModel()` instead of CLI control messages
- SDK env vars passthrough to spawned sessions
- Test infrastructure: migration-based schema for test DB, DebouncedWriter flush in tests

### Changed
- Download links on landing page now use Cloudflare redirect paths (`/download/macos`, `/download/windows`, `/download/linux`)
- Version bump across all packages (server, web, shared, Tauri)

## [0.5.3] - 2026-03-28

### Added
- Layout presets — Default, Focus, Web Dev, Terminal, Explorer, AI Collab
- MCP server management UI in settings
- Scheduled sessions — full 4-phase implementation (engine, API, UI, history)
- CodeGraph panel with dark mode support

### Fixed
- Nested button hydration error in session list
- Auth skip when server has no API_KEY configured
- Embedded migrations regenerated (0012-0020)
- All lint errors resolved for CI

## [0.5.0] - 2026-03-20

### Added
- Initial public release
- Multi-session Claude Code management (up to 6 parallel)
- Web UI with Next.js 16 + React 19
- Telegram bot integration (Grammy)
- Docker one-click deployment
- Session sharing with QR codes
- Tauri desktop app (Windows, macOS, Linux)
- License system (pay.theio.vn + Polar.sh)
