# Phase 3: Multi-CLI Sessions UI + Provider Tabs

## Goal
Redesign session creation to support multiple CLI platforms and API providers. Each platform gets its own tab with platform-specific configuration options.

## Current State
- New session modal: only Claude Code, model picker (Haiku/Sonnet/Opus)
- No CLI platform selection
- Provider models only visible in debate creation

## Target State — Platform Selection in Step 1 (Project)
Platform picker lives in Step 1 alongside project selection.
Step 2 (Configure) adapts its options based on the platform chosen in Step 1.

```
┌─ New Session ────────────────────────────────────────────┐
│ Launch a session in a                                     │
│ ● Project ── ② Configure ── ③ Launch                     │
│                                                           │
│ PROJECT NAME                                              │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ Control CAD                                           │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ PLATFORM                                                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ ◈ Claude │ │ ◇ Codex  │ │ ◆ Gemini │ │ ☁ API    │     │
│ │   Code   │ │          │ │   CLI    │ │ Provider │     │
│ │  ✅ v2.1 │ │  ✅ v0.1 │ │  ✅ v0.3 │ │  ✅ 8    │     │
│ │          │ │          │ │  FREE    │ │  models  │     │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                                                           │
│               [Back]  [Next →]                            │
└───────────────────────────────────────────────────────────┘

        ↓ Step 2 adapts to selected platform ↓

┌─ Configure (Claude selected) ────────────────────────────┐
│ MODEL: [claude-sonnet-4-6 ▾]                              │
│ EXPERT MODE: [None] [TC] [EM] [JC] ...                    │
│ PERMISSION MODE: ● Default ○ AcceptEdits ○ Full Auto      │
│ AUTO-APPROVE: [Off ▾]                                     │
│ THINK MODE: [Adaptive ▾]                                  │
│ IDLE TIMEOUT: [1h ▾]                                      │
└───────────────────────────────────────────────────────────┘

┌─ Configure (Codex selected) ─────────────────────────────┐
│ MODEL: [gpt-4.1 ▾]                                       │
│ APPROVAL MODE: ● Suggest ○ Auto-edit ○ Full-auto          │
│ NOTIFY: [✓] Desktop notifications                         │
│ IDLE TIMEOUT: [1h ▾]                                      │
└───────────────────────────────────────────────────────────┘

┌─ Configure (Gemini selected) ────────────────────────────┐
│ MODEL: [gemini-2.5-pro ▾]                                 │
│ SANDBOX: [✓] Run in sandbox                               │
│ IDLE TIMEOUT: [1h ▾]                                      │
│ 💡 Free tier: 1000 requests/day                           │
└───────────────────────────────────────────────────────────┘

┌─ Configure (API Provider selected) ──────────────────────┐
│ ┌─ Local Models ───────────────────────────────┐          │
│ │ 🟢 Ollama: llama3.1:70b, codellama:34b     │          │
│ │ 💡 Recommended: Qwen 2.5 Coder 32B         │          │
│ └──────────────────────────────────────────────┘          │
│ ┌─ Cloud (Free) ──────────────────────────────┐          │
│ │ Gemini Flash 2.5, Groq Llama 3.3           │          │
│ └──────────────────────────────────────────────┘          │
│ ┌─ Cloud (Configured) ────────────────────────┐          │
│ │ OpenRouter (15 models), Anthropic (3)       │          │
│ └──────────────────────────────────────────────┘          │
│ ⚠ API-only: No file access or terminal commands           │
│ ⚙ Manage providers in Settings →                         │
└───────────────────────────────────────────────────────────┘
```

## Tab: Claude (CLI)
```
  Model: [claude-sonnet-4-6 ▾]
  ┌─ Options ─────────────────────────────────┐
  │ Auto-Approve: [Off ▾] (Off/15s/30s/Safe)  │
  │ Think Mode:   [Adaptive ▾]                │
  │ Permission:   [default ▾]                 │
  │ Resume:       [✓] Resume last session     │
  └───────────────────────────────────────────┘
  Status: ✅ Installed (v2.1.92)
```

