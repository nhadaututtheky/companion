# Phase 1: Wiki KB Core Engine

## Goal
Build the filesystem-based wiki engine: store structure, LLM compiler, and retrieval API.
No UI yet — CLI/API only. This is the foundation everything else builds on.

## Architecture

```
wiki/                              ← root (inside project CWD or configurable)
  <domain>/                        ← e.g. "trading", "devops", "companion"
    _index.md                      ← TOC + metadata, always loaded (~500-1K tokens)
    _core.md                       ← L0 never-break rules (~2-3K tokens)
    <article-slug>.md              ← L1 LLM-authored articles (~3-5K each)
    raw/                           ← source material (user drops here)
      <anything>.md|.txt|.pdf|.url
```

### Article format (frontmatter)
```yaml
---
title: Entry Rules for Memecoin Trading
domain: trading
compiled_from:
  - raw/research-v2.md
  - raw/trade-journal-march.json
compiled_by: claude-sonnet-4-6
compiled_at: 2026-04-07T10:00:00Z
tokens: 1200
tags: [entry, memecoin, rules]
---

Article content here...
```

### _index.md format
```yaml
---
domain: trading
article_count: 12
total_tokens: 15400
last_compiled: 2026-04-07T10:00:00Z
---

# Trading Knowledge Base

## Core Rules (always loaded)
- [_core.md](_core.md) — 2.1K tokens — Never-break trading rules

## Articles
- [entry-rules.md](entry-rules.md) — 1.2K tokens — When and how to enter trades
- [exit-strategy.md](exit-strategy.md) — 1.5K tokens — Take-profit and stop-loss rules
- [risk-management.md](risk-management.md) — 0.9K tokens — Position sizing and exposure
...
```

## Tasks
- [x] Create `packages/server/src/wiki/` module directory
- [x] `types.ts` — WikiDomain, WikiArticle, WikiIndex, CompileResult interfaces
- [x] `store.ts` — CRUD for wiki filesystem (read/write/list articles, manage raw/)
- [x] `compiler.ts` — LLM compiler: raw material → wiki articles
  - Input: raw files from `wiki/<domain>/raw/`
  - Process: read all raw → send to LLM with compile prompt → write articles
  - Output: article .md files with frontmatter
  - Uses Companion's own AI provider (not external API)
- [x] `retriever.ts` — Context-loading retrieval
  - `getIndex(domain)` → always returns _index.md content
  - `getCore(domain)` → always returns _core.md content
  - `getArticle(domain, slug)` → returns full article
  - `searchArticles(domain, query)` → keyword search across article titles + tags
  - `getRelevantArticles(domain, taskDescription, budget)` → LLM picks which articles to load
- [x] `index.ts` — public API surface
- [x] API routes: `packages/server/src/routes/wiki.ts`
  - `GET /api/wiki` — list all domains
  - `GET /api/wiki/:domain` — get index
  - `GET /api/wiki/:domain/articles` — list articles with metadata
  - `GET /api/wiki/:domain/articles/:slug` — read article
  - `POST /api/wiki/:domain/compile` — trigger compilation
  - `POST /api/wiki/:domain/query` — search/retrieve relevant articles
  - `POST /api/wiki/:domain/raw` — upload raw material
  - `DELETE /api/wiki/:domain/articles/:slug` — delete article
- [x] Register routes in `packages/server/src/routes/index.ts`
- [x] Add wiki config to types (`WikiConfig` in types.ts, settings in store.ts)

## Acceptance Criteria
- [ ] Can create a domain with `_index.md` and `_core.md`
- [ ] Can drop raw files and trigger compile → articles generated
- [ ] Can retrieve index + core + specific articles via API
- [ ] Can search articles by keyword
- [ ] Articles have correct frontmatter (compiled_from, tokens, tags)
- [ ] Token count in frontmatter matches actual content
- [ ] Compile is idempotent — re-running doesn't duplicate articles

## Files Touched
- `packages/server/src/wiki/types.ts` — new
- `packages/server/src/wiki/store.ts` — new
- `packages/server/src/wiki/compiler.ts` — new
- `packages/server/src/wiki/retriever.ts` — new
- `packages/server/src/wiki/index.ts` — new
- `packages/server/src/routes/wiki.ts` — new
- `packages/server/src/index.ts` — modify (register routes)
- `packages/server/src/db/schema.ts` — modify (wiki settings if needed)

## Dependencies
- AI provider must be configured (for compiler)
- No external services required
