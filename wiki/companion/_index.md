---
domain: companion
article_count: 0
total_tokens: 0
last_compiled: null
---

# Companion Knowledge Base

*Seeded — articles compile on first AI provider config + session end.*

## Available now (always loaded)

- `_core.md` — never-break rules distilled from `.rune/INVARIANTS.md` (load via `companion_wiki_read` slug `_core`)

## Raw material awaiting first compile

Raw files live in `raw/` and get polished into canonical articles on next `compileWiki` run (triggered automatically at session end if an AI provider is configured):

- `invariants-full.md` — full copy of `.rune/INVARIANTS.md`, 15 invariants across session-lifecycle, compact, routing, AI-provider, session-settings
- `architecture-overview.md` — 11 domains, key directories, data flow touchpoints, danger zones
- `project-context.md` — what Companion is, tech stack, release flow, recent architectural decisions

## How to use this wiki

**Reading** — call `companion_wiki_search` to find articles, `companion_wiki_read` to load one.

**Writing** — call `companion_wiki_note` proactively when you:
- Fix a bug and learn the underlying root cause
- Discover a non-obvious pattern, convention, or invariant
- Infer a hidden constraint, gotcha, or undocumented contract
- Make a judgment call a future session would need context to repeat

Notes land as drafts in `raw/` and get LLM-polished on session end into canonical articles sharing the same slug, upgrading confidence from "inferred" to "extracted".
