# Changelog

All notable changes to Companion are documented here.

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
