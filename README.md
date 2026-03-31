<p align="center">
  <img src="https://img.shields.io/badge/Companion-v0.4.0-4285F4?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/License-BSL_1.1-EA4335?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Bun-1.3+-34A853?style=for-the-badge" alt="Bun" />
  <img src="https://img.shields.io/badge/Next.js-16-FBBC04?style=for-the-badge" alt="Next.js" />
</p>

<h1 align="center">Companion</h1>
<p align="center"><strong>Multi-session Web UI + Telegram Bot for Claude Code</strong></p>
<p align="center">Run up to 6 Claude sessions in parallel, share context between them, stream to Telegram, and manage everything from your browser.</p>

---

## Quick Start (Docker Compose)

> **Prerequisites:** Docker Desktop installed and running. A Claude Code subscription (Claude CLI uses `~/.claude/.credentials.json`).

```bash
# 1. Clone and configure
git clone https://github.com/user/companion.git
cd companion
cp .env.example .env

# 2. Edit .env — set at minimum:
#    API_KEY=your-secret-password    (protects the web UI)

# 3. Start
docker compose up -d --build

# 4. Open the web UI
#    http://localhost:3580
```

**That's it.** The server runs on port 3579 (API + WebSocket), the web UI on port 3580.

### What gets mounted

| Host | Container | Purpose |
|------|-----------|---------|
| `~/.claude` | `/home/companion/.claude` | Claude CLI credentials (auto-detected) |
| `C:/` | `/mnt/c` | File browser access (Windows — edit `docker-compose.yml` for your drives) |
| `D:/` | `/mnt/d` | File browser access |
| Docker volume | `/app/data` | SQLite database persistence |

> **macOS/Linux:** Replace the `C:/` and `D:/` mounts with `- /:/mnt/host` or `- $HOME:/mnt/home`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | **Yes** (prod) | — | Password for web UI. Without it, anyone on your network can access Companion |
| `COMPANION_LICENSE_KEY` | No | — | License key from [companion.theio.vn](https://companion.theio.vn). Free tier (1 session) if not set |
| `TELEGRAM_BOT_TOKEN` | No | — | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_ALLOWED_USER_IDS` | No | — | Comma-separated Telegram user IDs (security: restrict who can use the bot) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | No | — | Comma-separated Telegram chat IDs |
| `ALLOWED_BROWSE_ROOTS` | No | auto-detect | Restrict file browser to specific directories |

### Updating

```bash
git pull
docker compose up -d --build
```

Your data (SQLite database) persists in a Docker volume — rebuilds won't lose sessions or settings.

---

## Features

### Web Dashboard
- **Multi-session grid** — Up to 6 Claude sessions running in parallel
- **Magic Ring** — Shared context hub, link sessions for multi-agent debates
- **Debate mode** — Structured multi-agent discussions with rounds and verdicts
- **File viewer** — Browse and view project files directly in the UI
- **Voice input** — Speech-to-text for hands-free interaction
- **Activity Terminal** — Real-time agent log viewer (`Ctrl+\``)
- **Command Palette** — Quick actions (`Ctrl+K`)
- **Context meter** — See how much context window remains
- **Session resume** — Restore sessions after server restart
- **Dark mode** — Persists across refreshes

### Telegram Bot
- **Full settings panel** — Model, auto-approve, idle timeout, safe mode
- **22 commands** — `/start`, `/stream`, `/file`, `/skill`, `/btw`, `/note`, and more
- **Resume flow** — Resume interrupted sessions with full context
- **Bidirectional streaming** — Web ↔ Telegram, same session
- **File viewer** — Auto-detect file paths, view directly in Telegram
- **Permission control** — Allow/Deny with colored buttons

### Server
- **Claude Agent SDK** — Direct SDK integration for session management
- **WebSocket bridge** — Real-time communication between browser, CLI, and Telegram
- **Session lifecycle** — Health checks, idle watchdog, auto-cleanup
- **License system** — Tier-based feature gating
- **SQLite database** — Projects, sessions, messages, settings, templates
- **REST API** — Full CRUD for sessions, projects, channels, settings, templates

---

## Development

```bash
# Install dependencies
bun install

# Run server + web in dev mode
bun run dev:server &
bun run dev:web

# Or on Windows
dev.bat
```

### Available Scripts

```bash
bun run check          # TypeScript type-check all packages
bun run lint           # ESLint across entire codebase
bun run lint:fix       # Auto-fix lint issues
bun run format         # Prettier formatting
bun test               # Run test suite (97 tests)

# Database
bun run db:generate    # Generate Drizzle migrations
bun run db:migrate     # Run pending migrations
bun run db:studio      # Open Drizzle Studio (DB browser)
```

### Project Structure

```
packages/
├── server/          Bun + Hono API server, WebSocket bridge, Telegram bot
│   └── src/
│       ├── routes/      REST API endpoints
│       ├── services/    Business logic + database operations
│       ├── middleware/   Auth + rate limiting
│       ├── telegram/    Grammy bot + command handlers
│       ├── mcp/         Model Context Protocol server
│       └── db/          Drizzle ORM schema + migrations
├── web/             Next.js 16 + React 19 web dashboard
│   └── src/
│       ├── app/         Pages (App Router)
│       ├── components/  UI components by feature
│       ├── hooks/       Custom React hooks
│       └── lib/         API client + Zustand stores
└── shared/          TypeScript types shared between server and web
```

---

## Architecture

```
Browser (Next.js 16 + React 19)
  ↕ WebSocket + REST
Companion Server (Bun + Hono)
  ↕ Claude Agent SDK
Claude Code
  ↕ Subscriber system
Telegram Bot (grammY)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) 1.3+ |
| Server | [Hono](https://hono.dev) + WebSocket |
| Web | [Next.js 16](https://nextjs.org) + React 19 + TailwindCSS 4 |
| State | [Zustand](https://zustand.docs.pmnd.rs) 5 |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team) |
| Telegram | [grammY](https://grammy.dev) |
| AI | [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk) |
| Icons | [Phosphor Icons](https://phosphoricons.com) |

## Troubleshooting

### Docker: "Claude CLI not authenticated"
Mount your local Claude credentials: `-v ~/.claude:/root/.claude`. The container reuses your existing Claude Code login.

### Docker: Permission errors on mounted drives
On Windows, ensure Docker Desktop has access to the drives you're mounting. Go to Docker Desktop → Settings → Resources → File Sharing.

### Web UI shows "Unauthorized"
Set the `API_KEY` environment variable and use it when prompted in the browser. In dev mode (no `API_KEY` set), auth is skipped.

### Telegram bot not responding
1. Check `TELEGRAM_BOT_TOKEN` is set correctly
2. If using `TELEGRAM_ALLOWED_USER_IDS`, make sure your user ID is included
3. Check logs: `docker compose logs companion | grep telegram`

### Session stuck in "starting"
The Claude CLI may have failed to start. Check logs: `docker compose logs companion | grep session`

---

## License

[Business Source License 1.1](LICENSE) — Free to use and self-host. Commercial use requires a license from [companion.theio.vn](https://companion.theio.vn). Converts to MIT after 3 years.
