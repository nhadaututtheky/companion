/**
 * Provider Registry — Catalog of AI providers with pre-configured free endpoints.
 *
 * Free providers require no API key (Gemini free tier, Groq free, HuggingFace).
 * Configured providers use API keys from settings DB.
 * Used by debate engine for multi-model routing + /api/models endpoint.
 */

import { getSetting } from "./settings-helpers.js";
import { createLogger } from "../logger.js";

const log = createLogger("provider-registry");

// ── Types ──────────────────────────────────────────────────────────────────

export type ProviderFormat = "openai" | "anthropic";

export interface ProviderEntry {
  id: string;
  name: string;
  type: "free" | "configured";
  baseUrl: string;
  apiKey?: string;
  format: ProviderFormat;
  models: ModelEntry[];
  enabled: boolean;
  healthStatus?: "ok" | "degraded" | "down";
  lastHealthCheck?: number;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  free: boolean;
  capabilities: {
    toolUse: boolean;
    streaming: boolean;
    vision: boolean;
    reasoning: boolean;
  };
  /** Max output tokens (some free models cap at 4K-8K) */
  maxOutputTokens?: number;
}

// ── Free Provider Catalog ──────────────────────────────────────────────────

const FREE_PROVIDERS: ProviderEntry[] = [
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    type: "free",
    baseUrl: "https://opencode.ai/zen/v1",
    format: "openai",
    enabled: true,
    models: [
      {
        id: "big-pickle",
        name: "Big Pickle",
        provider: "opencode-zen",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: true },
        maxOutputTokens: 8_192,
      },
      {
        id: "qwen3.6-plus-free",
        name: "Qwen 3.6 Plus",
        provider: "opencode-zen",
        contextWindow: 1_048_576,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: true },
        maxOutputTokens: 8_192,
      },
      {
        id: "gpt-5-nano-free",
        name: "GPT-5 Nano",
        provider: "opencode-zen",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: false },
        maxOutputTokens: 4_096,
      },
      {
        id: "nemotron-3-super-free",
        name: "Nemotron 3 Super",
        provider: "opencode-zen",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: true },
        maxOutputTokens: 8_192,
      },
      {
        id: "minimax-m2.5-free",
        name: "MiniMax M2.5",
        provider: "opencode-zen",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: false, streaming: true, vision: false, reasoning: false },
        maxOutputTokens: 4_096,
      },
    ],
  },
  {
    id: "gemini-free",
    name: "Gemini (Free)",
    type: "free",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    format: "openai",
    enabled: true,
    models: [
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "gemini-free",
        contextWindow: 1_000_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: true, reasoning: false },
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "gemini-free",
        contextWindow: 1_000_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: true, reasoning: true },
      },
    ],
  },
  {
    id: "groq-free",
    name: "Groq (Free)",
    type: "free",
    baseUrl: "https://api.groq.com/openai/v1",
    format: "openai",
    enabled: true,
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        provider: "groq-free",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: false },
      },
      {
        id: "gemma2-9b-it",
        name: "Gemma 2 9B",
        provider: "groq-free",
        contextWindow: 8_192,
        free: true,
        capabilities: { toolUse: false, streaming: true, vision: false, reasoning: false },
      },
    ],
  },
  {
    id: "pollinations-free",
    name: "Pollinations (Free)",
    type: "free",
    baseUrl: "https://text.pollinations.ai/openai",
    format: "openai",
    enabled: true,
    models: [
      {
        id: "openai",
        name: "GPT-5 Nano (Pollinations)",
        provider: "pollinations-free",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: false },
        maxOutputTokens: 4_096,
      },
      {
        id: "deepseek-r1",
        name: "DeepSeek R1 (Pollinations)",
        provider: "pollinations-free",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: false, streaming: true, vision: false, reasoning: true },
        maxOutputTokens: 8_192,
      },
      {
        id: "llama-4-maverick",
        name: "Llama 4 Maverick (Pollinations)",
        provider: "pollinations-free",
        contextWindow: 128_000,
        free: true,
        capabilities: { toolUse: true, streaming: true, vision: false, reasoning: false },
        maxOutputTokens: 8_192,
      },
    ],
  },
  {
    id: "huggingface-free",
    name: "HuggingFace (Free)",
    type: "free",
    baseUrl: "https://api-inference.huggingface.co/v1",
    format: "openai",
    enabled: true,
    models: [
      {
        id: "mistralai/Mistral-7B-Instruct-v0.3",
        name: "Mistral 7B Instruct",
        provider: "huggingface-free",
        contextWindow: 32_768,
        free: true,
        capabilities: { toolUse: false, streaming: true, vision: false, reasoning: false },
      },
      {
        id: "microsoft/Phi-3-mini-4k-instruct",
        name: "Phi-3 Mini",
        provider: "huggingface-free",
        contextWindow: 4_096,
        free: true,
        capabilities: { toolUse: false, streaming: true, vision: false, reasoning: false },
      },
    ],
  },
];

