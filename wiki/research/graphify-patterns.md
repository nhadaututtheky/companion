---
title: "Graphify — Living Knowledge Graph Patterns for Agents"
domain: research
compiled_from:
  - github.com/safishamsi/graphify
compiled_by: agent-research
compiled_at: 2026-04-12T00:00:00Z
tokens: 1200
tags: [knowledge-graph, agent-wiki, karpathy, living-knowledge, token-optimization]
---

# Graphify — Living Knowledge Graph for AI Agents

Claude Code skill that transforms mixed content (code, docs, PDFs, URLs) into a queryable, persistent knowledge graph. Not RAG (no embeddings), not static wiki. Claims **71.5x fewer tokens per query** vs raw file reading.

## Core Philosophy

Wiki written BY agents, FOR agents. Every interaction is an opportunity to improve the knowledge base. Graph topology (how things reference each other) over semantic similarity (what things sound like).

## Key Patterns Worth Adopting

### 1. Self-Archiving Queries
Agent queries knowledge → Q&A saved as raw material → next compile cycle ingests it → knowledge grows from agent usage itself.

### 2. Confidence Tiering
Every fact/relationship tagged: EXTRACTED (from source directly) / INFERRED (agent deduced) / AMBIGUOUS (needs verification). Agent knows trust level before acting on knowledge.

### 3. Dual-Speed Updates
- Code/structured content → auto-update via AST, zero LLM cost
- Semantic content → flag `needs_update`, deferred to explicit invocation
- Graph always current for structure, eventually consistent for semantics

### 4. God Nodes = Cognitive Shortcuts
Top-N highest-degree nodes = load-bearing abstractions. One god-node article (~500 tokens) replaces scanning 10+ source files. Pre-computed hub summaries for fast agent navigation.

### 5. Community Clustering (Topology, Not Embeddings)
Leiden algorithm clusters by graph edge density — deterministic, reproducible, no embedding model needed. One community article (~300-500 tokens) covers an entire module cluster.

### 6. Surprising Connections
Cross-domain pattern detection during compile: "repo A and repo B solve same problem differently" → auto-generate cross-reference articles.

### 7. Needs-Update Flag
Agent detects outdated article during use → writes flag file → doesn't block current work → next maintenance cycle handles it. Async signal, zero-dependency.

## Token Optimization Architecture

| Layer | Tokens | What |
|-------|--------|------|
| Index | ~200 | Catalog of all communities + god nodes |
| Community article | ~300-500 | Overview of one cluster |
| God node article | ~500 | Hub concept with all connections |
| Full graph query | ~2000 (budgeted) | BFS/DFS traversal result |

vs. reading raw files: 50K+ tokens for same understanding.

## Architecture

```
graphify-out/
  graph.json       — node-link format + communities + confidence
  cache/{sha256}.json — content-addressed extraction cache
  wiki/index.md    — agent entry point
  wiki/<Community>.md — per-cluster articles
  wiki/<GodNode>.md — hub concept articles
  needs_update     — async flag for deferred re-extraction
```

MCP server exposes 7 tools: query_graph, get_node, get_neighbors, get_community, god_nodes, graph_stats, shortest_path. All token-budgeted (default 2000).

## Differences from Static Wiki

- Updates: automatic (git hooks, watchdog) vs manual
- Structure: topology-clustered graph vs flat pages
- Links: typed + confidence-weighted vs untyped hyperlinks
- Discovery: surprising connections surfaced vs only what you search for
- Growth: self-archiving queries vs manual authoring only

## Source
https://github.com/safishamsi/graphify — MIT license, Python 3.10+
