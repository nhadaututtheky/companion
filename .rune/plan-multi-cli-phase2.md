# Phase 2: Codex + Gemini + OpenCode Adapters

## Goal
Implement CLI adapters for OpenAI Codex, Google Gemini CLI, and OpenCode, handling their unique output formats, auth requirements, and process lifecycle.

## Tasks
- [x] Research & document exact Codex CLI output format (`codex exec --json` JSONL events)
- [x] Research & document exact Gemini CLI output format (`gemini --output-format stream-json` NDJSON)
- [x] Research & document exact OpenCode output format (`opencode run --format json` JSON events)
- [x] Implement `adapters/codex-adapter.ts`
- [x] Implement `adapters/gemini-adapter.ts`
- [x] Implement `adapters/opencode-adapter.ts`
- [x] Write output parsers: Codex JSONL → NormalizedMessage
- [x] Write output parsers: Gemini NDJSON → NormalizedMessage
- [x] Write output parsers: OpenCode JSON → NormalizedMessage
- [x] Register all 4 adapters in adapter-registry.ts
- [x] Add CLI platform detection to server startup (which CLIs are installed?)
- [x] Add `GET /api/cli-platforms` route — returns available platforms + capabilities
- [ ] Integration test: spawn Codex session, send prompt, receive response
- [ ] Integration test: spawn Gemini session, send prompt, receive response
- [ ] Integration test: spawn OpenCode session, send prompt, receive response

## Gemini CLI Adapter Details
```typescript
// Spawn: gemini -p "prompt" --output-format json
// Input: Single-shot via -p flag, stdin piped for context
// Output: JSON (structured, not streaming NDJSON)
// Auth: Google Account (OAuth cached) OR GEMINI_API_KEY env var
// Resume: Not supported
// Model: Uses Gemini 2.5 Pro by default
// Free tier: 60 req/min, 1000 req/day — FREE debate agent!
// Tool access: Yes (file read/write, terminal commands)
// Metrics: --session-summary <file.json> for token usage

// Key advantage: FREE with generous limits
// Perfect as default debate opponent — no API key needed if Google Account auth'd
```

## Codex Adapter Details
```typescript
// Spawn: codex -q --json --approval-mode suggest "prompt"
// Input: Not interactive after initial prompt (single-shot mode)
//        OR: codex --json (interactive TUI — need to investigate stdin piping)
// Output: JSON blob (not streaming NDJSON)
// Auth: OPENAI_API_KEY env var
// Resume: Not supported
// Model: --model flag (gpt-4.1, o4-mini, etc.)

// Key challenge: Codex is primarily single-shot in quiet mode
// For ongoing conversation: may need to spawn new process per message
// Alternative: investigate if Codex supports stdin piping in non-quiet mode
```

## OpenCode Adapter Details
```typescript
// Two integration modes:
//
// MODE A: CLI spawn (simple, per-request)
//   Spawn: opencode run "prompt" --format json --model provider/model
//   Input: Single-shot per invocation
//   Output: JSON events
//   Resume: --session <id> or --fork <session>
//   ⚠ Stdin pipe bug #3871 — avoid raw stdin, use run command
//
// MODE B: Server mode (recommended for Companion)
//   Start: opencode serve --port 4096 --cors
//   Client: @opencode-ai/sdk (TypeScript SDK)
//   Benefits: No cold boot, persistent sessions, HTTP API
//   OpenAPI docs at /doc
//   Auth: OPENCODE_SERVER_PASSWORD env var
//
// Auth: Provider-specific env vars (ANTHROPIC_API_KEY, etc.)
//   OR: opencode auth login (cached in ~/.local/share/opencode/auth.json)
//
// Key advantage: 75+ providers via Models.dev
//   - Local free: Ollama, LM Studio (no API key)
//   - Cloud free: OpenCode Zen (Big Pickle, Qwen3.6, Nemotron 3, MiniMax M2.5)
//   - Paid: OpenRouter, Groq, Together, Bedrock, GitHub Copilot
//
// Strategy: Use OpenCode serve as UNIVERSAL BACKEND for Provider tab
//   Instead of Companion implementing each provider API,
//   route all non-native-CLI models through OpenCode serve
```

## Output Normalization Strategy
```
Claude NDJSON event types → NormalizedMessage:
  system_init        → system_init
  assistant (text)   → assistant  
  assistant (tool)   → tool_use
  result             → tool_result
  stream_event       → progress

Codex JSON → NormalizedMessage:
  response.text      → assistant
  response.actions[] → tool_use (one per action)
  response.error     → error
  (no streaming)     → complete (single event)

Gemini JSON → NormalizedMessage:
  output.text        → assistant
  output.tool_calls  → tool_use
  output.error       → error
  (single response)  → complete
  session-summary    → cost (parse metrics file)

OpenCode NDJSON → NormalizedMessage:
  event: content     → assistant
  event: tool_call   → tool_use
  event: tool_result → tool_result  
  event: done        → complete
```

## Acceptance Criteria
- [ ] `codex-adapter.ts` spawns Codex, parses output, returns NormalizedMessages
- [ ] `opencode-adapter.ts` spawns OpenCode, parses output, returns NormalizedMessages
- [ ] Both adapters handle missing CLI gracefully (detect → available: false)
- [ ] Auth validation: clear error if API key missing for selected platform
- [ ] `/api/cli-platforms` returns real detection results
- [ ] Can create a session with `cliPlatform: "codex"` and receive responses in web UI

## Files Touched
- `packages/server/src/services/adapters/codex-adapter.ts` — new
- `packages/server/src/services/adapters/gemini-adapter.ts` — new
- `packages/server/src/services/adapters/opencode-adapter.ts` — new
- `packages/server/src/routes/cli-platforms.ts` — new route
- `packages/server/src/index.ts` — register new route

## Dependencies
- Phase 1 (adapter interface + registry)
- User must have Codex/OpenCode installed locally
