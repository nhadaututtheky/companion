# Phase 1: Signal Engine (Backend)

## Goal
Build `PulseEstimator` service that taps ws-bridge events, collects 7 behavioral signals, computes composite score + operational state, and broadcasts `pulse:update` events to browsers.

## Tasks
- [x] Create `packages/server/src/services/pulse-estimator.ts` — main service
- [x] Implement 7 signal collectors in sliding window (last 5 turns)
- [x] Composite scoring algorithm with weighted signals
- [x] Operational state classifier (flow → spiraling)
- [x] Trend detection (improving / stable / degrading)
- [x] Hook into ws-bridge `handleAssistant` — fire-and-forget tap (same pattern as event-collector)
- [x] Hook into ws-bridge `handleResult` — capture cost/usage deltas
- [x] Broadcast `pulse:update` event via `broadcastToAll`
- [x] Add `pulse:update` to `BrowserIncomingMessage` union type in shared types
- [x] Cleanup on session end (removeTracker pattern)
- [x] TypeScript compiles clean

## Signal Collectors (7 dimensions)

### 1. FailureRate (weight: 25%)
- Source: `tool_result` blocks with `is_error: true`
- Track: consecutive errors, error/total ratio in window
- Spike: 3+ consecutive errors = 0.9, 2 consecutive = 0.6
- Decay: resets on successful tool_result

### 2. EditChurn (weight: 20%)
- Source: `tool_use` Edit/Write blocks — track `file_path`
- Track: Map<filePath, editCount> in last 5 turns
- Spike: same file edited 4+ times = 0.9, 3x = 0.6
- Only count Edit (not Read)

### 3. CostAcceleration (weight: 15%)
- Source: `handleResult` → `msg.usage.input_tokens + output_tokens`
- Track: tokens-per-turn for last 5 turns, compute slope
- Spike: if latest turn > 2x average of previous 4 = 0.8
- Normalize: relative to session average, not absolute

### 4. ContextPressure (weight: 10%)
- Source: `context_update` events → `contextUsedPercent`
- Direct mapping: score = max(0, (percent - 50) / 50)
- 50% = 0.0, 75% = 0.5, 100% = 1.0

### 5. ThinkingDepth (weight: 10%)
- Source: `stream_event` thinking_delta blocks — accumulate chars
- Track: thinking chars per turn
- Spike: thinking > 3x session average = 0.7
- This detects "wrestling with a decision"

### 6. ToolDiversity (weight: 10%)
- Source: `tool_use` block names in last 5 turns
- Track: Shannon entropy of tool distribution
- Low entropy (1 tool repeated) = high score
- Formula: 1 - (entropy / log2(uniqueTools))
- Min 3 tool_uses in window before activating

### 7. CompletionTone (weight: 10%)
- Source: final `assistant` text content
- Keyword match (lightweight, no AI call):
  - Hedging: "I apologize", "Let me try again", "I'm not sure" → +0.3
  - Failure: "I cannot", "error occurred", "failed to" → +0.5
  - Recovery: "fixed", "resolved", "working now" → -0.3
- Cap at 0-1 range

## Composite Score Formula
```
score = Σ(signal_i × weight_i) × 100
```
Clamped to 0-100. Exponential decay: turn N-1 weight = 1.0, N-2 = 0.7, N-3 = 0.5, N-4 = 0.3, N-5 = 0.15

## State Classification
```
score 0-15  + low churn + diverse tools → "flow"
score 0-25  + high thinking              → "focused"
score 20-45 + moderate churn             → "cautious"
score 40-65                              → "struggling"
score 60-85 + high failure + high churn  → "spiraling"
score > 80                               → "critical" (alias of spiraling)
waiting for permission                   → "blocked"
```

## PulseUpdate Event Shape
```typescript
interface PulseUpdate {
  type: "pulse:update";
  sessionId: string;
  score: number;           // 0-100
  state: OperationalState;
  trend: "improving" | "stable" | "degrading";
  signals: Record<string, number>; // each 0-1
  topSignal: string;       // highest contributor name
  turn: number;
  timestamp: number;
}
```

## Integration Points (ws-bridge)
- After tool_use loop (line ~1190): `pulseEstimator.recordToolUse(session.id, toolName, input)`
- After tool_result detection (line ~1225): `pulseEstimator.recordToolResult(session.id, toolName, isError)`
- In handleResult (line ~1432): `pulseEstimator.recordTurnResult(session.id, usage, cost)`
- In context_update broadcast (line ~1366): `pulseEstimator.recordContextUpdate(session.id, percent)`
- In thinking_delta handler: `pulseEstimator.recordThinking(session.id, thinkingChars)`
- In session end: `pulseEstimator.cleanup(session.id)`
- After each recordTurnResult: compute score → broadcastToAll pulse:update

## Files Touched
- `packages/server/src/services/pulse-estimator.ts` — new
- `packages/server/src/services/ws-bridge.ts` — modify (6 hook points)
- `packages/shared/src/types/session.ts` — modify (add pulse:update type)
- `packages/shared/src/index.ts` — modify (export new types if needed)

## Acceptance Criteria
- [x] PulseEstimator computes score for active sessions
- [x] Score updates broadcast after each turn result
- [x] Fire-and-forget — never blocks agent thread
- [x] Cleanup on session end (no memory leak)
- [x] TypeScript compiles clean on both packages
