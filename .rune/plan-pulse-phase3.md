# Phase 3: Telegram Alerts

## Goal
Add `/mood` command to Telegram bot + auto-alert when pulse score crosses thresholds. Notifications only — no auto-action on agent.

## Tasks
- [x] Create `packages/server/src/telegram/commands/mood.ts` — /mood command handler
- [x] Register /mood in bot command list
- [x] Implement auto-alert via pulse threshold subscription in telegram-bridge
- [x] Alert deduplication (don't spam — 1 alert per state transition, not per reading)
- [x] Format pulse data for Telegram (HTML)
- [x] Add threshold config per chat (optional /pulse threshold N)
- [x] TypeScript compiles clean

## /mood Command

### `/mood` (no args) — All active sessions
```
📊 Agent Pulse — 3 active sessions

🟢 my-project (@abc123) — Flow [12]
   Turn 8 · $0.42 · Stable

🟡 api-refactor (@def456) — Struggling [54 ▼]
   Turn 15 · $1.23 · Degrading
   ⚠ Edit churn: routes.ts edited 4x
   ⚠ Failure rate: 2 consecutive errors

🔴 debug-auth (@ghi789) — Spiraling [78 ▼]  
   Turn 22 · $3.41 · Degrading
   🚨 4 consecutive tool errors
   🚨 Same file loop: auth.ts (6 edits)
   🚨 Cost 2.3x above average
```

### `/mood <session>` — Detail for one session
```
📊 Pulse: debug-auth (@ghi789)
Score: 78/100 — Spiraling ▼

Signal Breakdown:
  Failure Rate:  ████████░░ 82%
  Edit Churn:    ██████░░░░ 61%
  Cost Accel:    ████░░░░░░ 38%
  Context:       ███░░░░░░░ 29%
  Thinking:      ██░░░░░░░░ 15%
  Tool Diversity:█░░░░░░░░░ 10%
  Tone:          ██░░░░░░░░ 18%

Recent: 45 → 52 → 61 → 72 → 78
Top issue: 4 consecutive errors on auth.ts

💡 Suggested actions:
  /stop ghi789 — Stop session
  /compact ghi789 — Compact context
  Reply with message to send guidance
```

## Auto-Alert Logic

### Trigger: State Transition (not every reading)
```typescript
// Only alert on upward state transitions
const ALERT_STATES = ["struggling", "spiraling"] as const;

// Don't re-alert same state within 5 minutes
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
```

### Alert Format
```
🟡 Pulse Alert: my-project (@abc123)
State: Struggling [54] ▼ Degrading
Top signal: Edit churn — routes.ts edited 4x in 3 turns

💡 /mood abc123 for details
```

```
🔴 Pulse Alert: debug-auth (@ghi789)
State: Spiraling [78] ▼ Degrading  
🚨 4 consecutive tool errors
🚨 Same file loop detected

💡 /mood ghi789 for details
💡 /stop ghi789 to stop session
```

### Where to Send
- Send to the Telegram chat mapped to the session
- If session has no Telegram mapping, skip (web-only sessions)
- Respect existing mute/DND settings if any

## Threshold Config (optional)
```
/pulse threshold 60    → Alert when score > 60 (default)
/pulse threshold 40    → More sensitive
/pulse threshold off   → Disable auto-alerts
/pulse threshold       → Show current threshold
```

Store in session mapping or per-chat config.

## Files Touched
- `packages/server/src/telegram/commands/mood.ts` — new
- `packages/server/src/telegram/bot-factory.ts` — modify (register /mood)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (pulse subscription + auto-alert)
- `packages/server/src/telegram/formatter.ts` — modify (pulse formatting helpers)

## Acceptance Criteria
- [x] /mood shows all active sessions with pulse scores
- [x] /mood <session> shows detailed breakdown
- [x] Auto-alert fires on state transition to struggling/spiraling
- [x] No spam: cooldown prevents repeated alerts for same state
- [x] Alert includes session shortId and actionable commands
- [x] TypeScript compiles clean

## Dependencies
- Requires Phase 1 completed (PulseEstimator provides readings)
- Independent of Phase 2 (can ship Telegram before UI)
