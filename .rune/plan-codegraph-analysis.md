# Feature: CodeGraph Advanced Analysis (port from code-review-graph)

## Overview
Port 5 high-value analysis features from code-review-graph into Companion's CodeGraph: FTS5 search, blast radius scoring, community detection, execution flow tracing, and RRF search fusion.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | FTS5 Full-Text Search | ✅ Done | plan-codegraph-analysis-p1.md | FTS5 virtual table + triggers, porter stemming, auto-sync |
| 2 | Blast Radius Scoring | ✅ Done | — | Risk score 0.0–1.0 (5 factors), security keywords, /risk endpoint |
| 3 | Execution Flow Tracing | ✅ Done | — | BFS from entry points, max depth 15, /flows endpoint |
| 4 | Community Detection | ✅ Done | — | File-path grouping + cohesion scoring, /communities endpoint |
| 5 | RRF Search Fusion | ✅ Done | — | FTS5 + symbol LIKE merged via RRF formula, upgraded /search |

## Key Decisions
- All new features use existing SQLite + Drizzle stack (no new dependencies)
- Community detection: file-path grouping first (no igraph dep), Leiden later if needed
- FTS5 via raw SQL (Drizzle doesn't support virtual tables natively)
- Risk scores computed on-demand (not stored), cached in memory per scan
- Execution flows: BFS max depth 15, cycle-safe via visited set
