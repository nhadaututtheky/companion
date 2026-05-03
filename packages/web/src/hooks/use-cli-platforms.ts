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

export interface CLIModelEntry {
  value: string;
  label: string;
}

/** Fallback models when API is unavailable */
const FALLBACK_MODELS: Record<string, CLIModelEntry[]> = {
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
    { value: "anthropic/claude-sonnet-4-7", label: "Claude Sonnet 4.7" },
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "openai/gpt-4.1", label: "GPT-4.1" },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

/** Cache for dynamic models fetched from API */
let cachedModels: Record<string, CLIModelEntry[]> = {};
let modelsFetchedAt = 0;
const MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getModelsForPlatform(platformId: string): CLIModelEntry[] {
  return cachedModels[platformId] ?? FALLBACK_MODELS[platformId] ?? FALLBACK_MODELS.claude;
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

  const fetchModels = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cachedModels && Object.keys(cachedModels).length > 0 && now - modelsFetchedAt < MODELS_CACHE_TTL) {
      return; // Cache is still valid
    }

    try {
      const res = await api.cliPlatforms.models();
      const modelsData = res.models;

      if (typeof modelsData === "object" && !Array.isArray(modelsData)) {
        cachedModels = {};
        for (const [platform, models] of Object.entries(modelsData)) {
          cachedModels[platform] = models as CLIModelEntry[];
        }
        modelsFetchedAt = now;
      }
    } catch {
      // Models fetch failed — fallback to hardcoded will be used
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await api.cliPlatforms.refresh();
      await fetchPlatforms();
      await fetchModels(true);
    } catch {
      // refresh failed, keep current state
    }
  }, [fetchPlatforms, fetchModels]);

  useEffect(() => {
    fetchPlatforms();
    fetchModels();
  }, [fetchPlatforms, fetchModels]);

  return { platforms, loading, error, refresh };
}
