# Phase 3: Cross-Provider Debate Engine

## Goal
Extend debate-engine to route agent calls through free providers with format translation. Multi-model debates where Claude + free models collaborate in real-time.

## Tasks
- [x] Extend `debate-engine.ts` — resolve agent model → provider via registry
- [ ] Add format translation layer for debate agents (OpenAI ↔ Anthropic message format)
- [x] Add rate limit handling — detect 429, queue/retry with backoff per provider
- [x] Add debate participant from web UI — API endpoint to add/remove model mid-session
- [x] Add cost tracking — free models = $0, paid models track via existing cost system
- [x] Wire debate results back to chat UI with model identity (which model said what)

## Format Translation
```typescript
// Debate engine calls free model via ai-client
// ai-client detects provider format and translates:

interface FormatTranslator {
  // Convert Companion's internal message format → provider API format
  toProviderFormat(messages: Message[], provider: ProviderEntry): ProviderRequest;
  // Convert provider response → Companion's internal format
  fromProviderResponse(response: ProviderResponse, provider: ProviderEntry): Message;
}

// Key translations needed:
// 1. tool_use blocks: Anthropic format ↔ OpenAI function_call format
// 2. system messages: Anthropic separate field ↔ OpenAI system role
// 3. image content: Anthropic base64 blocks ↔ OpenAI image_url
// 4. streaming: Anthropic SSE format ↔ OpenAI SSE format
```

## Debate Flow with Free Models
```
1. User tags @gemini into session
2. Web sends POST /api/sessions/:id/debate/participants
   body: { model: "gemini-2.0-flash", provider: "gemini-free" }
3. Server adds participant to debate state
4. Next user message triggers debate round:
   a. Send to Claude (main session) — via existing CLI bridge
   b. Send to Gemini (free) — via ai-client OpenAI-compatible path
   c. Collect both responses
   d. Display as debate thread (each response tagged with model name)
5. User can reply to specific model or to all
```

## API Endpoints
```
POST   /api/sessions/:id/debate/participants   — add model to debate
DELETE /api/sessions/:id/debate/participants/:modelId — remove
GET    /api/sessions/:id/debate/participants   — list active participants
POST   /api/sessions/:id/debate/round          — trigger debate round manually
```

## Acceptance Criteria
- [x] Free model participates in debate alongside Claude session
- [x] Each response clearly shows which model generated it
- [x] Rate limit 429 → graceful retry, not crash
- [x] Adding/removing participants works mid-conversation
- [x] Cost display shows $0.00 for free model responses
- [ ] Format translation handles tool_use, system messages, streaming

## Files Touched
- `packages/server/src/services/debate-engine.ts` — extend with provider routing (~100 LOC added)
- `packages/server/src/services/format-translator.ts` — new (~200 LOC)
- `packages/server/src/routes/sessions.ts` — add debate participant endpoints (~60 LOC)
- `packages/server/src/services/ai-client.ts` — add rate limit retry logic (~50 LOC)
- `packages/web/src/hooks/use-session.ts` — handle debate_response messages
- `packages/web/src/components/session/message-feed.tsx` — render debate responses with model badges

## Dependencies
- Phase 1 (provider registry + free endpoints)
- Phase 2 (model picker UI + debate participant state)

## Risk Areas
1. **Format translation edge cases** — tool_use format differs significantly between Anthropic and OpenAI. Start with text-only debates, add tool support later.
2. **Rate limits on free tiers** — Gemini 15 RPM, Groq 30 RPM. Need queue + backoff. Don't let debate rounds exceed limits.
3. **Streaming mismatch** — Claude streams via CLI WebSocket, free models stream via SSE. Need to unify in debate coordinator.
