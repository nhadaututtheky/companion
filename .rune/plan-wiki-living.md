# Feature: Wiki KB Living Knowledge Upgrade

## Overview
Upgrade Wiki KB from static document store to living knowledge system inspired by Graphify patterns.
Agents read, write, and maintain wiki — every interaction improves the knowledge base.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Confidence Tiering + Article Metadata | ✅ Done | plan-wiki-living-phase1.md | Add confidence field to ArticleMeta, update store/compiler/UI |
| 2 | Self-Archiving Queries | ✅ Done | plan-wiki-living-phase2.md | Agent queries → saved as raw material for future compile cycles |
| 3 | Needs-Update Flag | ✅ Done | plan-wiki-living-phase3.md | Agent marks articles stale via API, enhanced linter, deferred maintenance |
| 4 | Cross-Domain Index Awareness | ✅ Done | plan-wiki-living-phase4.md | Secondary domain indexes in L0, cross-domain query API |

## Key Decisions
- No graph engine or embeddings — enhance existing keyword search + filesystem store
- Confidence is per-article (not per-fact) — pragmatic granularity for wiki scale
- Self-archiving is fire-and-forget — never blocks the query response
- Cross-domain is index-only in L0 (~200 tokens per domain) — articles loaded on-demand
- `needs_update` is a flag file per domain (like Graphify), not per-article DB field

## Architecture
```
[Agent Session]
  ├── L0 inject: primary domain core + secondary domain indexes (routing catalog)
  ├── On-demand query: POST /api/wiki/:domain/query (any domain, cross-domain)
  ├── Self-archive: query + result → raw/query-<timestamp>.md (fire-and-forget)
  └── Flag stale: POST /api/wiki/:domain/flag-stale/:slug → needs_update marker

[Compile Cycle]
  ├── Ingests: raw files + archived queries + session findings
  ├── Outputs: articles with confidence tags (EXTRACTED/INFERRED/AMBIGUOUS)
  └── Clears: needs_update flag after successful compile
```

## Dependencies/Risks
- Confidence tiering requires compiler prompt update — may affect article quality
- Self-archiving could spam raw/ folder if queries are frequent — need dedup/throttle
- Cross-domain index grows L0 token cost by ~200 per additional domain
- Needs-update flag is domain-level — simple but coarse (acceptable at current scale)
