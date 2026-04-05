# Phase 2: Session Pulse UI (Frontend)

## Goal
Display real-time Pulse indicator in session header + expandable warning banner with action buttons when score exceeds thresholds. User sees agent health at a glance and can choose to intervene.

## Tasks
- [x] Create `packages/web/src/lib/stores/pulse-store.ts` — Zustand store for pulse state per session
- [x] Handle `pulse:update` event in `use-session.ts` → push to pulse store
- [x] Create `packages/web/src/components/pulse/pulse-indicator.tsx` — compact dot + score
- [x] Create `packages/web/src/components/pulse/pulse-warning.tsx` — expandable warning banner + action buttons
- [x] Integrate PulseIndicator into `session-header.tsx` — next to context meter
- [x] Integrate PulseWarning into `expanded-session.tsx` — above chat feed when score > 40
- [x] Sparkline mini-chart on hover/click (last 20 readings)
- [x] Clear pulse state on cli_disconnected
- [x] TypeScript compiles clean

## Pulse Store
```typescript
interface PulseReading {
  score: number;
  state: OperationalState;
  trend: "improving" | "stable" | "degrading";
  signals: Record<string, number>;
  topSignal: string;
  turn: number;
  timestamp: number;
}

interface PulseStore {
  // sessionId → latest reading
  readings: Map<string, PulseReading>;
  // sessionId → history (last 20 for sparkline)
  history: Map<string, PulseReading[]>;
  
  pushReading: (sessionId: string, reading: PulseReading) => void;
  clear: (sessionId: string) => void;
}
```

## PulseIndicator Component (compact — in header)
- Colored dot: green/indigo/amber/red based on score
- Score number (small, monospace)
- State label on hover tooltip
- Trend arrow: ▲ improving, ▬ stable, ▼ degrading
- Animate dot pulse when state changes
- Click → toggle sparkline popover

```
[🟢 12]  or  [🟡 54 ▼]  or  [🔴 78 ▼]
```

Layout in session-header (after context meter, before cost):
```
● live  @abc123  Sonnet  [████░░ 62%]  [🟡 54 ▼]  $0.42
                                        ^^^^^^^^
                                        Pulse indicator
```

## PulseWarning Component (expandable — above chat)
Appears when score > 40. Expandable banner with:

### Warning Text (varies by state)
```
struggling (41-60):
"Agent is showing signs of difficulty — editing the same files repeatedly 
with rising error rate."

spiraling (61-80):
"Agent appears to be in a failure loop — 4 consecutive errors on 
packages/server/src/foo.ts. Consider intervening."

critical (81-100):
"⚠️ Agent is in critical state — high failure rate, cost accelerating, 
context nearly full. Human intervention recommended."
```

### Signal Breakdown (collapsed by default, expand to see)
```
Failure Rate:  ████████░░ 82%  ← 3 consecutive errors
Edit Churn:    ██████░░░░ 61%  ← foo.ts edited 4x
Cost Accel:    ████░░░░░░ 38%  
Context:       ███░░░░░░░ 29%
Thinking:      ██░░░░░░░░ 15%
Tool Diversity:█░░░░░░░░░ 10%
Tone:          ██░░░░░░░░ 18%
```

### Action Buttons (the core — user decides)
```
[ 💬 Send Guidance ]  [ 🧊 Inject Calm ]  [ ⏸ Pause Session ]  [ ✕ Dismiss ]
```

- **Send Guidance**: Opens text input → sends as user_message with a pre-filled suggestion
  - Pre-fill: "Stop and reconsider your approach. The issue might not be in {topFile}. 
    Read the error message carefully and consider if the root cause is elsewhere."
  - User can edit before sending
- **Inject Calm**: Sends a structured guidance message (Phase 4 — disabled until P4)
- **Pause Session**: Equivalent to sending "STOP" or pausing — user confirms
- **Dismiss**: Hides warning for this episode (reappears if score increases by 10+)

## Sparkline Mini-Chart
- SVG sparkline, 120px wide, 24px tall
- Last 20 pulse readings
- Color gradient matches score (green → red)
- Appears in popover on PulseIndicator click
- Show turn numbers on x-axis (hover)

## Color Mapping
```typescript
function getPulseColor(score: number): string {
  if (score <= 20) return "#10B981"; // green
  if (score <= 40) return "#6366F1"; // indigo
  if (score <= 60) return "#F59E0B"; // amber
  if (score <= 80) return "#EF4444"; // red
  return "#DC2626";                   // dark red
}
```

## Files Touched
- `packages/web/src/lib/stores/pulse-store.ts` — new
- `packages/web/src/components/pulse/pulse-indicator.tsx` — new
- `packages/web/src/components/pulse/pulse-warning.tsx` — new
- `packages/web/src/hooks/use-session.ts` — modify (handle pulse:update)
- `packages/web/src/components/grid/session-header.tsx` — modify (add PulseIndicator)
- `packages/web/src/components/grid/expanded-session.tsx` — modify (add PulseWarning)

## Acceptance Criteria
- [x] Pulse dot visible in session header for active sessions
- [x] Warning banner appears when score > 40 with correct state text
- [x] Action buttons functional: Send Guidance opens editor, Dismiss hides banner
- [x] Sparkline shows last 20 readings on click
- [x] State cleared on session disconnect
- [x] No re-render loops (same patterns as graph-activity-store fix)
- [x] TypeScript compiles clean

## Dependencies
- Requires Phase 1 completed (pulse:update events from server)
