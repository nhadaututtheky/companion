/**
 * AI Client — Multi-provider abstraction for internal AI calls.
 *
 * Config priority:
 * 1. DB Settings (ai.baseUrl, ai.apiKey, ai.model, etc.) — editable from Web UI
 * 2. Environment variables (AI_BASE_URL, AI_API_KEY, AI_MODEL, etc.)
 * 3. ANTHROPIC_API_KEY fallback
 *
 * Supports:
 * - OpenAI-compatible (DashScope Qwen, Groq, Together, Ollama, OpenRouter, Google AI Studio)
 * - Anthropic (claude-haiku, claude-sonnet)
 * - Local models via Ollama (Gemma 4, Qwen3, LLaMA, CodeLLaMA)
 */

import { createLogger } from "../logger.js";
import { getSetting } from "./settings-helpers.js";
import { resolveModelProvider } from "./provider-registry.js";

const log = createLogger("ai-client");

type Provider = "anthropic" | "openai-compatible";

interface AIConfig {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  fastModel: string;
  strongModel: string;
}

/**
 * Resolve OpenRouter provider config from DB settings.
 * Returns undefined if OpenRouter is not configured.
 */
export function getOpenRouterConfig():
  | { provider: Provider; baseUrl: string; apiKey: string }
  | undefined {
  const baseUrl = getSetting("ai.openrouterBaseUrl") ?? process.env.OPENROUTER_BASE_URL;
  const apiKey = getSetting("ai.openrouterApiKey") ?? process.env.OPENROUTER_API_KEY;

  // Fallback: if the main AI config points to OpenRouter, use that
  if (!baseUrl && !apiKey) {
    const mainBaseUrl = getSetting("ai.baseUrl") ?? process.env.AI_BASE_URL ?? "";
    const mainApiKey = getSetting("ai.apiKey") ?? process.env.AI_API_KEY ?? "";
    if (mainBaseUrl.includes("openrouter.ai")) {
      return { provider: "openai-compatible", baseUrl: mainBaseUrl, apiKey: mainApiKey };
    }
    return undefined;
  }

  return {
    provider: "openai-compatible",
    baseUrl: baseUrl ?? "https://openrouter.ai/api/v1",
    apiKey: apiKey ?? "",
  };
}

