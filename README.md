<p align="center">
  <img src="https://img.shields.io/badge/Companion-v0.2.0-4285F4?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-BSL_1.1-EA4335?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Bun-1.3+-34A853?style=for-the-badge" alt="Bun" />
  <img src="https://img.shields.io/badge/Next.js-16-FBBC04?style=for-the-badge" alt="Next.js" />
</p>

<h1 align="center">Companion</h1>
<p align="center"><strong>Multi-session Web UI + Telegram Bot for Claude Code</strong></p>
<p align="center">Run up to 6 Claude sessions in parallel, share context between them, stream to Telegram, and manage everything from your browser.</p>

---

## Quick Start

### Docker (recommended)

```bash
docker run -p 3580:3580 -p 3579:3579 \
  -v ~/.claude:/root/.claude \
  -e COMPANION_API_KEY=your-secret \
  companion
```

Open [http://localhost:3580](http://localhost:3580)

### Docker Compose

```bash
git clone https://github.com/user/companion.git
cd companion
cp .env.example .env  # Edit with your settings
docker-compose up -d
```

### Development

```bash
bun install
dev.bat        # Windows
# or
bun run dev:server & bun run dev:web
```

## Features

### Web Dashboard
- **Multi-session grid** — Up to 6 Claude sessions running in parallel
- **Glassmorphism expand** — Click to expand any session to full view
- **Magic Ring** — Shared context hub, link sessions together for multi-perspective discussions
- **Activity Terminal** — Real-time agent log viewer (Ctrl+\`)
- **Command Palette** — Quick actions (Ctrl+K)
- **Markdown rendering** — Code blocks, tables, syntax highlighting
- **Context meter** — See how much context window remains
- **Session resume** — Restore sessions after server restart
- **Dark mode** — Persists across refreshes

### Telegram Bot
- **Full settings panel** — Model, auto-approve, idle timeout, safe mode
- **22 commands** — /start, /stream, /file, /skill, /btw, /note, and more
- **Resume flow** — Resume interrupted sessions with full context
- **Bidirectional streaming** — Web ↔ Telegram, same session
- **Styled buttons** — Colored inline keyboards (Telegram Bot API)
- **File viewer** — Auto-detect file paths, view directly in Telegram
- **Permission control** — Allow/Deny with colored buttons

### Server
- **Claude CLI integration** — Spawns Claude Code in interactive NDJSON mode
- **WebSocket bridge** — Real-time communication between browser, CLI, and Telegram
- **Session lifecycle** — Health checks, idle watchdog, auto-cleanup
- **License system** — Tier-based feature gating via Cloudflare Worker
- **SQLite database** — Projects, sessions, messages, settings

## Architecture

```
Browser (React/Next.js)
  ↕ WebSocket
Companion Server (Bun + Hono)
  ↕ stdin/stdout NDJSON
Claude Code CLI
  ↕ Subscriber system
Telegram Bot (grammY)
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Production | Auth key for web UI API |
| `COMPANION_LICENSE_KEY` | No | License key (free tier if not set) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `TELEGRAM_ALLOWED_USER_IDS` | No | Admin user IDs (comma-separated) |
| `ALLOWED_BROWSE_ROOTS` | No | Directories for project browser |

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Server:** [Hono](https://hono.dev) + WebSocket
- **Web:** [Next.js 16](https://nextjs.org) + React 19 + TailwindCSS 4
- **State:** [Zustand](https://zustand.docs.pmnd.rs) 5
- **Database:** SQLite via [Drizzle ORM](https://orm.drizzle.team)
- **Telegram:** [grammY](https://grammy.dev)
- **Icons:** [Phosphor Icons](https://phosphoricons.com)
- **CLI:** Claude Code (`--input-format stream-json`)

## License

[Business Source License 1.1](LICENSE) — Free to use and self-host. Commercial use requires a license. Converts to MIT after 3 years.
