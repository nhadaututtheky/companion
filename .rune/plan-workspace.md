# Feature: Workspace — Multi-CLI Project Hub

## Overview
Workspace = project-level container connecting multiple CLI agents (Claude Code, Codex, Gemini CLI, OpenCode) into a shared context. All CLIs in a workspace share Wiki KB, CodeGraph, rules, and can be @mentioned to assign tasks. Transforms Companion from "session launcher" into "AI team orchestrator."

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Data Model & Store | ✅ Done | plan-workspace-phase1.md | DB schema, server store, CRUD API |
| 2 | Sidebar Redesign | ✅ Done | plan-workspace-phase2.md | Workspace-first sidebar, CLI status indicators, create modal |
| 3 | Multi-CLI Connect | ✅ Done | plan-workspace-phase3.md | Context injection, connect/disconnect API, reconnect on restart |
| 4 | @CLI Routing | ✅ Done | plan-workspace-phase4.md | @cli mentions, @all fan-out, priority resolution |
| 5 | Workspace Dashboard | ✅ Done | plan-workspace-phase5.md | Dashboard panel: CLI cards, cost summary, active sessions |

## Key Decisions
- Workspace IS a project with connected CLIs — extends existing `projects` config, not new entity
- Each workspace has a `cliSlots` config: which CLI types to auto-connect
- @mention routing reuses existing `mention-router.ts` — extend with CLI-type aliases
- Shared context: Wiki KB + CodeGraph + CLAUDE.md injected to ALL CLIs in workspace
- Sidebar becomes workspace-first: icon rail = workspaces, expand = CLIs + sessions inside

## Architecture
```
Workspace "Companion"
│
├── Config (DB: workspaces table)
│   ├── projectSlug: "companion"
│   ├── projectPath: "D:/Project/Companion"
│   ├── cliSlots: ["claude", "codex", "gemini", "opencode"]
│   ├── defaultExpert: "staff-sre"
│   └── autoConnect: true
│
├── Connected CLIs (runtime state)
│   ├── claude  → session-abc (running)
│   ├── codex   → session-def (idle)
│   ├── gemini  → session-ghi (waiting)
│   └── opencode → null (not connected)
│
├── Shared Context (auto-injected)
│   ├── Wiki KB: L0 core rules + domain articles
│   ├── CodeGraph: file dependencies, symbols
│   ├── CLAUDE.md / project rules
│   └── Workspace history: recent decisions, patterns
│
└── @Mention Routing
    ├── "@claude fix the auth bug" → route to Claude Code session
    ├── "@codex review this PR" → route to Codex session
    ├── "@all summarize progress" → fan-out to all active CLIs
    └── "@gemini benchmark query" → route to Gemini session
```

## Sidebar Redesign
```
Current:                          After:
┌──────┬────────────┐            ┌──────┬────────────────────┐
│  C   │ Sessions   │            │  C   │ Companion          │
│  M   │  - sess1   │            │  M   │ ┌─────────────────┐│
│  F   │  - sess2   │            │  F   │ │ 🟢 Claude Code  ││
│      │            │            │      │ │ 🟡 Codex        ││
│      │            │            │      │ │ 🟢 Gemini       ││
│  +   │            │            │      │ │ ⚪ OpenCode     ││
│      │            │            │      │ └─────────────────┘│
│      │            │            │      │  Sessions:         │
│      │            │            │      │   - sess1 (claude) │
│      │            │            │      │   - sess2 (codex)  │
│      │            │            │  +   │                    │
└──────┴────────────┘            └──────┴────────────────────┘

Icon rail: workspace icons (letter + active dot)
+ button: Create workspace / Add CLI
Expand: CLI status bar + session list grouped by CLI
```

## Risk Areas
1. Auto-spawn 4 CLIs = resource heavy — need lazy connect (spawn on first @mention)
2. Context injection differs per CLI (Claude uses --system-prompt, Codex uses env, etc.)
3. @mention parsing conflicts with existing session @mention — need priority: @cli > @session
4. Workspace state persistence across server restarts — need DB + reconnect logic
