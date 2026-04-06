# Phase 5: Unified Debate UX

## Goal
Merge API debates and CLI debates into a single, coherent UI experience. Users shouldn't need to think about "API vs CLI" — just pick agents, pick models, and debate.

## Tasks
- [x] Redesign debate creation modal — unified agent config
- [x] Agent card: pick source (API model | CLI platform) per agent
- [x] Show capability differences: CLI agents have tool badges, API agents show "text only"
- [x] Unified channel view: mix API + CLI agent messages in same feed
- [ ] Real-time streaming for CLI agents (show partial output as it streams) — deferred, uses polling
- [x] Tool use visualization in debate feed (file reads, terminal commands)
- [x] Platform icon + model badge per message bubble
- [x] Live status indicators: pulsing dot when debate is active
- [x] Abort controls: abort entire debate from feed header
- [ ] Debate replay: step through rounds with diff viewer — deferred (P2 polish)
- [x] Update Magic Ring debate view to support CLI debates

## Unified Agent Config
```
┌─ Start Debate ───────────────────────────────────────┐
│                                                       │
│  Topic: [How should we implement auth in this app?]   │
│  Format: [Architecture ▾]                             │
│  Working Dir: [~/projects/myapp]                      │
│                                                       │
│  ┌─ Agent A ──────────────┐ ┌─ Agent B ─────────────┐│
│  │ Source: [CLI ▾]        │ │ Source: [CLI ▾]       ││
│  │ Platform: [Claude ▾]   │ │ Platform: [Codex ▾]   ││
│  │ Model: [sonnet-4-6 ▾]  │ │ Model: [gpt-4.1 ▾]   ││
│  │ 🔧 Has tool access    │ │ 🔧 Has tool access   ││
│  │ Persona: [None ▾]     │ │ Persona: [None ▾]    ││
│  └────────────────────────┘ └────────────────────────┘│
│                                                       │
│  ┌─ Agent C (optional) ──┐                           │
│  │ Source: [API ▾]        │ ← API agent, no tools     │
│  │ Provider: [Gemini ▾]   │                           │
│  │ Model: [2.5-flash ▾]   │                           │
│  │ 💬 Text only          │                           │
│  └────────────────────────┘                           │
│                                                       │
│  [+ Add Agent]                                        │
│                                                       │
│  ⚙ Max rounds: [5]  Budget: [$1.00]                  │
│  ⚙ Workspace: [Shared ▾] (Shared | Isolated)         │
│                                                       │
│         [Cancel]  [Start Debate]                      │
└───────────────────────────────────────────────────────┘
```

## Mixed Debate Messages Feed
```
┌─ #debate-auth ──────────────────────────────────┐
│                                                  │
│  Round 1                                         │
│  ┌─ [◈ Claude · sonnet-4-6] ──────────────────┐ │
│  │ I'll analyze the current codebase first...  │ │
│  │ ┌─ 🔧 Read: src/middleware/auth.ts ───────┐│ │
│  │ │ Found existing JWT implementation...     ││ │
│  │ └─────────────────────────────────────────┘│ │
│  │ Based on the existing code, I recommend... │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ [◇ Codex · gpt-4.1] ─────────────────────┐ │
│  │ Let me check the dependencies first...     │ │
│  │ ┌─ 🔧 Terminal: npm ls passport ──────────┐│ │
│  │ │ passport@0.6.0                          ││ │
│  │ └─────────────────────────────────────────┘│ │
│  │ The project already has Passport. I argue  │ │
│  │ we should leverage it instead of...        │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ [🟢 Gemini · 2.5-flash] (API) ───────────┐ │
│  │ Both approaches have merit. From a cost    │ │
│  │ perspective, I'd note that...              │ │
│  │ 💬 text-only agent                        │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ── Round 2 ──────────────────────────────────── │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

## Acceptance Criteria
- [x] Single debate creation modal works for both API and CLI agents
- [ ] Can mix API + CLI agents in same debate — deferred (needs unified orchestrator)
- [x] Tool use from CLI agents renders inline (file reads, terminal output)
- [x] Platform icons distinguish message sources
- [ ] Streaming works for CLI agents (partial response updates) — deferred, uses polling
- [x] Abort stops all running CLI processes + API calls
- [ ] Verdict considers tool use evidence — deferred (needs verdict engine update)

## Files Touched
- `packages/web/src/components/debate/` — new directory
  - `debate-create-modal.tsx` — unified creation UI
  - `debate-feed.tsx` — mixed message renderer
  - `debate-agent-card.tsx` — agent config component
  - `debate-tool-block.tsx` — inline tool use visualization
- `packages/web/src/components/shared/channel-panel.tsx` — modify for CLI messages
- `packages/web/src/components/magic-ring/` — update debate view
- `packages/server/src/routes/channels.ts` — unified debate start endpoint
- `packages/server/src/services/unified-debate.ts` — new orchestrator (merges API + CLI debate)

## Dependencies
- Phase 3 (CLI platform picker components, reuse)
- Phase 4 (CLI debate engine)
