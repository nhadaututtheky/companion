# Phase 5C: Debate Engine

## Goal
Enable multi-Claude debates with structured formats, convergence detection, and Telegram-native control. User says `/debate "Should we use Redis or SQLite?"` → 2 Claudes argue → Judge delivers verdict → all visible in Telegram.

## Tasks

### 5C.1 — Debate Engine Core
- [ ] Create `packages/server/src/services/debate-engine.ts`
  - [ ] `startDebate(projectSlug, topic, format, config)` → creates channel + spawns agents
  - [ ] `processRound(channelId)` → orchestrate one round (each agent responds)
  - [ ] `checkConvergence(channelId)` → analyze if agents agree or are going in circles
  - [ ] `concludeDebate(channelId)` → trigger Judge to synthesize verdict
  - [ ] `forceConclusion(channelId)` → human-triggered end
- [ ] Debate formats (enum):
  - [ ] `pro_con` — 2 agents (Advocate + Challenger) + Judge, structured rounds
  - [ ] `red_team` — 1 Builder + 1 Attacker, security/flaw focus
  - [ ] `review` — 1 Author + 1-3 Reviewers, code/architecture review
  - [ ] `brainstorm` — N agents equal, Synthesizer concludes
- [ ] Agent spawning:
  - [ ] Each agent = a Companion session with system prompt defining role
  - [ ] System prompt includes: role, format rules, channel context, topic
  - [ ] Agents communicate via channel messages (not direct WS)
- [ ] Round orchestration:
  - [ ] Round 1: each agent posts opening argument
  - [ ] Round 2-N: each agent responds to previous round's messages
  - [ ] After each round: convergence check
  - [ ] Max rounds: configurable (default 5)
  - [ ] Max cost: configurable (default $0.50)

### 5C.2 — Convergence Detection
- [ ] Create `packages/server/src/services/convergence-detector.ts`
  - [ ] Extract key points from each agent's last message (via Haiku call)
  - [ ] Compare key points across agents
  - [ ] Convergence score: % of overlapping points
  - [ ] Auto-conclude if score > 70%
  - [ ] Detect stale debate: if no new points for 2 rounds → force conclude
  - [ ] Return: `{ converged: boolean, score: number, newPoints: string[], staleRounds: number }`

### 5C.3 — Verdict Generation
- [ ] Judge prompt template:
  ```
  You are the Judge in a structured debate. Analyze all arguments and produce a verdict:
  1. Winner/Recommendation
  2. Points of Agreement (bullet list)
  3. Key Arguments per side (bullet list)
  4. Unresolved Points (bullet list)
  5. Confidence Score (0-100)
  ```
- [ ] Store verdict as JSON in `channels.verdict`
- [ ] Format for Telegram: HTML with expandable sections

### 5C.4 — Telegram Integration
- [ ] Replace `/debate` stub with real implementation
  - [ ] `/debate <topic>` — start Pro vs Con debate (default)
  - [ ] `/debate review <topic>` — start code review
  - [ ] `/debate redteam <topic>` — start red team analysis
  - [ ] `/debate brainstorm <topic>` — start brainstorm
- [ ] Add `/verdict` command — force conclude current debate
- [ ] Route debate messages to Telegram with agent labels:
  - 🔵 **Advocate**: ...
  - 🔴 **Challenger**: ...
  - ⚖️ **Judge Verdict**: ...
- [ ] Support human injection: user types in chat → message added to channel as "human" role
- [ ] Debate summary card on conclusion (formatted HTML with blockquotes)
- [ ] Cost tracking: show running cost per debate

### 5C.5 — MCP Integration
- [ ] Add MCP tools:
  - [ ] `companion_start_debate` — start debate from Claude Code
  - [ ] `companion_conclude_debate` — force conclude
  - [ ] `companion_get_debate_status` — get current debate state + messages

## Acceptance Criteria
- [ ] `/debate "Redis vs SQLite"` in Telegram → 2 Claudes debate for up to 5 rounds
- [ ] Each round's messages appear in Telegram with agent labels
- [ ] Convergence auto-stops debate when agents agree (>70% overlap)
- [ ] Stale detection stops after 2 rounds of no new points
- [ ] `/verdict` forces conclusion at any time
- [ ] Verdict includes: winner, agreement points, arguments, unresolved, confidence
- [ ] Cost tracked and displayed (per agent + total)
- [ ] Human can type messages into active debate
- [ ] All messages stored in `channel_messages` table

## Files
- `packages/server/src/services/debate-engine.ts` — new
- `packages/server/src/services/convergence-detector.ts` — new
- `packages/server/src/telegram/commands/config.ts` — modify (replace /debate stub)
- `packages/server/src/telegram/telegram-bridge.ts` — modify (debate message routing)
- `packages/server/src/telegram/formatter.ts` — modify (verdict formatting)
- `packages/server/src/mcp/tools.ts` — modify (add debate tools)
- `packages/server/src/routes/channels.ts` — modify (debate-specific endpoints)

## Dependencies
- Phase 5A done (MCP tools, session spawning)
- Phase 5B done (auto-summary for debate sessions)
- Anthropic API key for convergence detection (Haiku calls)
