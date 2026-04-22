# Companion — Project Context

## What Companion is (and is not)

Companion is a **self-hosted multi-session AI coding manager**. One-click Docker or native desktop (Tauri). Runs locally, talks to multiple AI CLIs (Claude Code, Codex, Gemini, OpenCode), exposes them uniformly via web + Telegram + desktop.

**NOT SaaS.** Users install it on their own machine. Do not frame landing copy, docs, or UX as SaaS.

**NOT a Claude Code extension.** Task routing, model selection, skill systems are Claude Code's job. Don't duplicate its capabilities. Companion's value is orchestration above the CLI, not inside it:
- Multi-session orchestration (debate mode, workrooms, parallel agents)
- Zero-barrier access (free provider discovery, no API key needed for Gemini CLI)
- Cross-session collaboration (@mentions, shared workspaces)
- Non-terminal interfaces (desktop, Telegram)
- Provider management at fleet level, not per-session

## Tech stack

- **Server**: Bun + Hono + Drizzle + SQLite (`packages/server/`)
- **Web**: Next.js 16 App Router + TailwindCSS 4 + shadcn/ui + Zustand + TanStack Query (`packages/web/`)
- **Desktop**: Tauri 2 with embedded Bun sidecar (`src-tauri/`)
- **Shared**: `packages/shared/` for types + constants
- **Landing**: Cloudflare Pages (`landing/`)

## Deploy / release flow

- **Source repo**: private (this one)
- **Release repo**: public `companion-release` — desktop binaries built on tagged versions
- **CI** runs on `companion-release`, NOT on `companion`
- **Version bumps**: always commit before running `./ship.sh`, otherwise the git tag lands on the wrong commit
- **Landing deploys via Cloudflare Pages** using `wrangler`, not GitHub Pages

## Recent architectural decisions

- **v0.26.0 (2026-04-22)**: per-account Anthropic quota (Phase 1 + 2) — round-robin gate reads live usage, UI renders inline bars + threshold sliders
- **v0.25.0 (2026-04-22)**: bypassPermissions default, test-connection endpoint, useFetch refactor
- **v0.24.0 (2026-04-20)**: SessionSettings unification — INV-13/14/15 enforce via grep CI gate; killed the recurring "timeout resets on resume" bug
- **v0.23.0 (2026-04-20)**: Aptabase + Telegram feedback; pubkey rotated (v0.22 users manual reinstall)

## Never frame tasks as

- "Let's migrate to a SaaS model" (user explicitly wants self-hosted)
- "Add model-routing logic to Companion" (Claude Code does this)
- "Rewrite in Electron" (Tauri is the decision — stay with it, batch fixes before rebuild)

## Permission boundaries

- **Danger zones**: `packages/server/src/services/ws-*`, `session-store.ts`, `compact-manager.ts`, `telegram/**`, `adapters/**`, `shared/types/session.ts` — read `.rune/INVARIANTS.md` before editing
- Logic Guardian manifest at `.rune/logic-manifest.json` lists components that require explicit preservation statements
