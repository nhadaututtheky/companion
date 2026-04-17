# Changelog

All notable changes to Companion are documented here.

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
