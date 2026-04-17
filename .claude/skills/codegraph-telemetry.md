---
name: codegraph-telemetry
description: Analyze CodeGraph query effectiveness — hit rate, miss patterns, slow queries, usage breakdown
---

Invoke `codegraph_telemetry_summary` MCP tool when the user asks:
- "codegraph co hieu qua khong"
- "queries nao agent miss nhieu"
- "query nao slow"
- "analyze codegraph usage"
- "hit rate codegraph"
- "codegraph telemetry"
- "codegraph performance"
- "which queries are slow"
- "which query types have low hit rate"

## Tool: codegraph_telemetry_summary

Input:
- `projectSlug` (required) — project to analyze
- `rangeDays` (optional, default 7) — how many days to look back (max 90)

Returns JSON with:
- `totalQueries` — total number of CodeGraph queries logged
- `overallHitRate` — fraction of queries that returned >=1 result (0.0-1.0)
- `byType` — array of { queryType, totalCalls, hitRate, avgLatencyMs, p95LatencyMs, avgTokensReturned }
- `top10Slowest` — top 10 slowest individual queries
- `queriesOverTime` — daily query volume buckets

## Interpretation Guide

- hitRate < 0.5 for a queryType -> index quality issue or wrong keywords
- p95LatencyMs > 200 -> performance regression risk
- avgTokensReturned > 1000 -> context bloat risk (may need trimming in Phase 2)
- Low totalQueries after 7 days -> agents not using CodeGraph enough; surface graph in UX first
