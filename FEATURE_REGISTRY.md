# Companion — Feature Registry

> Single source of truth for all features, their relationships, and boundaries.
> Updated: 2026-04-05 | ~105 features across 8 domains

## How to Use This File
- **Before building**: Check if feature exists or overlaps with existing ones
- **Dependencies**: Follow `→ connects to` to understand impact radius
- **Boundaries**: Each feature has a clear owner (key file) — don't scatter logic

---

## 1. SESSION MANAGEMENT

The core domain. Sessions are Claude Code processes managed through WebSocket bridge.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Session CRUD + state machine | `session-store.ts`, `session-state-machine.ts` | DB, event-bus, short-id |
| CLI launcher (Claude Code NDJSON pipe) | `cli-launcher.ts` | ws-bridge |
| SDK engine (Anthropic Agent SDK direct) | `sdk-engine.ts` | ws-bridge |
| WebSocket bridge (live message routing) | `ws-bridge.ts` | cli-launcher, sdk-engine, compact-manager |
| Short IDs (@fox, @bear) | `short-id.ts` | session-store, mention-router |
| Auto-naming (AI-generated session titles) | `session-namer.ts` | ai-client |
| Auto-summarize on end | `session-summarizer.ts` | ai-client |
| Idle detection (2s no-output) | `idle-detector.ts` | ws-bridge, debate-engine |
| Context injection (env info for Claude) | `session-context.ts` | project-profiles |
| Compact manager (auto context-compaction) | `compact-manager.ts` | ws-bridge |
| Share + spectator (read-only session view) | `share-manager.ts`, `spectator-bridge.ts` | ws-bridge |
| Pulse estimator (agent health scoring) | `pulse-estimator.ts` | ws-bridge, telegram-bridge |
| Session REST API | `routes/sessions.ts` | session-store, ws-bridge |

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Session list (sidebar) | `session-list.tsx` | session-store (Zustand) |
| Session detail / chat | `session-details.tsx` | use-session hook |
| Multi-session grid | `multi-session-layout.tsx` | layout-store |
| New session modal | `new-session-modal.tsx` | templates, projects |
| Message feed + tool renderers | `message-feed.tsx`, `tool-renderers.tsx` | ws-bridge |
| Message composer + attachments | `message-composer.tsx`, `attachment-chip.tsx` | composer-store |
| Permission gate (approve/deny) | `permission-gate.tsx` | ws-bridge |
| Changes diff panel | `changes-panel.tsx`, `inline-diff.tsx` | ws-bridge tool events |
| Context meter | `context-meter.tsx` | ws-bridge |
| Cost breakdown | `cost-breakdown.tsx` | session API |
| Pinned messages | `pinned-messages-drawer.tsx` | session-store |
| Pulse indicator (heartbeat + sparkline) | `pulse/pulse-indicator.tsx` | pulse-store |
| Pulse warning (alert + action buttons) | `pulse/pulse-warning.tsx` | pulse-store, context-feed-store |

---

## 2. AI & MODELS

Multi-provider AI routing. Currently supports Anthropic + any OpenAI-compatible endpoint.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Multi-provider AI client | `ai-client.ts` | settings-helpers |
| Prompt scanner (risk detection) | `prompt-scanner.ts` | ws-bridge |
| RTK pipeline (tool output compression) | `rtk/pipeline.ts` + 8 strategies | ws-bridge |
| Provider registry (free + configured) | `provider-registry.ts` | ai-client, debate-engine, models API |
| Models API (list, health, toggle) | `routes/models.ts` | provider-registry, web UI |
| Saved prompts (CRUD) | `routes/saved-prompts.ts` | session composer |
| Session templates (w/ variables) | `templates.ts` | new-session-modal |

**Supported Providers** (via `ai-client.ts`):
- Anthropic (native) — Claude Haiku, Sonnet, Opus
- OpenAI-compatible — Groq, Together, Ollama, DashScope Qwen, Google AI Studio
- OpenRouter — multi-model via single API

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Model selector | `model-selector.tsx` | settings |
| Thinking mode toggle | `thinking-mode-selector.tsx` | session API |
| Voice input | `use-voice-input.ts` | message-composer |
| Saved prompts picker | `saved-prompts-picker.tsx` | saved-prompts API |
| Quick actions | `quick-actions.tsx` | ws-bridge |
| Markdown rendering | `markdown-message.tsx` | message-feed |

---

## 3. DEBATE & COLLABORATION

