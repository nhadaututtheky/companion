# Phase 4: Guided Intervention (User-Triggered)

## Goal
When user clicks "Inject Calm" or "Send Guidance" button (Phase 2), send a structured guidance message to the agent. Templates vary by detected issue. **Always user-triggered, never auto.**

## Tasks
- [x] Create guidance template system — map top signal → suggested message
- [x] "Send Guidance" flow: pre-fill textarea → user edits → sends as user_message
- [x] "Inject Calm" flow: send structured XML guidance as user_message (user confirms first)
- [x] Add WS message type: `{ type: "pulse_action", action: "send_guidance" | "inject_calm", sessionId, content? }`
- [x] Server handler: convert pulse_action → inject into CLI session as user message
- [x] Log pulse interventions to activity feed
- [x] Enable "Inject Calm" button in Phase 2 PulseWarning component
- [x] Telegram: allow reply-to-alert as guidance message
- [x] TypeScript compiles clean

## Guidance Templates (by top signal)

### Failure Rate High
```
I notice you've had several consecutive errors. Before trying again:
1. Re-read the last error message carefully — what exactly failed?
2. Is the root cause in this file, or could it be in a dependency?
3. Consider a different approach if this one isn't working.
Take a moment to reassess before your next edit.
```

### Edit Churn High
```
You've edited {file} {count} times recently. This often means the fix 
isn't in this file. Consider:
1. Check the imports — is a dependency providing the wrong type/value?
2. Read the calling code — is the issue in how this file is used?
3. Run the relevant test in isolation to narrow down the root cause.
```

### Cost Acceleration
```
Your token usage is increasing rapidly. To be more efficient:
1. Read only the specific lines you need (use offset/limit)
2. Avoid re-reading files you've already seen
3. Focus on one approach — don't try multiple strategies simultaneously
```

### Context Pressure
```
Context window is getting full ({percent}%). To continue effectively:
1. Consider using /compact to summarize earlier conversation
2. Focus on completing the current task before starting new ones
3. Avoid reading large files — target specific line ranges
```

### Tunnel Vision (Low Tool Diversity)
```
You've been using mostly {toolName} for the last several turns. 
Consider using other tools:
- Grep/Glob to find related code instead of guessing file paths
- Read to understand code before editing
- Bash to run tests and verify your changes work
```

## "Inject Calm" Structured Message
When user clicks "Inject Calm", show confirmation dialog:
```
This will send a structured guidance message to the agent:

"Step back and reassess your current approach. You've been 
{topIssueDescription}. Consider whether the root cause might 
be elsewhere. Take a different angle before making more changes."

[Cancel]  [Send to Agent]
```

On confirm → send as `user_message` with `source: "pulse_guidance"` tag.

## Server Handling
```typescript
// In ws-bridge handleBrowserMessage:
case "pulse_action": {
  const { action, content, sessionId } = msg;
  if (action === "send_guidance" || action === "inject_calm") {
    // Route as user_message to CLI session
    this.sendUserMessage(sessionId, content, "pulse_guidance");
    // Log to activity
    this.broadcastToAll(session, {
      type: "hook_event",
      hookType: "PulseIntervention", 
      message: `User sent ${action} guidance`,
      timestamp: Date.now(),
    });
  }
  break;
}
```

## Telegram Reply-to-Alert
When user replies to a pulse alert message in Telegram:
- Route the reply text as user_message to the session
- Tag with `source: "pulse_guidance"` for tracking
- Confirm: "✅ Guidance sent to session {shortId}"

## Activity Log
All pulse interventions logged:
```
[pulse] User sent guidance: "Stop and reconsider..."
[pulse] Calm injection sent (score was 74)
```

## Files Touched
- `packages/server/src/services/pulse-templates.ts` — new (guidance templates)
- `packages/server/src/services/ws-bridge.ts` — modify (handle pulse_action message)
- `packages/web/src/components/pulse/pulse-warning.tsx` — modify (enable Inject Calm button)
- `packages/web/src/components/pulse/guidance-dialog.tsx` — new (confirmation + edit dialog)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (reply-to-alert routing)
- `packages/shared/src/types/session.ts` — modify (add pulse_action message type)

## Acceptance Criteria
- [x] "Send Guidance" opens pre-filled editor, user edits and sends
- [x] "Inject Calm" shows confirmation dialog before sending
- [x] Guidance delivered to agent as user_message
- [x] Templates vary based on top signal (failure, churn, cost, etc.)
- [x] Intervention logged in activity feed
- [x] Telegram reply-to-alert routes as guidance
- [x] TypeScript compiles clean

## Dependencies
- Requires Phase 1 (PulseEstimator) and Phase 2 (action buttons in UI)
- Phase 3 optional (Telegram reply-to-alert is enhancement)
