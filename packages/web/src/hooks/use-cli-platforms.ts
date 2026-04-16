"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

export interface CLIPlatformInfo {
  id: string;
  name: string;
  available: boolean;
  version?: string;
  capabilities: {
    supportsResume: boolean;
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsMCP: boolean;
    outputFormat: string;
    inputFormat: string;
    supportsModelFlag: boolean;
    supportsThinking: boolean;
    supportsInteractive: boolean;
  };
}

/** Platform-specific model lists */
const PLATFORM_MODELS: Record<string, Array<{ value: string; label: string }>> = {
  claude: [
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-opus-4-7", label: "Opus 4.7" },
    { value: "claude-opus-4-6", label: "Opus 4.6" },
    { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  ],
  codex: [
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "o3", label: "o3" },
    { value: "codex-mini-latest", label: "Codex Mini" },
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  opencode: [
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "groq/llama-3.3-70b", label: "Llama 3.3 70B (Groq)" },
  ],
};

export function getModelsForPlatform(platformId: string) {
  return PLATFORM_MODELS[platformId] ?? PLATFORM_MODELS.claude;
}

export function getDefaultModelForPlatform(platformId: string): string {
  const models = getModelsForPlatform(platformId);
  return models[0]?.value ?? "claude-sonnet-4-6";
}

export function useCLIPlatforms() {
  const [platforms, setPlatforms] = useState<CLIPlatformInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlatforms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.cliPlatforms.list();
      setPlatforms(res.platforms as CLIPlatformInfo[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect CLI platforms");
      setPlatforms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await api.cliPlatforms.refresh();
      await fetchPlatforms();
    } catch {
      // refresh failed, keep current state
    }
  }, [fetchPlatforms]);

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  return { platforms, loading, error, refresh };
}
