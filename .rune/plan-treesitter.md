# Feature: Tree-sitter WASM CodeGraph Upgrade

## Overview
Replace regex-based CodeGraph scanner with Tree-sitter WASM for accurate AST parsing, call graph extraction, and incremental edge resolution. Goal: match GitNexus parser accuracy while keeping Companion's unique live-session awareness + fog-of-war.

## Why
- Current regex parser misses: call graphs, re-exports, scope/aliasing, accurate line ranges
- Edge rebuild is O(n²) — deletes ALL edges and re-scans ALL files on every incremental update
- Context injection injects ~3000 tokens/turn with false positives → Tree-sitter can cut to ~1500 tokens with precise targeting
- Competitors (GitNexus) use Tree-sitter + Graph RAG — we need parity on parsing, then win on live awareness

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Drop-in Scanner Replace | ✅ Done | plan-treesitter-phase1.md | Swap regex → Tree-sitter WASM, same `scanFile()` interface |
| 2 | Call Graph Extraction | ✅ Done | plan-treesitter-phase2.md | Extract `calls` edges from AST, update trust weights |
| 3 | Incremental Edge Resolution | ✅ Done | plan-treesitter-phase3.md | Only re-resolve edges for changed files (kill O(n²)) |
| 4 | Advanced Analysis | ✅ Done | plan-treesitter-phase4.md | Re-export chains, import aliases, weighted search |

## Key Decisions
- Use `web-tree-sitter@^0.25.10` (NOT 0.26.x — ABI break with WASM grammars)
- WASM grammars loaded lazily per-language (not all upfront) to save memory
- Scanner interface unchanged: `scanFile(code, filePath, language): ScanResult` — downstream code untouched
- Regex scanner kept as fallback for unsupported languages
- Native bindings NOT used (WASM is cross-platform, Bun compat confirmed)

## Architecture Notes
- All codegraph files live in `packages/server/src/codegraph/`
- Scanner types: `ScannedNode` (symbolName, symbolType, signature, isExported, lineStart, lineEnd, bodyPreview)
- Scanner types: `ScannedEdge` (sourceSymbol, targetFilePath, targetSymbol, edgeType, context)
- Edge types defined in `trust-calculator.ts`: imports, calls, extends, implements, uses_type, renders_component, routes_to, queries_table, tests, configures
- `diff-updater.ts` line 229-291: the O(n²) edge rebuild loop that Phase 3 will fix
- `agent-context-provider.ts`: 5 injection points (project_map, message_context, plan_review, break_check, activity_feed) — benefit from better data but don't need code changes
- DB schema: `code_files`, `code_nodes`, `code_edges`, `code_scan_jobs` (Drizzle ORM + SQLite)

## Competitor Reference
- **GitNexus**: Browser-based, Tree-sitter WASM, knowledge graph with Graph RAG Agent, 12+ languages
- **Grapuco**: SaaS MCP server for code graphs, AI-powered indexing, $9/mo
- **Companion advantages** (keep): Live session awareness, fog-of-war, real-time tool→node highlighting, context injection, pulse health monitor
- **Companion gap** (fix): Regex parser → Tree-sitter AST, no call graph, no re-export tracking
