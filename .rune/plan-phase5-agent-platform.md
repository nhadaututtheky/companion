# Feature: Phase 5 — Agent Platform

## Overview
Transform Companion from "Claude UI wrapper" into an AI agent orchestration platform. Core capability: Claude can self-orchestrate via MCP tools — spawn sessions, debate with other Claudes, share context, and auto-summarize work. Controllable from Telegram with natural language.

## Current State (what already exists)
- DB tables: `channels`, `channel_messages`, `session_summaries` ✅
- Channel Manager service: CRUD operations ✅
- Channel REST API: all endpoints ✅
- `/debate` Telegram command: stub only (shows "Phase 5" placeholder)
- Sessions can link to channels via `channelId` field ✅

## Sub-Phases
| # | Name | Status | Plan File | Est. |
|---|------|--------|-----------|------|
| 5A | MCP Server Core | ✅ Done | plan-phase5a-mcp-server.md | 1 session |
| 5B | Session Auto-Summary | ✅ Done | plan-phase5b-auto-summary.md | 1 session |
| 5C | Debate Engine | ✅ Done | plan-phase5c-debate-engine.md | 2 sessions |
| 5D | Ring Redesign + Debate UI | ✅ Done | plan-phase5d-debate-ui.md | 2 sessions |

## Key Decisions
- MCP SDK (`@modelcontextprotocol/sdk`) over raw protocol — auto tool/list, less code
- stdio transport first (local Claude Code), HTTP/SSE later (remote agents)
- Haiku for auto-summaries — cheap ($0.001/session), fast, good enough
- Debate is opt-in — doesn't affect normal single-session workflow
- Convergence = >70% overlap or 2 rounds no new points → auto-conclude
- Max 5 rounds + $0.50 cost cap per debate (configurable)

## Recommended Order
5A → 5B → 5C → 5D

5A unblocks everything (MCP tools = agents can spawn agents).
5B is cheap win (auto-summary useful even without debate).
5C is the core feature (debate engine + Telegram integration).
5D is polish (web UI for viewing debates).