## Tab: Codex (CLI)
```
  Model: [gpt-4.1 ▾] (gpt-4.1 / o4-mini / o3)
  ┌─ Options ─────────────────────────────────┐
  │ Approval Mode: [suggest ▾]                │
  │   (suggest / auto-edit / full-auto)       │
  │ Notify:   [✓] Desktop notifications      │
  └───────────────────────────────────────────┘
  Status: ✅ Installed (v0.1.x)
  Auth: ✅ OPENAI_API_KEY configured
```

## Tab: Gemini (CLI)
```
  Model: [gemini-2.5-pro ▾] (auto-detected)
  ┌─ Options ─────────────────────────────────┐
  │ Sandbox:  [✓] Run in sandbox mode         │
  │ Yolo:     [ ] Skip all confirmations      │
  └───────────────────────────────────────────┘
  Status: ✅ Installed
  Auth: ✅ Google Account (cached)
  💡 Free tier: 1000 requests/day
```

## Tab: Provider (API — no CLI, no tool access)
```
  ┌─ Provider ────────────────────────────────┐
  │ ┌─ Local Models ─────────────────────────┐│
  │ │ 🟢 Ollama (localhost:11434)            ││
  │ │   ├ llama3.1:70b          [Select]     ││
  │ │   ├ codellama:34b         [Select]     ││
  │ │   └ deepseek-coder:33b    [Select]     ││
  │ │                                        ││
  │ │ 💡 Recommended offline models:         ││
  │ │   • Qwen 2.5 Coder 32B (coding)       ││
  │ │   • DeepSeek Coder V2 (fast)           ││
  │ │   • CodeLlama 34B (general)            ││
  │ │   [How to install →]                   ││
  │ └────────────────────────────────────────┘│
  │                                           │
  │ ┌─ Cloud Providers ─────────────────────┐│
  │ │ Free:                                  ││
  │ │   ├ Gemini Flash 2.5    [Select]       ││
  │ │   ├ Groq Llama 3.3 70B [Select]       ││
  │ │   └ Pollinations GPT-5  [Select]       ││
  │ │                                        ││
  │ │ Configured:                            ││
  │ │   ├ OpenRouter (15 models) [Expand ▾]  ││
  │ │   └ Anthropic (3 models)  [Expand ▾]  ││
  │ └────────────────────────────────────────┘│
  │                                           │
  │ ⚙ Manage providers in Settings →         │
  └───────────────────────────────────────────┘
  ⚠ API-only: No file access or terminal commands
```

## Rich Composer Bar (Reference: Codex + Claude Desktop)
```
┌─ Session @fox ───────────────────────────────────────────┐
│                                                           │
│  [... chat messages ...]                                  │
│                                                           │
│  ┌───────────────────────────────────────────────────────┐│
│  │ Message...                                     🎙  ↑ ││
│  │                                                      ││
│  ├──────────────────────────────────────────────────────┤│
│  │ ◈ Sonnet 4.6 ▾ │ ⚡ Adaptive ▾ │ @ Files │ / Cmd  ││
│  └───────────────────────────────────────────────────────┘│
│                                                           │
│  When AI is running:                                      │
│  ┌───────────────────────────────────────────────────────┐│
│  │ Type to queue or interrupt...              ⏹ Stop  ↑ ││
│  ├──────────────────────────────────────────────────────┤│
│  │ ◈ Sonnet 4.6   │ ⚡ Adaptive   │ @ Files │ / Cmd   ││
│  └───────────────────────────────────────────────────────┘│
│  ↑ input NOT disabled — user can type, Enter = interrupt  │
└───────────────────────────────────────────────────────────┘
```

## Platform States (Step 1)
- **Installed + Auth'd**: Full options, ready to use
- **Installed, no auth**: Show "Configure API key" link to Settings
- **Not installed**: Show install command, grayed out
- **Disabled in Settings**: Hidden entirely

## Tasks

