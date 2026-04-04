# Phase 1: Provider Registry & Free Model Catalog

## Goal
Server-side registry of AI providers with pre-configured free endpoints. Dynamic model list API for the web UI.

## Tasks
- [x] Create `provider-registry.ts` — catalog of known providers with metadata
- [x] Add free provider configs (no API key needed): Gemini free, Groq free, HuggingFace free
- [x] Add `/api/models` endpoint — returns available models grouped by provider (free vs configured)
- [x] Add `/api/models/health` endpoint — check which free endpoints are reachable
- [x] Extend settings schema for multi-provider config (base URL, API key, enabled flag per provider)

## Provider Catalog Schema
```typescript
interface ProviderEntry {
  id: string;                    // "gemini-free", "groq-free", "anthropic"
  name: string;                  // "Gemini (Free)"
  type: "free" | "configured";   // free = no key needed
  baseUrl: string;               // "https://generativelanguage.googleapis.com/v1beta/openai"
  apiKey?: string;               // empty for free, from settings for configured
  format: "openai" | "anthropic" | "gemini"; // API format
  models: ModelEntry[];
  enabled: boolean;
  healthStatus?: "ok" | "degraded" | "down";
}

interface ModelEntry {
  id: string;                    // "gemini-2.0-flash"
  name: string;                  // "Gemini 2.0 Flash"
  provider: string;              // "gemini-free"
  contextWindow: number;         // 1000000
  free: boolean;
  capabilities: {
    toolUse: boolean;
    streaming: boolean;
    vision: boolean;
  };
}
```

## Free Providers (Initial Set)
| Provider | Base URL | Models | Rate Limits |
|----------|----------|--------|-------------|
| Gemini Free | generativelanguage.googleapis.com/v1beta/openai | gemini-2.0-flash, gemini-2.5-flash | 15 RPM, 1M tokens/day |
| Groq Free | api.groq.com/openai/v1 | llama-3.3-70b, gemma2-9b | 30 RPM, 14.4K tokens/min |
| HuggingFace | api-inference.huggingface.co/v1 | various open models | 1000 req/day |

## Acceptance Criteria
- [x] `/api/models` returns list of free + configured models
- [x] Free providers work without any API key configuration
- [x] Health check detects unreachable providers
- [x] Settings page can enable/disable providers (toggle endpoint ready)
- [x] ai-client.ts routes to correct provider based on model ID (via resolveModelProvider)

## Files Touched
- `packages/server/src/services/provider-registry.ts` — new (~200 LOC)
- `packages/server/src/routes/models.ts` — new (~80 LOC)
- `packages/server/src/services/ai-client.ts` — extend provider resolution
- `packages/server/src/index.ts` — mount new route

## Dependencies
- None — builds on existing ai-client.ts infrastructure
