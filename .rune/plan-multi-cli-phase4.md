# Phase 4: CLI-Powered Debate

## Goal
Enable debates where each agent is a real CLI process (Claude, Codex, or OpenCode) with full tool access — file reading, terminal commands, MCP tools. This is the killer feature.

## Tasks
- [ ] Define `CLIDebateConfig` type — extends DebateConfig with per-agent CLI platform
- [ ] Create `cli-debate-engine.ts` — orchestrates multi-CLI debate lifecycle
- [ ] Implement parallel CLI process spawning (one per agent)
- [ ] Implement turn-based messaging: inject opponent's response as next prompt
- [ ] Implement shared workspace: all CLI agents work in same directory (see risks)
- [ ] Add round management: track which agent is responding, enforce turn order
- [ ] Implement convergence detection adapted for CLI output (longer, tool-heavy responses)
- [ ] Create CLI debate verdict: spawn a judge CLI session to evaluate
- [ ] Add `POST /api/channels/cli-debate` route
- [ ] Handle process lifecycle: agent crash → mark as forfeit, continue with remaining
- [ ] Resource limits: max concurrent CLI processes per debate (default 2-3)
- [ ] Cost tracking: aggregate token usage from all CLI processes

## Architecture
```
User starts CLI Debate
         │
         ▼
┌─ cli-debate-engine.ts ─────────────────────────┐
│                                                  │
│  Round 1:                                        │
│  ┌─────────────┐     ┌──────────────┐           │
│  │ Claude CLI   │     │ Codex CLI    │           │
│  │ "Argue for   │     │ "Argue for   │           │
│  │  approach A" │     │  approach B"  │           │
│  │ (can read    │     │ (can read     │           │
│  │  files, run  │     │  files, run   │           │
│  │  commands)   │     │  commands)    │           │
│  └──────┬───────┘     └──────┬───────┘           │
│         │ NormalizedMessage   │                   │
│         └────────┬───────────┘                   │
│                  ▼                                │
│         Channel (DB storage)                     │
│                  │                                │
│         Round 2: inject previous round            │
│         as context for next turn                  │
│                  │                                │
│         ... repeat until convergence ...          │
│                  │                                │
│                  ▼                                │
│         Judge CLI evaluates all rounds            │
│         → Verdict with code evidence              │
│                                                  │
└──────────────────────────────────────────────────┘
```

## Turn Protocol
```typescript
// Round N for Agent A (e.g., Claude):
const prompt = buildDebatePrompt({
  topic: config.topic,
  role: agent.role, // "advocate" | "challenger"
  format: config.format,
  previousRounds: getChannelMessages(channelId, { maxRounds: 2 }),
  instruction: `You are debating against ${opponent.platform} (${opponent.model}).
    Respond to their last argument. You may read files, run commands, 
    and provide code examples to support your position.
    Keep response under 2000 words.`,
});

// Spawn CLI with debate prompt
const proc = await adapter.launch({
  sessionId: `debate-${channelId}-${agent.id}-r${round}`,
  cwd: config.workingDir,
  model: agent.model,
  prompt,
});

// Collect full response, then kill process
const response = await collectFullResponse(proc, { timeout: 120_000 });
await storeToChannel(channelId, agent.id, round, response);
```

## Shared vs Isolated Workspace
Two modes:
1. **Shared** (default): All agents work in same directory — can see each other's file changes
   - Pro: More realistic, agents can build on each other's code
   - Risk: File conflicts, overwriting each other's work
   - Mitigation: Sequential turns (not parallel file writes)
   
2. **Isolated**: Each agent gets a git worktree copy
   - Pro: No conflicts, clean comparison
   - Con: Can't build on each other's work
   - Implementation: `git worktree add /tmp/debate-{agentId}` before spawn

## Debate Format Adaptations
```typescript
// CLI debates support additional formats beyond API debates:
type CLIDebateFormat = 
  | "pro_con"      // Two agents argue opposing positions (existing)
  | "red_team"     // Attacker tries to break, defender patches (existing)
  | "code_review"  // One writes code, other reviews — iterate
  | "architecture" // Propose competing architectures with real implementations
  | "benchmark"    // Both solve same task, compare quality + speed
```

## Acceptance Criteria
- [ ] Can start a CLI debate with 2 agents on different platforms
- [ ] Agents receive each other's responses as context each round
- [ ] Tool use output (file reads, terminal) included in debate messages
- [ ] Debate concludes with verdict from judge
- [ ] Process cleanup: all CLI processes killed on debate end/abort
- [ ] Channel messages show platform badge per agent
- [ ] Debate survives one agent crashing (continues with remaining)

## Files Touched
- `packages/server/src/services/cli-debate-engine.ts` — new
- `packages/server/src/routes/channels.ts` — add CLI debate endpoint
- `packages/shared/src/types/debate.ts` — new shared debate types
- `packages/shared/src/types/cli-adapter.ts` — extend if needed

## Dependencies
- Phase 1 (adapter interface)
- Phase 2 (Codex + OpenCode adapters)
- Phase 3 (nice to have — platform picker UI)
