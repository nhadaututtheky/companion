# Phase 2: Smart Compressors

## Goal
Add domain-specific compressors that understand tool output structure — stack traces, errors, tests, diffs, JSON.

## Tasks
- [ ] Strategy: Stack trace compressor — keep top 3 frames + root cause, collapse middle
- [ ] Strategy: Error type aggregator — group by error code, count occurrences, list unique files
- [ ] Strategy: Test result summarizer — collapse passed tests, keep failed with output
- [ ] Strategy: Diff summarizer — summarize large diffs by file + function-level changes
- [ ] Strategy: JSON depth limiter — truncate nested objects past depth N
- [ ] Strategy: Directory tree collapser — group files by directory, collapse large dirs
- [ ] Strategy: Boilerplate header/footer removal — tool-specific patterns (npm, cargo, tsc)
- [ ] Add tool-name-based strategy routing (apply stack trace only to Bash errors, etc.)
- [ ] Tests for all new strategies

## Files Touched
- `packages/server/src/rtk/strategies/stack-trace.ts` — new
- `packages/server/src/rtk/strategies/error-aggregate.ts` — new
- `packages/server/src/rtk/strategies/test-summary.ts` — new
- `packages/server/src/rtk/strategies/diff-summary.ts` — new
- `packages/server/src/rtk/strategies/json-limiter.ts` — new
- `packages/server/src/rtk/strategies/tree-collapse.ts` — new
- `packages/server/src/rtk/strategies/boilerplate.ts` — new
- `packages/server/src/rtk/pipeline.ts` — modify (tool-name routing)
- `packages/server/src/tests/rtk-strategies.test.ts` — new

## Dependencies
- Phase 1 complete (pipeline infrastructure)
