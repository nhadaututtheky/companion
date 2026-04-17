# Phase 5: v2 Providers (Deferred)

## Goal

Reserved for post-v1 expansion once inline suggest is proven. Add
higher-effort providers that need more infrastructure or tuning.

## Status: DEFERRED until Phases 1-4 ship + telemetry data collected

Telemetry from Phase 4 will tell us which v1 providers deliver value
and whether UI friction is low. Only then invest in v2 providers.

## Candidate providers (priority order)

### A. Model Switch Provider (high value, medium effort)

Suggests switching between Haiku / Sonnet / Opus based on prompt
complexity signals.

**Signals**:
- Short prompt + simple verbs ("list", "show", "what is") → Haiku
- "architect", "design", "deep dive", "audit" → Opus
- Anything else → Sonnet (default, no suggestion)

**Action**: `{ type: 'set-model', payload: { model: 'haiku' | 'sonnet' | 'opus' } }` — dispatches to session store.

**Cost estimate**: show pre-send cost delta ("Save $0.08 with Haiku").

### B. Memory Recall Provider (high value, low effort — NM already integrated)

Queries `nmem_recall` with prompt keywords, shows top 2 memories as
suggestions: accept → inject recalled memory into prompt context.

**Trigger**: any prompt > 20 chars.
**Score**: 0.4-0.6 (informational, not actionable).
**UI**: different pill style — "📝 Found 2 relevant memories" → expand on click.

### C. Context Compaction Provider (medium value, low effort)

When token usage > 75%, surface `/compact` with smart boundary detection
(compact up to last tool use, keep last N messages).

**Trigger**: token count threshold, not prompt content.
**Score**: 0.9 (urgent).
**UI**: warning-styled pill.

### D. Parallelization Hint (low value, medium effort)

Detect "do X and Y and Z" patterns → suggest rewriting prompt to signal
parallel execution.

**Defer indefinitely** unless telemetry shows users asking sequential
multi-step prompts often.

### E. Related Past Sessions (low value, high effort)

Embed prompt → cosine similarity against past session embeddings →
suggest most similar past session.

**Requires**: session embedding pipeline, vector store.
**Probably not worth it** unless a clear pain signal emerges.

## Decision rules for unlocking a v2 provider

1. Phase 4 telemetry shipped + 30 days of data
2. v1 accept rate > 20% (proves inline suggest model works)
3. Provider-specific value hypothesis validated (survey or feedback)

## Files Touched (when unlocked)

Each provider = 1 new `providers/*.provider.ts` file + tests. No core
engine changes expected — Phase 1 contract must stay stable. If a
provider needs contract changes, revisit engine design first.

## Out of scope

- Anything requiring a new UI paradigm (not a strip pill)
- Providers requiring paid APIs or external infra
