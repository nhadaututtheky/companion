# Feature: Companion Standalone Extraction

## Overview
Extract Companion from MyTrend into a standalone AI agent orchestration platform. Rewrite the frontend from SvelteKit/Comic to Next.js 16 + TailwindCSS 4 + shadcn/ui with warm cream palette (Google colors). Keep Bun + Hono backend, replace PocketBase with SQLite via Drizzle ORM. **Agent-first architecture**: Companion doubles as an MCP server so Claude can self-orchestrate (spawn sessions, debate, share context).

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Foundation | ✅ Done | plan-companion-phase1.md | Monorepo scaffold, DB schema, Hono server skeleton |
| 2 | CLI Bridge | ✅ Done | plan-companion-phase2.md | Session management, WS bridge, CLI launcher, REST API |
| 3 | Telegram System | ✅ Done | plan-companion-phase3.md | grammY, sendMessageDraft, formatter, commands, bot-registry |
| 4 | Web UI Core | ✅ Done | plan-companion-phase4.md | Next.js 16, warm cream, 3-column, session terminal, projects |
| 5 | Agent Platform | 🔄 Active | plan-phase5-agent-platform.md | MCP Server, Auto-Summary, Debate Engine, Debate UI |
| 6 | AntiGravity | ⬚ Pending | plan-companion-phase6.md | CDP browser automation, VS Code extension bridge |
| 7 | Polish & Deploy | ⬚ Pending | plan-companion-phase7.md | Docker, CI/CD, docs, migration script |

## Key Decisions
- Next.js 16 over SvelteKit 5 (see Architecture doc section 2)
- SQLite + Drizzle over PocketBase (see Architecture doc section 2)
- Keep Bun + Hono (proven, fast, TypeScript-native)
- Bun workspaces monorepo (no Turborepo overhead for 3 packages)
- WebSocket stays on Bun.serve native (not Socket.IO)
- **Companion as MCP Server** — Claude can spawn sessions, debate, share context via MCP tools
- **Agent-first**: every UI action has a corresponding API/MCP tool
- **Telegram is primary interface**, web is secondary monitoring
- **All messages stored in SQLite** — Telegram, web, agent-to-agent — full history
- **Debate Mode**: multi-Claude sessions share context via Shared Channels, structured output
- **Design**: warm cream #F5F3EF, Google colors (blue/red/yellow/green), 3-column layout, no sidebar
