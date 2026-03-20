/**
 * AI Client — Multi-provider abstraction for internal AI calls.
 *
 * Supports:
 * - Anthropic (claude-haiku, claude-sonnet)
 * - OpenAI-compatible (Codex, Qwen, OpenRouter, Groq, Together, Ollama)
 *
 * Config via environment variables:
 *   AI_PROVIDER=openai-compatible  (default if AI_BASE_URL is set)
 *   AI_BASE_URL=https://api.example.com/v1
 *   AI_API_KEY=sk-...
 *   AI_MODEL=qwen-coder-plus       (default model for all internal calls)
 *   AI_MODEL_FAST=qwen-coder-plus  (for cheap calls: summaries, convergence)
 *   AI_MODEL_STRONG=codex-5.4      (for expensive calls: debate agents)
 *
 * Fallback: ANTHROPIC_API_KEY → uses Anthropic API directly
 */

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

function getConfig(): AIConfig {
  // Priority 1: OpenAI-compatible (explicit or inferred from AI_BASE_URL)
  const baseUrl = process.env.AI_BASE_URL;
  const aiKey = process.env.AI_API_KEY;
  const explicitProvider = process.env.AI_PROVIDER as Provider | undefined;

  if (baseUrl || explicitProvider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      baseUrl: baseUrl ?? "http://localhost:11434/v1", // Ollama default
      apiKey: aiKey ?? "",
      defaultModel: process.env.AI_MODEL ?? "qwen-coder-plus",
      fastModel: process.env.AI_MODEL_FAST ?? process.env.AI_MODEL ?? "qwen-coder-plus",
      strongModel: process.env.AI_MODEL_STRONG ?? process.env.AI_MODEL ?? "qwen-coder-plus",
    };
  }

  // Priority 2: Anthropic
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

  // No provider configured
  throw new Error(
    "No AI provider configured. Set AI_BASE_URL + AI_API_KEY (for OpenAI-compatible) or ANTHROPIC_API_KEY (for Anthropic).",
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
  return !!(process.env.AI_BASE_URL || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY);
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