Multi-agent debates + cross-session communication. **Unique to Companion.**

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Debate engine (pro_con, red_team, review, brainstorm) | `debate-engine.ts` | ai-client, channel-manager, convergence-detector |
| Convergence detector (auto-stop) | `convergence-detector.ts` | debate-engine |
| Channel manager (shared context DB) | `channel-manager.ts` | debate-engine, workflow-engine |
| @mention routing (cross-session forwarding) | `mention-router.ts` | short-id, session-store |
| Workflow engine (sequential pipelines) | `workflow-engine.ts` | channel-manager |
| Workflow templates (built-in presets) | `workflow-templates.ts` | workflow-engine |

**Planned extensions:**
- Workroom (Telegram shared space) — `.rune/plan-workroom.md`
- Free model debate (cross-provider) — `.rune/plan-free-model-debate.md`

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Channel panel | `channel-panel.tsx` | channels API |
| Workflow template picker | `template-picker.tsx` | templates API |
| Workflow page | `workflows/[id]/page.tsx` | workflow API |

---

## 4. DEVTOOLS

Terminal, file explorer, CodeGraph, WebIntel — developer productivity tools.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Terminal manager (PTY via Bun.spawn) | `terminal-manager.ts`, `terminal-lock.ts` | terminal API |
| Filesystem API (safe read-only) | `routes/filesystem.ts` | OS fs |
| CodeGraph scanner (AST-free symbols) | `codegraph/scanner.ts` | graph-store |
| CodeGraph semantic describer (AI summaries) | `codegraph/semantic-describer.ts` | ai-client |
| CodeGraph diff updater (incremental) | `codegraph/diff-updater.ts` | scanner |
| CodeGraph AI context provider | `codegraph/agent-context-provider.ts` | ws-bridge |
| CodeGraph query engine (impact radius) | `codegraph/query-engine.ts` | graph-store |
| WebIntel (web research via webclaw sidecar) | `web-intel.ts` | webclaw Docker |
| WebIntel library detector | `web-intel-detector.ts` | web-intel |
| WebIntel commands (/docs, /research) | `web-intel-handler.ts` | ws-bridge |

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Terminal panel (xterm.js) | `terminal-panel.tsx` | terminal WS |
| File explorer panel | `file-explorer-panel.tsx` | filesystem API |
| File tree + viewer | `file-tree.tsx`, `file-viewer.tsx` | filesystem API |
| CodeGraph visualization | `graph-visualization.tsx` | codegraph API |
| AI context panel | `ai-context-panel.tsx` | context-feed-store |
| Browser preview | `browser-preview-panel.tsx` | webintel |
| Search panel | `search-panel.tsx` | session messages |
| Stats panel | `stats-panel.tsx` | stats API |
| Prompt history panel | `prompt-history-panel.tsx` | saved-prompts |

---

## 5. TELEGRAM

Telegram bot integration — multi-bot, forum topics, streaming responses.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Bot factory (Grammy + auto-retry) | `telegram/bot-factory.ts` | telegram-bridge |
| Bot registry (multi-bot) | `telegram/bot-registry.ts` | bot-factory |
| Telegram↔session bridge | `telegram/telegram-bridge.ts` | ws-bridge, session-store |
| Stream handler (chunked responses) | `telegram/stream-handler.ts` | telegram-bridge |
| Formatter (HTML, tools, permissions) | `telegram/formatter.ts` | stream-handler |
| Forum topic auto-creation | `telegram/telegram-bridge.ts` | DB telegramForumTopics |
| Commands: /start, /new, /end, /list, /use | `telegram/commands/session.ts` | session-store |
| Commands: /thinking, /clear, /mcp | `telegram/commands/control.ts` | ws-bridge |
| Commands: /info, /status | `telegram/commands/info.ts` | session-store |
| Commands: /panel, /compact, /share | `telegram/commands/panel.ts` | share-manager |
| Commands: /mood (agent pulse health) | `telegram/commands/mood.ts` | pulse-estimator |
| Commands: /template | `telegram/commands/template.ts` | templates |
| Auto-alert (pulse state transition → TG) | `telegram/telegram-bridge.ts` | pulse-estimator |

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Bot card (add/remove bots) | `telegram-bot-card.tsx` | telegram API |
| Status indicator | `telegram-status.tsx` | telegram API |
| Streaming preview | `telegram-streaming.tsx` | ws-bridge |

---

## 6. DESKTOP (Tauri)

