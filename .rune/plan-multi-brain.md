# Feature: Multi-Brain Workspace

## Overview
Allow a "brain" session (orchestrator) to spawn specialist child sessions, each with isolated context and dedicated role. Brain delegates tasks via @mention, child sessions work independently, report back when done. Works on both Web/Desktop and Telegram.

## Architecture Summary
- **parentId** already exists in DB schema — child sessions link to parent
- **@mention** already routes messages cross-session — used for brain↔child communication  
- **Personas** already assignable per session — used for agent roles
- **Telegram** `createForumTopic` works in private chat (Bot API Feb 2026)

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Server: Spawn + Wake | ✅ Done | plan-multi-brain-phase1.md | `/spawn` API, wake endpoint, parent-child tracking |
| 2 | Web UI: Agent Tabs | ✅ Done | plan-multi-brain-phase2.md | Option C tabs in header, agent sidebar, spawn modal |
| 3 | Telegram: Auto Topics | ✅ Done | plan-multi-brain-phase3.md | Brain creates forum topics per agent in private/group |
| 4 | Brain Intelligence | ✅ Done | plan-multi-brain-phase4.md | /spawn + /status handlers, brain prompt, workspace templates |

## Key Decisions
- **Option C UI** — agent tabs in session header, not separate grid cards
- **@mention for communication** — reuse existing infra, not new protocol
- **parentId for hierarchy** — DB field exists, just needs API exposure
- **Telegram topics** — both private chat and group, same `createForumTopic` API
- **Incremental** — each phase is independently useful, no big-bang required

## Dependencies
- Phase 2 depends on Phase 1 (needs spawn API)
- Phase 3 depends on Phase 1 (needs spawn API)
- Phase 4 depends on Phase 1+2 (needs spawn + UI to monitor)
- Phases 2 and 3 are independent of each other (can parallelize)
