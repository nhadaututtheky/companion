# Feature: Inline Suggest Engine

## Overview

Discovery layer above prompt input that surfaces hidden Claude Code
capabilities (skills, sub-agents, MCP tools, etc.) as contextual
suggestions. Pluggable provider architecture so future sources
(model switch, memory recall, compaction) can be added without
refactoring.

## Architecture

```
PromptInput → SuggestionContext
                 ↓
          SuggestionEngine
                 ↓
    [Provider[]] — pluggable, each returns Suggestion[]
                 ↓
        Dedupe + rank → top 3
                 ↓
       <SuggestionStrip /> above input
```

**Core contracts** live in `packages/web/src/lib/suggest/types.ts` —
every future provider implements the same `SuggestionProvider`
interface. Zero coupling between providers.

## Phases

| # | Name | Status | File | Summary |
|---|------|--------|------|---------|
| 1 | Foundation + Skills provider | ⬚ Pending | plan-inline-suggest-phase1.md | Types, engine, intent detector, first provider (Skills), basic UI stub |
| 2 | Agents provider | ⬚ Pending | plan-inline-suggest-phase2.md | Parse `~/.claude/agents/*.md` + plugin manifests, tag-based intent match |
| 3 | MCP provider | ⬚ Pending | plan-inline-suggest-phase3.md | List MCP servers + tools, keyword → tool suggest |
| 4 | Polished UI | ⬚ Pending | plan-inline-suggest-phase4.md | SuggestionStrip with icon, dismiss, kbd shortcut, telemetry |
| 5 | v2 providers (deferred) | ⬚ Deferred | plan-inline-suggest-phase5.md | Model switch, memory recall, context compaction |

## Key Decisions

- **Client-side engine** — web parses & ranks. Server only serves registry data via `/api/registry/*`.
- **Cache-first** — registry fetched once per session, refreshed on demand. Suggestions compute under 50ms.
- **Regex intent detection in v1** — keyword/pattern matching per provider. Upgrade to LLM classify later if accuracy drops.
- **Max 3 suggestions shown** — prevent cognitive overload. Ranked by provider-reported score + recency boost.
- **Dismissable + opt-out** — user can hide for session or disable globally in settings.
- **Telemetry** — track accept/dismiss per source to learn which providers deliver value.

## Provider Contract (reference)

```typescript
interface SuggestionProvider {
  id: string;              // 'skills' | 'agents' | 'mcp' | ...
  name: string;
  enabled: boolean;
  suggest(ctx: SuggestionContext): Promise<Suggestion[]>;
}

interface Suggestion {
  id: string;
  source: string;
  title: string;
  description: string;
  icon?: string;
  action: SuggestionAction;   // insert-text | run-command | set-model | custom
  score: number;              // 0-1
}
```

## Non-goals (v1)

- No LLM-based intent classification (use regex/keyword)
- No cross-session learning
- No suggestion personalization per user
- No inline suggestion inside message content (only above input)