// ── Registry State ─────────────────────────────────────────────────────────

/** In-memory registry = free + configured providers */
let cachedProviders: ProviderEntry[] | null = null;

/**
 * Get all available providers (free + configured from settings DB).
 * Cached until invalidated by `invalidateCache()`.
 */
export function getProviders(): ProviderEntry[] {
  if (cachedProviders) return cachedProviders;

  const providers: ProviderEntry[] = [];

  // 1. Free providers (always included, check enabled flag from settings)
  for (const free of FREE_PROVIDERS) {
    const disabledKey = `provider.${free.id}.disabled`;
    const isDisabled = getSetting(disabledKey) === "true";
    providers.push({ ...free, enabled: !isDisabled });
  }

  // 2. Configured providers from settings (also check disabled flag)
  const configuredProviders = loadConfiguredProviders();
  for (const cp of configuredProviders) {
    const disabledKey = `provider.${cp.id}.disabled`;
    const isDisabled = getSetting(disabledKey) === "true";
    providers.push({ ...cp, enabled: !isDisabled });
  }

  cachedProviders = providers;
  return providers;
}

/**
 * Get all available models across all enabled providers.
 */
export function getModels(): ModelEntry[] {
  return getProviders()
    .filter((p) => p.enabled)
    .flatMap((p) => p.models);
}

/**
 * Get models grouped by provider.
 */
export function getModelsGrouped(): {
  free: Array<{ provider: ProviderEntry; models: ModelEntry[] }>;
  configured: Array<{ provider: ProviderEntry; models: ModelEntry[] }>;
} {
  const providers = getProviders().filter((p) => p.enabled);
  return {
    free: providers
      .filter((p) => p.type === "free")
      .map((p) => ({ provider: p, models: p.models })),
    configured: providers
      .filter((p) => p.type === "configured")
      .map((p) => ({ provider: p, models: p.models })),
  };
}

/**
 * Resolve a model ID → its provider entry.
 * Returns undefined if model not found in any enabled provider.
 */
export function resolveModelProvider(
  modelId: string,
): { model: ModelEntry; provider: ProviderEntry } | undefined {
  for (const provider of getProviders()) {
    if (!provider.enabled) continue;
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { model, provider };
  }
  return undefined;
}

/**
 * Get provider config suitable for ai-client's providerOverride.
 */
export function getProviderOverride(
  providerId: string,
): { provider: "openai-compatible" | "anthropic"; baseUrl: string; apiKey: string } | undefined {
  const entry = getProviders().find((p) => p.id === providerId && p.enabled);
  if (!entry) return undefined;

  return {
    provider: entry.format === "anthropic" ? "anthropic" : "openai-compatible",
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey ?? "",
  };
}

/**
 * Invalidate cache — call after settings change.
 */
export function invalidateCache(): void {
  cachedProviders = null;
}

// ── Health Check ───────────────────────────────────────────────────────────

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

/** Block internal/private URLs to prevent SSRF */
function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.endsWith(".internal") ||
      host.endsWith(".local")
    ) {
      // Allow local providers (Ollama) — they're explicitly configured
      return url.port !== "";
    }
    return true;
  } catch {
    return false;
  }
}

/** Get health check URL for a provider */
function getHealthCheckUrl(provider: ProviderEntry): string | null {
  // Anthropic doesn't have a /models endpoint — use a HEAD to base URL
  if (provider.format === "anthropic") {
    return null; // skip health check for Anthropic (always returns "ok" if key is set)
  }
  return `${provider.baseUrl}/models`;
}

/**
 * Check health of all enabled providers.
 * Makes a lightweight request to each provider's endpoint.
 */
export async function checkProvidersHealth(): Promise<
  Array<{ id: string; status: "ok" | "degraded" | "down"; latencyMs: number }>
