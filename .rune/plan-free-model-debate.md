# Feature: Free Model Integration + Debate Expansion

## Overview
Extend Companion's debate mode to support free AI models (Gemini, Groq, Qwen, etc.) via proxy/direct API. Users pick free models from a dropdown below the chat composer to tag into debates alongside Claude Code sessions. Provider page = settings only.

## Phases
| # | Name | Status | Plan File | Summary |
|---|------|--------|-----------|---------|
| 1 | Provider Registry & Free Models | ✅ Done | plan-free-model-debate-phase1.md | Server-side provider registry, free endpoint catalog, health checks |
| 2 | Model Picker UI | ✅ Done | plan-free-model-debate-phase2.md | Bottom bar below composer, model dropdown, debate tag-in |
| 3 | Cross-Provider Debate | ✅ Done | plan-free-model-debate-phase3.md | Provider routing, rate limit retry, debate participant API |

## Key Decisions
- Reuse existing `ai-client.ts` OpenAI-compatible pathway (already supports Groq, Together, Ollama, OpenRouter)
- Free models = pre-configured endpoints requiring no API key (Gemini free tier, Groq free, HuggingFace)
- Provider page stays as settings/config — model selection happens in session composer bottom bar
- Debate engine already has `AgentModelConfig` per-agent — extend to support free provider routing
- No self-hosted proxy initially — connect directly to free tier APIs (simpler, no server cost)

## Architecture
```
Composer Bottom Bar
  ├─ [⚡ Claude Sonnet ▾]  ← main session model (read-only or switchable)
  └─ [🆓 + Add model ▾]    ← dropdown: free models, click to tag into debate
        ├─ Gemini 2.0 Flash (Free)
        ├─ Groq Llama 3.3 (Free)  
        ├─ Qwen 3 (Free)
        └─ + Connect provider...

Debate Flow:
  User tags @gemini into session
    → debate-engine creates agent with provider="gemini-free"
    → ai-client routes to Gemini free API (OpenAI-compatible)
    → response comes back, displayed as debate participant
```

## Existing Infrastructure
- ✅ debate-engine.ts — AgentModelConfig, per-agent model override, multi-model debates
- ✅ ai-client.ts — OpenAI-compatible provider support (Groq, Together, Ollama, OpenRouter)
- ✅ mention-router.ts — @shortId cross-session routing
- ✅ model-selector.tsx — exists but hardcoded to 3 Anthropic models
- ✅ settings DB — provider config stored via getSetting/setSetting
