"use client";

import { useState, useEffect } from "react";
import { FloppyDisk, Eye, EyeSlash } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SettingSection, InputField } from "./settings-tabs";

// ── Preset Providers ────────────────────────────────────────────────────────

const PRESET_PROVIDERS = [
  {
    name: "DashScope (Qwen)",
    baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
    models: ["qwen3-coder-plus", "qwen3.5-plus", "qwen3-coder-next", "qwen3-max-2026-01-23"],
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["anthropic/claude-sonnet-4", "google/gemini-2.5-flash", "deepseek/deepseek-chat-v3"],
  },
  {
    name: "Google AI Studio",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemma-4-27b-it", "gemma-4-12b-it", "gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "gemma2-9b-it", "gemma-4-12b-it"],
  },
  {
    name: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    models: ["gemma4:27b", "gemma4:12b", "qwen3:8b", "llama3.2:latest", "codellama:latest"],
  },
  {
    name: "Custom",
    baseUrl: "",
    models: [],
  },
];

// ── AI Provider Tab ─────────────────────────────────────────────────────────

export function AIProviderTab() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKeyVal, setApiKeyVal] = useState("");
  const [model, setModel] = useState("");
  const [modelFast, setModelFast] = useState("");
  const [modelStrong, setModelStrong] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [autoSummary, setAutoSummary] = useState(true);
  const [autoInject, setAutoInject] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await api.settings.list("ai.");
        setBaseUrl(res.data["ai.baseUrl"] ?? "");
        setApiKeyVal(res.data["ai.apiKey"] ?? "");
        setModel(res.data["ai.model"] ?? "");
        setModelFast(res.data["ai.modelFast"] ?? "");
        setModelStrong(res.data["ai.modelStrong"] ?? "");
        setAutoSummary(res.data["ai.autoSummary"] !== "false");
        setAutoInject(res.data["ai.autoInjectSummaries"] !== "false");

        // Detect preset
        const url = res.data["ai.baseUrl"] ?? "";
        const preset = PRESET_PROVIDERS.find(
          (p) => p.baseUrl && url.includes(new URL(p.baseUrl).hostname),
        );
        if (preset) setSelectedPreset(preset.name);
      } catch {
        // First time — no settings yet
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handlePresetChange(name: string) {
    setSelectedPreset(name);
    const preset = PRESET_PROVIDERS.find((p) => p.name === name);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      if (preset.models.length > 0 && !model) {
        setModel(preset.models[0]!);
        setModelFast(preset.models[0]!);
        setModelStrong(preset.models[0]!);
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries: Array<[string, string]> = [
        ["ai.baseUrl", baseUrl],
        ["ai.apiKey", apiKeyVal],
        ["ai.model", model],
        ["ai.modelFast", modelFast || model],
        ["ai.modelStrong", modelStrong || model],
        ["ai.provider", "openai-compatible"],
        ["ai.autoSummary", String(autoSummary)],
        ["ai.autoInjectSummaries", String(autoInject)],
      ];

      for (const [key, value] of entries) {
        if (value) {
          await api.settings.set(key, value);
        }
      }

      toast.success("AI Provider saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-xs">Loading...</div>;

  const currentPreset = PRESET_PROVIDERS.find((p) => p.name === selectedPreset);
  const suggestedModels = currentPreset?.models ?? [];

  return (
    <div className="flex flex-col gap-5">
      <SettingSection
        title="AI Provider"
        description="Configure the AI model used for session summaries, debates, and convergence detection."
      >
        <div className="flex flex-col gap-4">
          {/* Preset selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Provider Preset</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROVIDERS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handlePresetChange(p.name)}
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background:
                      selectedPreset === p.name
                        ? "var(--color-accent)"
                        : "var(--color-bg-elevated)",
                    color: selectedPreset === p.name ? "#fff" : "var(--color-text-secondary)",
                    border: `1px solid ${selectedPreset === p.name ? "var(--color-accent)" : "var(--color-border)"}`,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <InputField
            label="API Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://coding-intl.dashscope.aliyuncs.com/v1"
          />

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyVal}
                onChange={(e) => setApiKeyVal(e.target.value)}
                placeholder="sk-..."
                className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
                aria-label={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Default Model</label>
            {suggestedModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (!modelFast) setModelFast(e.target.value);
                  if (!modelStrong) setModelStrong(e.target.value);
                }}
                className="input-bordered text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select model...</option>
                {suggestedModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="model-name"
                className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm"
              />
            )}
          </div>
        </div>
      </SettingSection>

      {/* Advanced: separate fast/strong models */}
      <SettingSection
        title="Model Tiers (optional)"
        description="Use different models for cheap vs expensive AI calls. Leave blank to use default model for all."
      >
        <div className="flex flex-col gap-3">
          <InputField
            label="Fast Model — summaries, convergence check"
            value={modelFast}
            onChange={setModelFast}
            placeholder={model || "Same as default"}
          />
          <InputField
            label="Strong Model — debate agents"
            value={modelStrong}
            onChange={setModelStrong}
            placeholder={model || "Same as default"}
          />
        </div>
      </SettingSection>

      {/* Auto features on/off */}
      <SettingSection
        title="Auto Features"
        description="Toggle automatic AI-powered features. Requires a configured provider above."
      >
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center justify-between">
            <div>
              <p className="text-xs font-medium">Auto-Summary</p>
              <p className="text-xs">Generate session summary when session ends</p>
            </div>
            <button
              onClick={() => setAutoSummary(!autoSummary)}
              className="h-5 w-10 cursor-pointer rounded-full transition-colors"
              role="switch"
              aria-checked={autoSummary}
              style={{
                background: autoSummary ? "var(--color-accent)" : "var(--color-bg-elevated)",
                border: `1px solid ${autoSummary ? "var(--color-accent)" : "var(--color-border)"}`,
                position: "relative",
              }}
            >
              <span
                className="block h-3.5 w-3.5 rounded-full transition-transform"
                style={{
                  background: "#fff",
                  transform: autoSummary ? "translateX(20px)" : "translateX(2px)",
                  marginTop: 1.5,
                }}
              />
            </button>
          </label>

          <label className="flex cursor-pointer items-center justify-between">
            <div>
              <p className="text-xs font-medium">Inject Previous Summaries</p>
              <p className="text-xs">
                Prepend last 3 session summaries to new sessions in same project
              </p>
            </div>
            <button
              onClick={() => setAutoInject(!autoInject)}
              className="h-5 w-10 cursor-pointer rounded-full transition-colors"
              role="switch"
              aria-checked={autoInject}
              style={{
                background: autoInject ? "var(--color-accent)" : "var(--color-bg-elevated)",
                border: `1px solid ${autoInject ? "var(--color-accent)" : "var(--color-border)"}`,
                position: "relative",
              }}
            >
              <span
                className="block h-3.5 w-3.5 rounded-full transition-transform"
                style={{
                  background: "#fff",
                  transform: autoInject ? "translateX(20px)" : "translateX(2px)",
                  marginTop: 1.5,
                }}
              />
            </button>
          </label>
        </div>
      </SettingSection>

      {/* Save button */}
      <button
        onClick={() => void handleSave()}
        disabled={saving || !baseUrl}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
        style={{
          background: baseUrl ? "var(--color-accent)" : "var(--color-bg-elevated)",
          color: baseUrl ? "#fff" : "var(--color-text-muted)",
          border: "none",
          opacity: saving ? 0.7 : 1,
        }}
      >
        <FloppyDisk size={16} weight="bold" />
        {saving ? "Saving..." : "Save AI Provider"}
      </button>
    </div>
  );
}