### A. Rich Message Composer (UX parity with Codex/Claude Desktop)
- [ ] Allow typing while AI is running (remove `disabled` when `isRunning`)
- [ ] Queue message: if AI running, show "Send will interrupt" or queue for after completion
- [ ] Inline model selector in composer bar (move from ModelBar below → inside input row)
- [ ] Thinking/reasoning effort selector inline (Adaptive/Off/Budget) — like Codex's "Medium ▾"
- [ ] Platform icon badge next to model selector (shows which CLI is active)
- [ ] `@` button for file picker (currently drag-drop only)
- [ ] `/` command palette trigger (slash commands from input)
- [ ] Keyboard shortcut hints (Ctrl+Enter send, @ files, / commands)

### B. Session Creation — Platform Selection in Step 1
- [ ] Fetch CLI platforms from `/api/cli-platforms` on app load
- [ ] Add platform picker to Step 1 (Project) of new-session-modal
- [ ] Step 2 (Configure) adapts options based on selected platform
- [ ] Claude tab: model + Expert Mode + Permission Mode + Think Mode
- [ ] Codex tab: model + Approval Mode + Notify
- [ ] Gemini tab: model + Sandbox + free tier indicator
- [ ] Provider tab: Local (Ollama/LM Studio) + Cloud (free + configured)
- [ ] Add local model detection (check Ollama at localhost:11434)
- [ ] Add recommended offline models list with install links
- [ ] Show install status + auth status per platform
- [ ] Handle disabled state (not installed / disabled in settings)
- [ ] Persist last-used platform as default (localStorage)

### C. Session View Updates
- [ ] Pass `cliPlatform` + platform-specific config in POST /api/sessions
- [ ] Update session routes to accept platform-specific options
- [ ] Show platform badge on session cards (Claude ◈ / Codex ◇ / Gemini ◆ / API ☁)
- [ ] Show platform-specific capabilities in session header
- [ ] Model selector in composer changes options based on session's platform

## Provider Tab — Local Model Detection
```typescript
// Check Ollama availability
GET http://localhost:11434/api/tags → list installed models
// Check LM Studio
GET http://localhost:1234/v1/models → list loaded models
```

## Acceptance Criteria

### Composer
- [ ] User can type while AI is running (input never disabled)
- [ ] Enter while AI running = interrupt + send new message
- [ ] Model selector inline in composer bar, changes per platform
- [ ] Thinking mode selector inline (Adaptive/Off/High)
- [ ] @ button opens file picker
- [ ] / triggers command palette
- [ ] Platform icon visible next to model name

### Session Creation
- [ ] Platform picker in Step 1 with real install/auth status
- [ ] Step 2 adapts options per selected platform
- [ ] Provider section shows local + cloud + free grouped
- [ ] Not-installed platforms disabled with install instructions
- [ ] Last-used platform remembered (localStorage)
- [ ] Creating session with any platform works end-to-end

### Session View
- [ ] Platform badge on all session cards
- [ ] Existing Claude sessions backward compatible

## Files Touched

### Composer
- `packages/web/src/components/session/message-composer.tsx` — heavy refactor (remove disabled, add toolbar)
- `packages/web/src/components/session/composer-toolbar.tsx` — new (model selector, thinking, @, /)
- `packages/web/src/components/session/command-palette.tsx` — new (/ commands)

### Session Creation
- `packages/web/src/components/session/new-session-modal.tsx` — add platform picker to Step 1
- `packages/web/src/components/session/platform-picker.tsx` — new
- `packages/web/src/components/session/platform-config-claude.tsx` — new
- `packages/web/src/components/session/platform-config-codex.tsx` — new
- `packages/web/src/components/session/platform-config-gemini.tsx` — new
- `packages/web/src/components/session/platform-config-provider.tsx` — new
- `packages/web/src/hooks/use-cli-platforms.ts` — new hook
- `packages/web/src/hooks/use-local-models.ts` — new hook (Ollama/LM Studio)

### Session View
- `packages/web/src/components/session/session-card.tsx` — modify (platform badge)
- `packages/web/src/lib/api-client.ts` — update session create params
- `packages/server/src/routes/sessions.ts` — accept platform config
- `packages/shared/src/types/session.ts` — extend SessionState

## Dependencies
- Phase 1 (adapter interface)
- Phase 2 (adapters + detection API)
