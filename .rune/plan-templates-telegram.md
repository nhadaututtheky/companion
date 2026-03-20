# Feature: Session Templates + Telegram Command Center

## Overview
Two quick wins from brainstorm: **#6 Session Templates** (saved prompt templates for quick session starts) and **#5 Telegram Command Center** (complete missing commands, polish existing UX). Templates are the bigger value-add — let users save reusable prompts per project and invoke from Telegram with one tap.

## Phases
| # | Name | Status | Summary |
|---|------|--------|---------|
| 1 | Session Templates | ✅ Done | DB schema, CRUD API, Telegram /template command, seed defaults |
| 2 | Telegram Command Center | ✅ Done | /todo, /history, /usage, /help categorized + per-cmd, bot menu updated |

## Key Decisions
- Templates stored in SQLite (not files) — portable, queryable, works across projects
- Templates are per-project OR global (project_slug nullable)
- Telegram is primary UI for templates — web UI secondary
- No over-engineering: templates = name + prompt + optional model/permission overrides
