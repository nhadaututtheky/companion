# Competitive Intelligence — Reference Sheet

> Purpose: Features observed in competitors, saved for future consideration.
> NOT a todo list. Review when planning new features.
> Updated: 2026-03-21

---

## Sources analyzed

| Project | URL | Stars | Key differentiator |
|---------|-----|-------|-------------------|
| Claude Code CLI | github.com/anthropics/claude-code | Official | Agent SDK, Channels, Hooks |
| OpenChamber | github.com/openchamber/openchamber | 2.1k | 30+ themes, SSE proxy, Tauri desktop |
| Vibe Companion | github.com/The-Vibe-Company/companion | 2.2k | Docker sandbox, AI permission validation, Linear integration |
| Understand-Anything | github.com/Lum1104/Understand-Anything | 1.5k | Codebase → knowledge graph, 5-agent pipeline, React Flow dashboard |
| 1DevTool | 1devtool.com | N/A | All-in-one desktop IDE: context bridging, tmux terminals, embedded browser, DB/HTTP client, $29 one-time |

---

## Feature backlog (evaluate when relevant)

### Auth & Multi-user
- [ ] **OAuth providers** (GitHub, Google) — NOBODY has this yet. First-mover advantage.
- [ ] **Multi-user with organizations** — Vibe has Better Auth + org plugin (cloud only)
- [ ] **Per-user API key management** — neither competitor manages Anthropic keys
- [ ] **SSO/SAML** — enterprise play, very far future

### AI-Powered Features
- [ ] **AI Permission Validation** — second model rates tool calls safe/dangerous/uncertain → auto-approve/deny (Vibe)
- [ ] **Session auto-naming** — LLM generates session name from first turn (Vibe)

### Developer Tools
- [ ] **noVNC proxy** — desktop environment in browser (Vibe, niche use case)
- [ ] **Branch picker + git worktree** in UI (Vibe)
- [ ] **Codebase knowledge graph** — tree-sitter parse → dependency graph → React Flow visual (Understand-Anything design). Build lightweight: 1 prompt call, not 5-agent pipeline. Render in existing web UI
- [ ] **Auto-onboard summary** — summarize architecture when opening new project (Understand-Anything `/understand-onboard`)
- [ ] **Diff impact analysis** — show affected files/functions before commit (Understand-Anything `/understand-diff`)

### AI Context & Productivity (from 1DevTool)
- [ ] **Send to AI** — 1-click context injection from file viewer, error messages, logs into active session prompt. Killer UX gap for Companion
- [ ] **Rich prompt editor** — @file mention with fuzzy search, drag-drop images, markdown formatting, screenshot annotator (1DevTool Agent Input)
- [ ] **Session dashboard** — Kanban-style overview of all sessions with status (Idle/Running/Review) across projects (1DevTool Terminal Dashboard)
- [ ] **Prompt history** — searchable/filterable by project, agent, date. Already have DB, need query UI (1DevTool)
- [ ] **Resume across sessions** — combine chat history from multiple past sessions into one new session (1DevTool Resume)
- [ ] **Terminal persistence** — session survives container restart via SDK resume (1DevTool uses tmux)

### Integrations
- [ ] **Linear integration** — issue → session → branch → auto-status (Vibe, API key auth)
- [ ] **Webhook relay** — Cloudflare Worker routes Linear/GitHub events to local instance (Vibe)
- [ ] **Channels** — push Telegram/Discord events INTO running session (Claude Code official)

### Platform
- [ ] **Cloud hosting** — provisioned instances with billing (Vibe: Hetzner + Stripe)
- [ ] **Theme system** — 30+ themes, JSON schema, hot-reload (OpenChamber)
- [ ] **Skills marketplace** — browse/install community skill files (OpenChamber concept)
- [ ] **VS Code extension** — sidebar chat, agent panel (OpenChamber concept)
- [ ] **Desktop app (Tauri)** — native wrapper (OpenChamber)
- [ ] **PWA push notifications** — Web Push with VAPID keys (OpenChamber concept)

### CLI Flags to expose in UI
- [ ] `--fork-session` — timeline branching
- [ ] `--name <name>` — named sessions for easy resume
- [ ] `--max-budget-usd` — budget cap per session
- [ ] `--max-turns` — limit agentic turns
- [ ] `--append-system-prompt` — per-session instructions
- [ ] `--bare` — skip hooks/LSP for speed

---

## Companion advantages to protect

- **Telegram bot** — mobile access without native app (neither competitor has this)
- **Channel/Debate system** — multi-agent shared context
- **Magic Ring UI** — unique interaction pattern
- **Plan mode watchdog** — auto-fix stuck plan mode
- **License + payment system** — commercial ready (pay.theio.vn + Polar.sh)
- **SQLite + Drizzle** — lighter than PostgreSQL for self-host
- **Claude Code native NDJSON pipe** — deeper than HTTP proxy
