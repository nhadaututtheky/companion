# Phase 1: Core Pipeline + Quick Wins

## Goal
Build the RTK transform pipeline with 4 easy-win compressors that deliver immediate token savings.

## Tasks
- [ ] Create `RTKStrategy` interface + `RTKPipeline` class — packages/server/src/rtk/pipeline.ts
- [ ] Strategy: ANSI/control char stripper — packages/server/src/rtk/strategies/ansi-strip.ts
- [ ] Strategy: Blank line collapser — packages/server/src/rtk/strategies/blank-collapse.ts
- [ ] Strategy: Duplicate line merger — packages/server/src/rtk/strategies/dedup.ts
- [ ] Strategy: Smart truncation (keep head+tail, cut middle) — packages/server/src/rtk/strategies/truncate.ts
- [ ] Integrate pipeline into ws-bridge.ts `handleAssistant()` for tool_result blocks
- [ ] Add RTK savings tracking to session state (tokens saved counter)
- [ ] Write tests for all strategies — packages/server/src/tests/rtk-pipeline.test.ts
- [ ] Export RTK types from shared package

## Design

### RTKStrategy Interface
```typescript
interface RTKStrategy {
  name: string;
  /** Return null to skip (no change needed) */
  transform(input: string, context?: RTKContext): RTKResult | null;
}

interface RTKResult {
  output: string;
  tokensSaved: number; // estimated
}

interface RTKContext {
  toolName?: string;    // "Bash", "Read", "Grep", etc.
  sessionId: string;
  isError?: boolean;    // never compress error outputs aggressively
}
```

### RTKPipeline
```typescript
class RTKPipeline {
  private strategies: RTKStrategy[];
  
  transform(input: string, context?: RTKContext): {
    compressed: string;
    original: string;
    savings: { totalTokensSaved: number; strategiesApplied: string[] };
  }
}
```

### Strategy Details

**1. ANSI Strip** — extend VirtualScreen.sanitize(), also remove progress bars/spinners
- Pattern: `\x1b\[[0-9;]*[A-Za-z]`, OSC sequences, carriage returns with overwrite

**2. Blank Collapse** — collapse 2+ consecutive blank lines into 1
- Simple but saves 5-10% on verbose outputs

**3. Dedup** — hash each line, merge duplicates: `[x142] WARNING: unused variable`
- Threshold: 3+ occurrences to trigger merge
- Keep first occurrence verbatim, collapse rest with count
- Sort merged groups by frequency (most common first)

**4. Smart Truncation** — if output > MAX_LINES (default 200):
- Keep first 80 lines (head) + last 40 lines (tail)
- Middle replaced with: `... (580 lines omitted — use tool to read full output) ...`
- Never truncate if `isError: true`

### Integration in ws-bridge.ts
```typescript
// In handleAssistant(), when processing tool_result blocks:
if (block.type === "tool_result" && typeof block.content === "string") {
  const result = this.rtkPipeline.transform(block.content, {
    toolName: parentToolName,
    sessionId: session.id,
    isError: block.is_error,
  });
  // Track savings
  session.state.rtk_tokens_saved += result.savings.totalTokensSaved;
  // Browser gets original, LLM context already consumed original
  // But we track what COULD be saved for metrics
}
```

## Acceptance Criteria
- [ ] Pipeline processes tool_result content blocks
- [ ] 4 strategies working with tests
- [ ] Token savings tracked per session
- [ ] No data loss — full output always preserved for UI
- [ ] Tests pass: strategy unit tests + integration test

## Files Touched
- `packages/server/src/rtk/pipeline.ts` — new
- `packages/server/src/rtk/strategies/ansi-strip.ts` — new
- `packages/server/src/rtk/strategies/blank-collapse.ts` — new
- `packages/server/src/rtk/strategies/dedup.ts` — new
- `packages/server/src/rtk/strategies/truncate.ts` — new
- `packages/server/src/rtk/index.ts` — new (barrel export)
- `packages/server/src/services/ws-bridge.ts` — modify (integrate pipeline)
- `packages/server/src/tests/rtk-pipeline.test.ts` — new
- `packages/shared/src/types/session.ts` — modify (add rtk_tokens_saved to SessionState)
