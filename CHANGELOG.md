# Changelog

All notable changes to Companion are documented here.

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
