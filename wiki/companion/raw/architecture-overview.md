# Companion — Architecture Overview

Distilled from `FEATURE_REGISTRY.md` (the canonical source, re-seed when it updates). Use this to pick the right entry point when a task arrives.

## 11 domains

| # | Domain | Owns | Key directory |
|---|--------|------|---------------|
| 1 | Session Management | Session CRUD, CLI launcher, WS bridge, compact, share | `packages/server/src/services/` |
| 2 | AI Context Intelligence | Context budget, wiki, codegraph, RTK compression | `packages/server/src/services/context-*`, `wiki/`, `codegraph/` |
| 3 | Sessions UI (Web) | Session list, command input, stream viewer, compact UI | `packages/web/src/features/sessions/` |
| 4 | Collaboration | Multi-agent debate, workspaces, channels, personas | `packages/server/src/services/debate-*`, `workspace-*` |
| 5 | Knowledge / Wiki | Article store, LLM compiler, raw bin, retriever, linter | `packages/server/src/wiki/` |
| 6 | Telegram Bot | Command routing, session-mappings, idle manager, personas | `packages/server/src/telegram/` |
| 7 | Desktop (Tauri) | System tray, auto-updater, autostart, notifications | `src-tauri/` |
| 8 | UI/UX Framework | Magic Ring, command palette, themes, layouts | `packages/web/src/components/` |
| 9 | Accounts | Multi-OAuth, auto-switch, per-account quota, encryption | `packages/server/src/services/credential-*`, `account-*` |
| 10 | Infrastructure | Auth, license, scheduling, DB migrations, crypto | `packages/server/src/services/`, `db/` |
| 11 | Distribution / Landing | Landing page, release CI, Cloudflare Pages | `landing/`, `.github/workflows/` |

## Critical invariants you will touch if you work in these dirs

- `packages/server/src/services/ws-*` → read `.rune/INVARIANTS.md` sections 1–4 (session lifecycle) + 10–11 (dual-path)
- `packages/server/src/services/session-store.ts` → INV-1, INV-2, INV-4
- `packages/server/src/services/compact-manager.ts` → INV-5, INV-6, INV-7
- `packages/server/src/telegram/**` → INV-3, INV-7, INV-10
- `packages/server/src/services/adapters/**` → adapter contract + MCP injection helper (`mcp-injection.ts`)
- `packages/shared/src/types/session.ts` → INV-9 (state machine)

## Key data flow touchpoints

- **Session init** → `ws-session-lifecycle.startSession()` (non-SDK) or `startSessionWithSdk()` (SDK) → `cli-launcher` picks adapter (Claude/Codex/Gemini/OpenCode) → adapter.launch() → MCP config injected via `adapters/mcp-injection.ts` → CLI process spawned → NDJSON stdout parsed by `adapters/<platform>-adapter.parseMessage()` → normalized → `ws-message-handler.handleNormalizedMessage()`
- **Session end** → any kill path → `killSession()` → `endSessionRecord()` (the single-writer) → clears cliSessionId + shortId + status → event bus emits → Telegram + web update
- **Compact** → `compact-manager.detectCompactStart()` → broadcasts `status_change: compacting` → CLI drains → `handleSystemStatus(status=null)` → `maybeReinjectIdentity` + `injectWikiContext("compact")` → broadcast `compact_handoff: done`
- **Wiki L0 injection** → `handleSystemInit` → `getWikiStartContext()` reads L0 core + index → sent as NDJSON user-message via `bridge.sendToCLI` (Claude only, non-Claude adapters don't have user-message plumbing for L0 yet)

## Recently-shipped domain boundaries worth knowing

- **SessionSettingsService** owns ALL session-settings state (INV-13/14/15). Writes go through it, reads hit its caches.
- **SessionLifecycle** is the orchestrator for `startSession` + `killSession`. Telegram commands + web UI both call into it, never direct session-store writes.
- **Per-account quota** (v0.26.0) uses `oauth-token-service` + `usage-fetcher` + `findNextReadyAsync`. Schema in migration 0048.