Native desktop app — system tray, auto-update, embedded server.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| System tray (Open, New Session, Quit) | `src-tauri/src/tray.rs` | main.rs |
| Auto-updater (minisign signed) | `src-tauri/src/main.rs` | companion.theio.vn/updates |
| Notification plugin (native OS) | `src-tauri/src/main.rs` | tauri-plugin-notification |
| Embedded server (Bun sidecar + health poll) | `src-tauri/src/server.rs` | Bun server binary |

---

## 7. UI/UX FRAMEWORK

Cross-cutting UI features used by multiple domains.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| Magic Ring (circular session launcher) | `ring/magic-ring.tsx` | ring-store |
| Command palette (Ctrl+K) | `command-palette.tsx` | ui-store, themes |
| Layout selector (grid/tabs/panes) | `layout-selector.tsx` | layout-store |
| Theme system (10 built-in themes) | `theme-provider.tsx`, `shared/theme.ts` | ui-store |
| Browser notifications | `use-notifications.ts` | use-session |
| Activity terminal | `activity-terminal.tsx` | activity-store |
| Onboarding wizard | `onboarding-wizard.tsx` | license, settings |
| Header + nav | `header.tsx` | ui-store |

---

## 8. INFRASTRUCTURE

Auth, license, config, scheduling, database — the foundation.

| Feature | Key File(s) | Connects To |
|---------|------------|-------------|
| License verification (trial + paid) | `license.ts` | pay.theio.vn, settings |
| API key auth middleware | `middleware/auth.ts` | all routes |
| Rate limiting | `middleware/rate-limit.ts` | all routes |
| Settings KV store | `settings-helpers.ts`, `routes/settings.ts` | DB |
| Project profiles | `project-profiles.ts` | session-context |
| MCP server config | `routes/mcp-config.ts`, `mcp/server.ts` | settings DB |
| HTTP hooks receiver | `routes/hooks.ts` | ws-bridge |
| Scheduler (cron + one-time) | `scheduler.ts` | session-store, templates |
| Event bus (typed pub/sub) | `event-bus.ts` | ws-bridge, scheduler |
| Error tracker | `error-tracker.ts` | DB errorLogs |
| Domain/proxy config | `routes/domain.ts` | Docker API |
| Drizzle ORM + SQLite (23 migrations) | `db/schema.ts` | all services |

**Web UI:**
| Component | File | Connects To |
|-----------|------|-------------|
| Settings page | `app/settings/` | settings API |
| Projects page | `app/projects/page.tsx` | projects API |
| Templates page | `app/templates/page.tsx` | templates API |
| Schedules page + UI | `app/schedules/`, `components/schedule/` | schedules API |
| MCP settings | `mcp-settings.tsx` | mcp-config API |
| RTK settings | `rtk-settings.tsx` | settings API |
| Analytics page | `app/analytics/page.tsx` | stats API |
| Login + auth guard | `app/login/`, `auth/auth-guard.tsx` | auth API |

---

## Feature Relationship Map

```
                    ┌─────────────────┐
                    │  INFRASTRUCTURE  │
                    │  DB · Auth · Lic │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
    │   AI & MODELS  │ │ SESSIONS │ │   TELEGRAM   │
    │ ai-client      │ │ ws-bridge│ │ telegram-    │
    │ providers      │ │ CLI/SDK  │ │ bridge       │
    │ RTK pipeline   │ │ store    │ │ commands     │
    └───────┬────────┘ └────┬─────┘ └──────┬───────┘
            │               │              │
            └───────┬───────┘              │
                    │                      │
          ┌─────────▼──────────┐           │
          │ DEBATE & COLLAB    │◄──────────┘
          │ debate-engine      │
          │ channels           │
          │ @mentions          │
          │ workflows          │
          └─────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌────────┐   ┌───────────┐   ┌──────────┐
│DEVTOOLS│   │  UI/UX    │   │ DESKTOP  │
│terminal│   │ring,theme │   │ Tauri    │
│codegraph   │cmd palette│   │ tray     │
│webintel│   │layout     │   │ updater  │
└────────┘   └───────────┘   └──────────┘
```

## Rules for New Features

1. **Check this file first** — does the feature exist? Does it overlap?
2. **One owner per feature** — logic lives in ONE key file, not scattered
3. **Connect via interfaces** — use event-bus or API, not direct imports across domains
4. **Update this file** — when adding/removing features, update the registry
5. **Domain boundaries**:
   - Session management ≠ AI routing (don't put model logic in session code)
   - UI ≠ business logic (components call API, not services directly)
   - Telegram ≠ web (bridge pattern — both connect to same session layer)
