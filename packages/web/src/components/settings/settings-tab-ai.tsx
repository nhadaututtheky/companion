"use client";

import { useState, useEffect } from "react";
import { FloppyDisk, Eye, EyeSlash, Plug, CheckCircle, XCircle, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SettingSection, InputField } from "./settings-tabs";

type TestResult =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latencyMs: number }
  | { kind: "fail"; status: number; error: string; latencyMs: number };

function TierModelField({
  label,
  value,
  onChange,
  suggestedModels,
  defaultModel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestedModels: string[];
  defaultModel: string;
}) {
  const isStale = value !== "" && suggestedModels.length > 0 && !suggestedModels.includes(value);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {suggestedModels.length > 0 ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-bordered text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-3 py-2 text-sm"
        >
          <option value="">— Inherit default ({defaultModel || "not set"}) —</option>
          {suggestedModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {isStale && (
            <option value={value} disabled>
              {value} (not available in this provider)
            </option>
          )}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultModel || "Same as default"}
          className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm"
        />
      )}
      {isStale && (
        <p className="text-xs" style={{ color: "var(--color-warning, #f59e0b)" }}>
          &quot;{value}&quot; doesn&apos;t exist in this provider — save will fail at runtime. Pick
          from the list or clear to inherit default.
        </p>
      )}
    </div>
  );
}

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
    models: ["gemma-4-26b-a4b-it", "gemma-4-31b-it", "gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "gemma2-9b-it"],
  },
  {
    name: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    models: ["gemma4:e27b", "gemma4:e12b", "gemma4:e4b", "qwen3:8b", "llama3.2:latest", "codellama:latest"],
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
  const [testResult, setTestResult] = useState<TestResult>({ kind: "idle" });
  const [ollamaTags, setOllamaTags] = useState<string[] | null>(null);

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
    setTestResult({ kind: "idle" });
    const preset = PRESET_PROVIDERS.find((p) => p.name === name);
    if (!preset) return;

    setBaseUrl(preset.baseUrl);

    // Ollama local doesn't need an API key — clear stale keys from paid providers
    if (preset.baseUrl.includes("11434")) setApiKeyVal("");

    // Reset stale model IDs that belonged to the PREVIOUS provider.
    // Keep current value only if it appears in the new preset's model list.
    const nextModels = preset.models;
    const keepIfValid = (current: string, fallback: string) =>
      current && nextModels.includes(current) ? current : fallback;

    const newDefault = nextModels[0] ?? "";
    const nextModel = keepIfValid(model, newDefault);
    setModel(nextModel);
    setModelFast(keepIfValid(modelFast, nextModel));
    setModelStrong(keepIfValid(modelStrong, nextModel));
  }

  // Auto-fetch installed Ollama tags when baseUrl points at Ollama
  useEffect(() => {
    if (!baseUrl.includes("11434")) {
      setOllamaTags(null);
      return;
    }
    let cancelled = false;
    api.models
      .ollamaTags(baseUrl)
      .then((res) => {
        if (cancelled) return;
        setOllamaTags(res.data.reachable ? res.data.tags : null);
      })
      .catch(() => {
        if (!cancelled) setOllamaTags(null);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  async function handleTestConnection() {
    if (!baseUrl || !model) {
      toast.error("Base URL and model are required to test");
      return;
    }
    setTestResult({ kind: "running" });
    try {
      const res = await api.models.testConnection({ baseUrl, apiKey: apiKeyVal, model });
      const { ok, status, latencyMs, error } = res.data;
      if (ok) {
        setTestResult({ kind: "ok", latencyMs });
      } else {
        setTestResult({ kind: "fail", status, error: error ?? "Unknown error", latencyMs });
      }
    } catch (err) {
      setTestResult({
        kind: "fail",
        status: 0,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: 0,
      });
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

  async function handleDisable() {
    const confirmed = window.confirm(
      "Disable AI Provider? This clears Base URL, API Key, and model overrides. Claude will fall back to ANTHROPIC_API_KEY env var if set.",
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const keys = [
        "ai.baseUrl",
        "ai.apiKey",
        "ai.model",
        "ai.modelFast",
        "ai.modelStrong",
        "ai.provider",
      ];
      for (const key of keys) {
        await api.settings.del(key).catch(() => {});
      }
      setBaseUrl("");
      setApiKeyVal("");
      setModel("");
      setModelFast("");
      setModelStrong("");
      setSelectedPreset("");
      setTestResult({ kind: "idle" });
      toast.success("AI Provider disabled — reverted to default Claude");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-xs">Loading...</div>;

  const currentPreset = PRESET_PROVIDERS.find((p) => p.name === selectedPreset);
  const suggestedModels = ollamaTags ?? currentPreset?.models ?? [];

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
            <label className="text-xs font-medium">
              API Key
              {baseUrl.includes("11434") && (
                <span className="text-text-secondary ml-2 font-normal">
                  — not required for local Ollama
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyVal}
                onChange={(e) => setApiKeyVal(e.target.value)}
                placeholder={baseUrl.includes("11434") ? "(leave blank)" : "sk-..."}
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
        description="Use different models for cheap vs expensive AI calls. Leave blank to inherit the default model above."
      >
        <div className="flex flex-col gap-3">
          <TierModelField
            label="Fast Model — summaries, convergence check"
            value={modelFast}
            onChange={setModelFast}
            suggestedModels={suggestedModels}
            defaultModel={model}
          />
          <TierModelField
            label="Strong Model — debate agents"
            value={modelStrong}
            onChange={setModelStrong}
            suggestedModels={suggestedModels}
            defaultModel={model}
          />
        </div>
      </SettingSection>

      {/* Auto features on/off */}
      <SettingSection
        title="Auto Features"
        description="Toggle automatic AI-powered features. Requires a configured provider above."
      >
        {!baseUrl && (autoSummary || autoInject) && (
          <div
            className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 40%, transparent)",
              color: "var(--color-warning, #f59e0b)",
            }}
          >
            <XCircle size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span className="font-medium">
              No AI provider configured — these toggles will be skipped silently at runtime. Set
              Base URL + Model above first, or turn them off to avoid confusion.
            </span>
          </div>
        )}
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

      {/* Test + Save buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => void handleTestConnection()}
            disabled={testResult.kind === "running" || !baseUrl || !model}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              opacity: testResult.kind === "running" ? 0.7 : 1,
            }}
          >
            <Plug size={16} weight="bold" />
            {testResult.kind === "running" ? "Testing..." : "Test Connection"}
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !baseUrl}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
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

        {baseUrl && (
          <button
            onClick={() => void handleDisable()}
            disabled={saving}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-colors"
            style={{
              background: "transparent",
              color: "var(--color-loss, #ff6b6b)",
              border: "1px solid color-mix(in srgb, var(--color-loss, #ff6b6b) 40%, transparent)",
              opacity: saving ? 0.5 : 1,
            }}
            aria-label="Disable AI provider and revert to default Claude"
          >
            <Trash size={14} weight="bold" />
            Disable Provider (revert to default Claude)
          </button>
        )}

        {testResult.kind === "ok" && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-profit, #00d084) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-profit, #00d084) 40%, transparent)",
              color: "var(--color-profit, #00d084)",
            }}
          >
            <CheckCircle size={14} weight="fill" />
            <span className="font-medium">
              Connection OK — {testResult.latencyMs}ms round trip
            </span>
          </div>
        )}

        {testResult.kind === "fail" && (
          <div
            className="flex flex-col gap-1 rounded-lg px-3 py-2 text-xs"
            style={{
              background: "color-mix(in srgb, var(--color-loss, #ff6b6b) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-loss, #ff6b6b) 40%, transparent)",
              color: "var(--color-loss, #ff6b6b)",
            }}
          >
            <div className="flex items-center gap-2 font-medium">
              <XCircle size={14} weight="fill" />
              <span>
                Failed{testResult.status ? ` (${testResult.status})` : ""} · {testResult.latencyMs}
                ms
              </span>
            </div>
            <pre className="text-text-secondary overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px]">
              {testResult.error}
            </pre>
          </div>
        )}

        {ollamaTags !== null && baseUrl.includes("11434") && (
          <p className="text-text-secondary text-xs">
            Ollama reachable · {ollamaTags.length} model{ollamaTags.length === 1 ? "" : "s"}{" "}
            installed
          </p>
        )}
      </div>
    </div>
  );
}
