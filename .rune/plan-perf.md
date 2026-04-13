# Feature: Web Performance Overhaul

## Overview
Fix critical performance bottlenecks causing message lag, empty chat bubbles, and excessive resource usage during streaming. Root causes: duplicate WS connections, zero memoization, no virtualization in mini-terminal, MarkdownMessage re-parsing on every render.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | WS Singleton | ✅ Done | plan-perf-phase1.md | Shared WS connection per session, eliminate duplicates |
| 2 | Memo + Render | ✅ Done | plan-perf-phase2.md | React.memo on bubbles, hoist MarkdownMessage components |
| 3 | Virtualization | ✅ Done | plan-perf-phase3.md | CompactMessageFeed virtualization, lower threshold |
| 4 | Store + Scroll | ✅ Done | plan-perf-phase4.md | Narrow Zustand selectors, smart auto-scroll |
| 5 | Server Batching + Leaks | ✅ Done | plan-perf-phase5.md | Server-side stream batching, memory leak cleanup |

## Key Decisions
- WS singleton via React context (not global Map) — per-session sharing
- Virtualization threshold 20 for both compact and full feeds
- Server batch interval 30ms (balance latency vs throughput)
- React.memo with custom comparator for MessageBubble (compare content + isStreaming only)
