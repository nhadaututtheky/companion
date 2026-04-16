# Feature: CodeGraph Intelligence Upgrade

## Overview
Port best ideas from GitNexus (27K stars) + fix internal connectivity gaps. Goal: make CodeGraph autonomous — auto-scan, auto-reindex, rich analysis, self-documenting architecture. Currently CodeGraph is strong on parsing + context injection but weak on graph analysis, agent integration, and feature connectivity.

## Competitive Context
- GitNexus beats us on: Leiden clustering, process tracing, git diff impact, MCP depth, auto-reindex hooks
- We beat GitNexus on: adaptive 5-point context injection, trust weights, framework-aware edges, incremental scan
- Strategy: port their strengths while keeping ours

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Wire Zombie Connections | Done | plan-codegraph-intel-phase1.md | Fix PostToolUse→event-collector, community→context, codegraph→wiki |
| 2 | Leiden Community Detection | Done | plan-codegraph-intel-phase2.md | Leiden algorithm + AI labels + enriched stats |
| 3 | Git Diff Impact Mapping | Pending | plan-codegraph-intel-phase3.md | Pre-commit change analysis, connect existing diff-updater |
| 4 | Auto-Reindex + Claude Code Skills | Pending | plan-codegraph-intel-phase4.md | PostToolUse hook triggers rescan, generate .claude/skills/ |
| 5 | Architecture Diagrams | Pending | plan-codegraph-intel-phase5.md | Mermaid generation from communities + graph, MCP tool |

## Key Decisions
- Keep SQLite (proven, zero-dep) — don't port LadybugDB
- Keep existing 5-point injection system — extend it with community context
- Leiden algorithm via pure TS implementation (no native deps)
- Skills generated per-project, stored in .claude/skills/ within project dir
- All new features exposed via existing MCP tools pattern

## Connectivity Gaps (Current State)
| From | To | Status | Fix Phase |
|------|-----|--------|-----------|
| PostToolUse hook | event-collector.processToolEvent() | DISCONNECTED | Phase 1 |
| Communities | Context injection | DISCONNECTED | Phase 1 |
| Communities | Graph visualization / export | DISCONNECTED | Phase 5 |
| CodeGraph | Wiki (cross-reference) | DISCONNECTED | Phase 1 |
| Session summary | Wiki auto-compile | PARTIAL (raw only) | Phase 1 |
| Git diff | Impact analysis (pre-commit) | EXISTS but not wired | Phase 3 |
| Rescan | File change events (real-time) | MANUAL only | Phase 4 |