> {
  const providers = getProviders().filter((p) => p.enabled);
  const healthResults: Array<{ id: string; status: "ok" | "degraded" | "down"; latencyMs: number }> = [];

  const checks = providers.map(async (p, _idx) => {
    const start = Date.now();
    const healthUrl = getHealthCheckUrl(p);

    // Anthropic: assume ok if API key is set (no lightweight endpoint to check)
    if (!healthUrl) {
      const result = {
        id: p.id,
        status: (p.apiKey ? "ok" : "degraded") as "ok" | "degraded" | "down",
        latencyMs: 0,
      };
      return result;
    }

    // SSRF guard: validate URL before fetching
    if (!isAllowedUrl(healthUrl)) {
      log.warn("Health check blocked: URL not allowed", { provider: p.id, url: healthUrl });
      return { id: p.id, status: "down" as const, latencyMs: 0 };
    }

    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {},
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });

      const latencyMs = Date.now() - start;
      const status = res.ok ? "ok" as const : "degraded" as const;
      return { id: p.id, status, latencyMs };
    } catch {
      const latencyMs = Date.now() - start;
      return { id: p.id, status: "down" as const, latencyMs };
    }
  });

  const results = await Promise.allSettled(checks);

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const p = providers[i]!;
    const result = r.status === "fulfilled"
      ? r.value
      : { id: p.id, status: "down" as const, latencyMs: HEALTH_CHECK_TIMEOUT_MS };

    healthResults.push(result);

    // Update health status on provider
    p.healthStatus = result.status;
    p.lastHealthCheck = Date.now();
  }

  return healthResults;
}

// ── Configured Providers (from settings DB) ────────────────────────────────

function loadConfiguredProviders(): ProviderEntry[] {
  const providers: ProviderEntry[] = [];

  // OpenRouter — if configured
  const orBaseUrl = getSetting("ai.openrouterBaseUrl") ?? process.env.OPENROUTER_BASE_URL;
  const orApiKey = getSetting("ai.openrouterApiKey") ?? process.env.OPENROUTER_API_KEY;
  if (orBaseUrl || orApiKey) {
    providers.push({
      id: "openrouter",
      name: "OpenRouter",
      type: "configured",
      baseUrl: orBaseUrl ?? "https://openrouter.ai/api/v1",
      apiKey: orApiKey ?? "",
      format: "openai",
      enabled: true,
      models: [], // OpenRouter models are dynamic, resolved at runtime
    });
  }

  // Main AI provider — if configured and not already Anthropic default
  const mainBaseUrl = getSetting("ai.baseUrl") ?? process.env.AI_BASE_URL;
  const mainApiKey = getSetting("ai.apiKey") ?? process.env.AI_API_KEY;
  const mainModel = getSetting("ai.model") ?? process.env.AI_MODEL;
  if (mainBaseUrl && !mainBaseUrl.includes("openrouter.ai")) {
    const providerName = inferProviderName(mainBaseUrl);
    providers.push({
      id: "custom-provider",
      name: providerName,
      type: "configured",
      baseUrl: mainBaseUrl,
      apiKey: mainApiKey ?? "",
      format: "openai",
      enabled: true,
      models: mainModel
        ? [
            {
              id: mainModel,
              name: mainModel,
              provider: "custom-provider",
              contextWindow: 128_000,
              free: false,
              capabilities: { toolUse: true, streaming: true, vision: false, reasoning: false },
            },
          ]
        : [],
    });
  }

  // Anthropic — if ANTHROPIC_API_KEY is set
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    providers.push({
      id: "anthropic",
      name: "Anthropic",
      type: "configured",
      baseUrl: "https://api.anthropic.com",
      apiKey: anthropicKey,
      format: "anthropic",
      enabled: true,
      models: [
        {
          id: "claude-haiku-4-5-20251001",
          name: "Claude Haiku 4.5",
          provider: "anthropic",
          contextWindow: 200_000,
          free: false,
          capabilities: { toolUse: true, streaming: true, vision: true, reasoning: false },
        },
        {
          id: "claude-sonnet-4-6-20250514",
          name: "Claude Sonnet 4.6",
          provider: "anthropic",
          contextWindow: 200_000,
          free: false,
          capabilities: { toolUse: true, streaming: true, vision: true, reasoning: true },
        },
        {
          id: "claude-opus-4-6-20250514",
          name: "Claude Opus 4.6",
          provider: "anthropic",
          contextWindow: 200_000,
          free: false,
          capabilities: { toolUse: true, streaming: true, vision: true, reasoning: true },
        },
      ],
    });
  }

  return providers;
}

function inferProviderName(baseUrl: string): string {
  if (baseUrl.includes("ollama") || baseUrl.includes("11434")) return "Ollama (Local)";
  if (baseUrl.includes("groq.com")) return "Groq";
  if (baseUrl.includes("together")) return "Together AI";
  if (baseUrl.includes("dashscope")) return "DashScope (Qwen)";
  if (baseUrl.includes("googleapis")) return "Google AI Studio";
  return "Custom Provider";
}