function getConfig(): AIConfig {
  // Priority 1: DB Settings (from Web UI)
  const dbBaseUrl = getSetting("ai.baseUrl");
  const dbApiKey = getSetting("ai.apiKey");
  const dbProvider = getSetting("ai.provider") as Provider | undefined;
  const dbModel = getSetting("ai.model");
  const dbModelFast = getSetting("ai.modelFast");
  const dbModelStrong = getSetting("ai.modelStrong");

  // Priority 2: Environment variables
  const envBaseUrl = process.env.AI_BASE_URL;
  const envApiKey = process.env.AI_API_KEY;
  const envProvider = process.env.AI_PROVIDER as Provider | undefined;
  const envModel = process.env.AI_MODEL;
  const envModelFast = process.env.AI_MODEL_FAST;
  const envModelStrong = process.env.AI_MODEL_STRONG;

  // Merge: DB > env
  const baseUrl = dbBaseUrl ?? envBaseUrl;
  const apiKey = dbApiKey ?? envApiKey;
  const provider = dbProvider ?? envProvider;
  const model = dbModel ?? envModel ?? "qwen3-coder-plus";
  const modelFast = dbModelFast ?? envModelFast ?? model;
  const modelStrong = dbModelStrong ?? envModelStrong ?? model;

  // OpenAI-compatible if baseUrl is set or explicitly selected
  if (baseUrl || provider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl ?? "http://localhost:11434/v1",
      apiKey: apiKey ?? "",
      defaultModel: model,
      fastModel: modelFast,
      strongModel: modelStrong,
    };
  }

  // Anthropic fallback
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: anthropicKey,
      defaultModel: "claude-haiku-4-5-20251001",
      fastModel: "claude-haiku-4-5-20251001",
      strongModel: "claude-sonnet-4-6-20250514",
    };
  }

  throw new Error(
    "No AI provider configured. Set up in Settings → AI Provider, or set AI_BASE_URL + AI_API_KEY env vars.",
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  text: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export type ModelTier = "fast" | "strong" | "default";

/**
 * Check if any AI provider is configured.
 */
export function isAIConfigured(): boolean {
  return !!(
    getSetting("ai.baseUrl") ||
    getSetting("ai.apiKey") ||
    process.env.AI_BASE_URL ||
    process.env.AI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );
}

/**
 * Call AI with a system prompt + messages.
 * Automatically routes to the configured provider.
 */
export async function callAI(opts: {
  systemPrompt: string;
  messages: ChatMessage[];
  tier?: ModelTier;
  maxTokens?: number;
}): Promise<AIResponse> {
  const config = getConfig();

  const model =
    opts.tier === "fast"
      ? config.fastModel
      : opts.tier === "strong"
        ? config.strongModel
        : config.defaultModel;

  if (config.provider === "anthropic") {
    return callAnthropic(config, model, opts);
  }

  return callOpenAICompatible(config, model, opts);
}

// ── Anthropic ──────────────────────────────────────────────────────────────

async function callAnthropic(
  config: AIConfig,
  model: string,
  opts: { systemPrompt: string; messages: ChatMessage[]; maxTokens?: number },
): Promise<AIResponse> {
  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.systemPrompt,
        messages: opts.messages.filter((m) => m.role !== "system"),
      }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const backoffMs =
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000);
      log.warn("Anthropic rate limited, retrying", {
        model,
        attempt: attempt + 1,
        backoffMs: Math.round(backoffMs),
      });
      await delay(backoffMs);
      continue;
    }

    if (!res.ok) {
      lastError = await res.text().catch(() => "");
      if (attempt < MAX_RETRIES && res.status >= 500) {
        await delay(1000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error(`Anthropic ${res.status}: ${lastError}`);
    }

    const data = (await res.json()) as {
      content: Array<{ text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    // Cost rates: Haiku $1/$5, Sonnet $3/$15, Opus $15/$75
    const isHaiku = model.includes("haiku");
    const isOpus = model.includes("opus");
    const inputRate = isHaiku ? 1 : isOpus ? 15 : 3;
    const outputRate = isHaiku ? 5 : isOpus ? 75 : 15;
    const costUsd = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;

    return {
      text: data.content?.[0]?.text ?? "",
      costUsd,
      inputTokens,
      outputTokens,
    };
  }

  throw new Error(`Anthropic failed after ${MAX_RETRIES} retries: ${lastError}`);
}

// ── OpenAI-compatible ──────────────────────────────────────────────────────

/**
 * Call AI with an explicit model + optional provider override.
 * Used by debate engine for per-agent model selection.
 * If providerOverride is given, uses that config instead of the global one.
 */
export async function callAIWithModel(opts: {
  systemPrompt: string;
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  providerOverride?: {
    provider: Provider;
    baseUrl: string;
    apiKey: string;
  };
}): Promise<AIResponse> {
  const override = opts.providerOverride;
  if (override) {
    const config: AIConfig = {
      provider: override.provider,
      baseUrl: override.baseUrl,
      apiKey: override.apiKey,
      defaultModel: opts.model,
      fastModel: opts.model,
      strongModel: opts.model,
    };
    if (config.provider === "anthropic") {
      return callAnthropic(config, opts.model, opts);
    }
    return callOpenAICompatible(config, opts.model, opts);
  }

  // Try provider registry — resolves free providers (Gemini, Groq, HuggingFace)
  const resolved = resolveModelProvider(opts.model);
  if (resolved) {
    const config: AIConfig = {
      provider: resolved.provider.format === "anthropic" ? "anthropic" : "openai-compatible",
      baseUrl: resolved.provider.baseUrl,
      apiKey: resolved.provider.apiKey ?? "",
      defaultModel: opts.model,
      fastModel: opts.model,
      strongModel: opts.model,
    };
    if (config.provider === "anthropic") {
      return callAnthropic(config, opts.model, opts);
    }
    return callOpenAICompatible(config, opts.model, opts);
  }

  // Fallback — use global config with explicit model
  // Warn: the model may not be compatible with the global provider
  log.warn("Model not found in provider registry, falling back to global config", {
    model: opts.model,
  });
  const config = getConfig();
  if (config.provider === "anthropic") {
    return callAnthropic(config, opts.model, opts);
  }
  return callOpenAICompatible(config, opts.model, opts);
}

// ── Translation helpers ────────────────────────────────────────────────────

/**
 * Quick Vi→En translation using the configured fast AI model.
 * Returns translated text or null if translation fails / AI not configured.
 */
export async function translateViToEn(text: string): Promise<string | null> {
  try {
    const response = await callAI({
      systemPrompt:
        "You are a translator. Translate Vietnamese text to English. Output ONLY the English translation, nothing else.",
      messages: [{ role: "user", content: text }],
      tier: "fast",
      maxTokens: 1024,
    });
    return response.text.trim() || null;
  } catch {
    return null;
  }
}

/** Delay helper for rate limit backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAICompatible(
  config: AIConfig,
  model: string,
  opts: { systemPrompt: string; messages: ChatMessage[]; maxTokens?: number },
): Promise<AIResponse> {
  // Build messages array with system prompt
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: opts.systemPrompt },
    ...opts.messages,
  ];

  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      // Rate limited — exponential backoff with jitter
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const backoffMs =
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000);
      log.warn("Rate limited, retrying", {
        model,
        attempt: attempt + 1,
        backoffMs: Math.round(backoffMs),
      });
      await delay(backoffMs);
      continue;
    }

    if (!res.ok) {
      lastError = await res.text().catch(() => "");
      if (attempt < MAX_RETRIES && res.status >= 500) {
        // Server error — retry with backoff
        await delay(1000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error(`AI API ${res.status}: ${lastError}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    // Free models = $0, paid = generic estimate ($1/$2 per M tokens)
    const isFree = !config.apiKey;
    const costUsd = isFree ? 0 : (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 2;

    log.debug("AI call complete", { model, inputTokens, outputTokens, cost: costUsd.toFixed(4) });

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      costUsd,
      inputTokens,
      outputTokens,
    };
  }

  // All retries exhausted
  throw new Error(`AI API failed after ${MAX_RETRIES} retries: ${lastError}`);
}
