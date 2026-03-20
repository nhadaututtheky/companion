/**
 * AI Client — Multi-provider abstraction for internal AI calls.
 *
 * Config priority:
 * 1. DB Settings (ai.baseUrl, ai.apiKey, ai.model, etc.) — editable from Web UI
 * 2. Environment variables (AI_BASE_URL, AI_API_KEY, AI_MODEL, etc.)
 * 3. ANTHROPIC_API_KEY fallback
 *
 * Supports:
 * - OpenAI-compatible (DashScope Qwen, Groq, Together, Ollama, OpenRouter)
 * - Anthropic (claude-haiku, claude-sonnet)
 */

import { eq, like } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { settings } from "../db/schema.js";
import { createLogger } from "../logger.js";

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

/** Read a setting from DB, returns undefined if not found */
function getSetting(key: string): string | undefined {
  try {
    const db = getDb();
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value || undefined;
  } catch {
    return undefined;
  }
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
    opts.tier === "fast" ? config.fastModel :
    opts.tier === "strong" ? config.strongModel :
    config.defaultModel;

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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content: Array<{ text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  // Rough cost (Sonnet: $3/$15 per M; Haiku: $0.25/$1.25 per M)
  const isHaiku = model.includes("haiku");
  const inputRate = isHaiku ? 0.25 : 3;
  const outputRate = isHaiku ? 1.25 : 15;
  const costUsd = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;

  return {
    text: data.content?.[0]?.text ?? "",
    costUsd,
    inputTokens,
    outputTokens,
  };
}

// ── OpenAI-compatible ──────────────────────────────────────────────────────

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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  // Generic cost estimate ($1/$2 per M tokens — conservative)
  const costUsd = (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 2;

  log.debug("AI call complete", { model, inputTokens, outputTokens, cost: costUsd.toFixed(4) });

  return {
    text: data.choices?.[0]?.message?.content ?? "",
    costUsd,
    inputTokens,
    outputTokens,
  };
}
