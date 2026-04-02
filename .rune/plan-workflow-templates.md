# Workflow Channel Templates — Master Plan

> Goal: Evolve debate engine into general-purpose multi-agent orchestration with pre-built workflow templates
> Priority: P1 — biggest competitive gap vs 1DevTool
> Inspired by: 1DevTool Agent Channels (see .rune/analysis-1devtool.md)
> Estimated phases: 3

## Why

Companion's channel system currently only supports debate formats (pro_con, red_team, review, brainstorm).
1DevTool offers pre-built workflow templates (Fix Bug, Implement Feature, Multi-Agent Build) where
agents are assigned roles and messages route sequentially via @mentions.

This is the most impactful feature gap — it transforms Companion from "debate tool" into
"agent orchestration platform".

## Current State

- `channel-manager.ts` — CRUD for channels
- `debate-engine.ts` — 4 debate formats with convergence detection + verdicts
- `mention-router.ts` — @shortId routing between sessions
- `channelMessages` table — message storage with agent roles
- `sessionTemplates` table — prompt templates (Quick Fix, Code Review, etc.)

## What We're Building

Extend the existing channel + debate infrastructure to support **sequential workflow channels**
where agents are assigned roles and messages auto-route through a pipeline.

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Template Engine | ✅ Done | plan-workflow-templates-phase1.md | Workflow template schema, built-in templates, template CRUD |
| 2 | Pipeline Orchestrator | ✅ Done | plan-workflow-templates-phase2.md | Sequential @mention routing, role assignment, auto-handoff |
| 3 | UI & Polish | ✅ Done | plan-workflow-templates-phase3.md | Template picker, pipeline visualization, workflow list + detail pages |

## Key Decisions

- **Extend, don't replace**: Build on top of existing channel-manager + debate-engine
- **Sequential routing**: Agent A finishes → auto-route output to Agent B (not parallel)
- **Role-based**: Each agent in workflow has a role (planner, builder, verifier, reviewer)
- **Template-driven**: Users pick template, system configures agents + prompts
- **Companion advantage**: Unlike 1DevTool (which routes between CLI terminals), we route between
  Claude sessions with full context — richer orchestration
