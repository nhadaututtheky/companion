# Feature: WebIntel — Web Intelligence Layer for Agents

## Overview

WebIntel gives Companion agents the ability to fetch, understand, and use web content — documentation lookups, web research, data crawling — all optimized for minimal token usage. Built on webclaw (Rust HTTP scraper, 67% token reduction vs raw HTML) as a Docker sidecar, with smart context injection into agent sessions.

Two user needs:
1. **Agent productivity** — auto-fetch docs when agent encounters unknown library, inject into context
2. **User workflows** — agents crawl/extract web data on demand (research, monitoring, data collection)

## Phases

| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Sidecar + Scrape Service | ⬚ Pending | plan-webintel-phase1.md | Docker sidecar, TS client, health check, `/docs` command |
| 2 | Agent Auto-Injection | ⬚ Pending | plan-webintel-phase2.md | Detect library mentions → auto-fetch docs → inject context |
| 3 | Web Research + Crawl | ⬚ Pending | plan-webintel-phase3.md | Multi-page research, site crawl, result caching |
| 4 | UI + Telegram Commands | ⬚ Pending | plan-webintel-phase4.md | Web panel, Telegram /web commands, crawl status |

## Key Decisions

- **webclaw over Playwright** — HTTP-only, 3.2ms/page, no browser overhead, 99% anti-bot bypass via TLS fingerprinting. Companion is Docker-first, adding Chromium is too heavy
- **Docker sidecar** — webclaw runs as separate container (`ghcr.io/0xmassi/webclaw`), Companion calls via internal REST API (`http://webclaw:3100/v1/scrape`)
- **Token budget** — all injected web content capped at 2000 tokens per injection, LLM format used (67% smaller than raw HTML)
- **Cache layer** — scrape results cached in SQLite (1hr TTL for docs, 15min for research) to avoid redundant fetches
- **Optional, not required** — WebIntel is opt-in. Companion works fine without webclaw container. All injection points gracefully skip if webclaw unavailable
- **contextplus reference** — contextplus's memory graph pattern (nodes + edges + decay) influences how we store/retrieve cached web knowledge across sessions

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Companion Server                          │
│                                                              │
│  ┌─────────────────┐   ┌──────────────────────┐            │
│  │  web-intel.ts    │──>│  web-intel-cache.ts   │           │
│  │  (REST client)   │   │  (SQLite cache)       │           │
│  └────────┬─────────┘   └──────────────────────┘            │
│           │                                                  │
│  ┌────────▼─────────────────────────────────────────┐       │
│  │            Agent Context Injector                 │       │
│  │                                                   │       │
│  │  ws-bridge.ts hooks:                              │       │
│  │  - handleUserMessage() → detect lib mentions      │       │
│  │    → auto-fetch docs → prepend to message         │       │
│  │  - /docs command → explicit doc lookup            │       │
│  │  - /research command → multi-page synthesis       │       │
│  │  - /crawl command → site crawl + summarize        │       │
│  └───────────────────────────────────────────────────┘       │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP (internal Docker network)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   webclaw Sidecar                             │
│  ghcr.io/0xmassi/webclaw:latest                              │
│  Port 3100 (internal only)                                   │
│                                                              │
│  Endpoints:                                                  │
│  POST /v1/scrape  — single page extract (markdown/llm/json) │
│  POST /v1/crawl   — recursive site crawl (async job)        │
│  POST /v1/batch   — multi-URL concurrent extract            │
│  POST /v1/search  — web search (requires API key)           │
│  POST /v1/extract — LLM-powered structured extraction       │
└──────────────────────────────────────────────────────────────┘
```

## Integration with CodeGraph

When both WebIntel and CodeGraph are active:
1. CodeGraph detects `import X from "unknown-lib"` (no local definition)
2. WebIntel auto-resolves library docs URL (npm registry → README/docs link)
3. Fetches + caches docs via webclaw
4. Injects relevant section into agent context
5. CodeGraph stores the library as a known external node with docs URL

## Token Budget Rules

| Injection Type | Max Tokens | TTL Cache |
|----------------|-----------|-----------|
| Auto doc lookup | 2,000 | 1 hour |
| /docs explicit | 4,000 | 1 hour |
| /research synthesis | 3,000 | 15 min |
| /crawl results | 5,000 | 30 min |
| Per-message total cap | 4,000 | — |

## Risk Register

| Risk | Mitigation |
|------|------------|
| webclaw container not running | Graceful skip — `isWebclawAvailable()` health check, all injections silently skip |
| webclaw REST server not in Docker image | Fallback: run webclaw-mcp via stdio as subprocess, or build from source with server entrypoint |
| JS-rendered SPA pages fail | Note in docs: webclaw is HTTP-only. For JS sites, user needs WEBCLAW_API_KEY (cloud fallback) |
| Token budget exceeded | Hard cap per injection type + per-message total cap. Truncate with "... [truncated, full docs at URL]" |
| Cache stale docs | 1hr TTL + manual `/docs --refresh` flag |
| webclaw search needs API key | Document clearly. Search/research features are premium. Basic scrape works without key |
