# Phase 6: Telegram Multi-CLI Debate + Group Bot Architecture

## Goal
Extend Telegram debate to support multi-CLI platforms. Each CLI/provider can be a separate bot in a group, creating a natural multi-agent conversation where each bot = one AI platform.

## Current State
- `/debate` command exists, creates forum topics in groups
- Debate uses API-only agents (debate-engine.ts)
- Can mention sessions (`#fox #bear`) to inject debate context
- Single bot handles everything

## Target State
- Each CLI platform = separate Telegram bot in group
- Debate in group = natural multi-bot conversation
- User creates group, adds Claude bot + Gemini bot + Codex bot
- `/debate` triggers all bots to argue in the group thread

## Multi-Bot Group Architecture
```
┌─ Telegram Group: "Project Auth Debate" ──────────┐
│                                                    │
│  [User]                                            │
│  /debate architecture "How to implement auth?"     │
│                                                    │
│  [🟣 Claude Bot]                                   │
│  Let me analyze the codebase first...              │
│  📁 Read: src/middleware/auth.ts                   │
│  I recommend JWT with refresh tokens because...    │
│                                                    │
│  [🟢 Gemini Bot]                                   │
│  I disagree. Looking at the dependencies...        │
│  💻 Run: npm ls passport                           │
│  Passport is already installed, we should...       │
│                                                    │
│  [🔵 Codex Bot]                                    │
│  Both have merit. Let me benchmark...              │
│  💻 Run: time node bench/auth-jwt.js               │
│  Based on performance data, I suggest...           │
│                                                    │
│  [🟡 Provider Bot] (API-only, e.g., GPT-4o)       │
│  As a text-only observer, I note that...           │
│                                                    │
│  ── Verdict ──                                     │
│  [🟣 Claude Bot] (as judge)                        │
│  Winner: Gemini's approach. Reasoning: ...         │
│                                                    │
└────────────────────────────────────────────────────┘
```

## Tasks
- [ ] Bot Registry: support multiple bot tokens (one per CLI platform)
- [ ] Bot identity: each bot has platform icon, name, and capabilities
- [ ] `/debate` in group: detect which bots are in the group → auto-assign as agents
- [ ] Turn coordination: bots take turns responding (not all at once)
- [ ] Shared project context: all bots read from same working directory
- [ ] Debate state synced across bots via Companion server (single source of truth)
- [ ] `/verdict` triggers judge (configurable which bot judges)
- [ ] DM debate fallback: if no group, single bot plays all roles (current behavior)
- [ ] Bot registration UI in Settings page (add bot tokens per platform)

## Bot Registration
```
Settings → Telegram → Bots
┌──────────────────────────────────────────────────┐
│ Bot Name        │ Platform │ Token    │ Status   │
│─────────────────┼──────────┼──────────┼──────────│
│ Claude Work     │ Claude   │ ****1234 │ ✅ Active│
│ Gemini Helper   │ Gemini   │ ****5678 │ ✅ Active│
│ Codex Assistant │ Codex    │ ****9012 │ ⬚ Off   │
│ GPT Observer    │ Provider │ ****3456 │ ✅ Active│
│                 │          │          │          │
│ [+ Add Bot]                                      │
└──────────────────────────────────────────────────┘
```

## Acceptance Criteria
- [ ] Multiple Telegram bots can run simultaneously (one per platform)
- [ ] `/debate` in group auto-discovers bots and assigns agent roles
- [ ] Each bot responds with its own identity and platform capabilities
- [ ] CLI-powered bots show tool use (file reads, terminal) in messages
- [ ] API-only bots clearly marked as "text-only"
- [ ] Debate state persisted in Companion DB, not per-bot
- [ ] Works in DM too (single bot, multiple agent roles — current behavior)

## Files Touched
- `packages/server/src/telegram/bot-registry.ts` — extend for multi-bot
- `packages/server/src/telegram/commands/debate.ts` — multi-bot awareness
- `packages/server/src/telegram/telegram-bridge.ts` — per-bot message routing
- Settings DB schema — bot tokens per platform
- Web Settings UI — bot management section

## Dependencies
- Phase 2 (CLI adapters)
- Phase 4 (CLI debate engine)
