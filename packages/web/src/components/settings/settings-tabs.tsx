"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Globe,
  Robot,
  FloppyDisk,
  Check,
  TelegramLogo,
  PaintBrush,
  Gear,
  Plus,
  Eye,
  EyeSlash,
  ArrowsClockwise,
  Bug,
  Plugs,
  BookOpen,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { TelegramBotCard } from "@/components/settings/telegram-bot-card";
import { TelegramStreaming } from "@/components/settings/telegram-streaming";
import { TelegramStatus } from "@/components/settings/telegram-status";
import { TelegramPreview } from "@/components/settings/telegram-preview";
import { TelegramDebateGuide } from "@/components/settings/telegram-debate-guide";
import type { SettingsTab } from "@/types/settings";

// ── Shared primitives ─────────────────────────────────────────────────────────

export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-5 rounded-xl"
      style={{
        background: "var(--glass-bg-heavy)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <h2 className="text-sm font-semibold mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-xs mb-4">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

export function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg text-sm input-bordered transition-colors"
        style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        }}
      />
    </div>
  );
}

// ── Tab types ────────────────────────────────────────────────────────────────

export const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <Gear size={15} weight="bold" /> },
  { id: "domain", label: "Domain", icon: <Globe size={15} weight="bold" /> },
  { id: "ai", label: "AI Provider", icon: <Robot size={15} weight="bold" /> },
  { id: "telegram", label: "Telegram", icon: <TelegramLogo size={15} weight="fill" /> },
  { id: "mcp", label: "MCP", icon: <Plugs size={15} weight="bold" /> },
  { id: "rtk", label: "RTK", icon: <Bug size={15} weight="bold" /> },
  { id: "appearance", label: "Appearance", icon: <PaintBrush size={15} weight="bold" /> },
  { id: "skills", label: "Skills", icon: <BookOpen size={15} weight="bold" /> },
];

// ── Bot config types ─────────────────────────────────────────────────────────

export interface BotConfig {
  id: string;
  label: string;
  role: "claude" | "codex" | "gemini" | "opencode" | "general";
  enabled: boolean;
  allowedChatIds: number[];
  allowedUserIds: number[];
}

export interface RunningBot {
  botId: string;
  label: string;
  role: string;
  running: boolean;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function LicenseSection() {
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [license, setLicense] = useState<{
    tier: string;
    valid: boolean;
    maxSessions: number;
    expiresAt: string;
    daysLeft?: number;
    features?: string[];
  } | null>(null);

  interface LicenseResponse {
    tier: string;
    valid: boolean;
    maxSessions: number;
    expiresAt: string;
    daysLeft?: number;
    features?: string[];
    success?: boolean;
    error?: string;
    message?: string;
  }

  // Fetch current license status
  useEffect(() => {
    api
      .get<LicenseResponse>("/api/license")
      .then((res) => {
        if (res.tier) setLicense(res);
      })
      .catch(() => {});
  }, []);

  const handleActivate = useCallback(async () => {
    if (!licenseKey.trim()) return;
    setActivating(true);
    try {
      const res = await api.post<LicenseResponse>("/api/license/activate", {
        key: licenseKey.trim(),
      });
      if (res.success) {
        toast.success(res.message ?? "License activated!");
        setLicense({
          tier: res.tier,
          valid: true,
          maxSessions: res.maxSessions,
          expiresAt: res.expiresAt,
          daysLeft: res.daysLeft,
          features: res.features,
        });
        setLicenseKey("");
        // Refresh global license store
        window.location.reload();
      } else {
        toast.error(res.error ?? "Invalid license key");
      }
    } catch {
      toast.error("Failed to activate license");
    } finally {
      setActivating(false);
    }
  }, [licenseKey]);

  const tierColors: Record<string, string> = {
    pro: "#34A853",
    trial: "#f59e0b",
    free: "var(--color-text-muted)",
  };

  const isPro = license?.tier === "pro";
  const isTrial = license?.tier === "trial";

  return (
    <SettingSection
      title="License"
      description={isPro ? "You have full access to all Companion features." : "Upgrade to Pro to unlock all features."}
    >
      {/* Current status */}
      {license && (
        <div
          className="flex items-center justify-between mb-4 px-3 py-3 rounded-xl text-xs"
          style={{
            background: isPro ? "#34A85310" : isTrial ? "#f59e0b10" : "var(--color-bg-elevated)",
            border: `1px solid ${isPro ? "#34A85330" : isTrial ? "#f59e0b30" : "var(--color-border)"}`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: tierColors[license.tier] ?? "var(--color-text-muted)" }}
            />
            <span className="font-bold" style={{ color: tierColors[license.tier] }}>
              {license.tier === "pro" ? "PRO" : license.tier === "trial" ? "TRIAL" : "FREE"}
            </span>
            <span style={{ color: "var(--color-text-secondary)" }}>
              {isPro
                ? license.maxSessions < 0 ? "Unlimited sessions" : `${license.maxSessions} sessions`
                : isTrial
                  ? `${license.daysLeft ?? 0} days left — all features unlocked`
                  : "2 sessions · 1 Telegram bot"}
            </span>
          </div>
          {license.expiresAt && (
            <span style={{ color: "var(--color-text-muted)" }}>
              {isPro || isTrial ? `Expires ${license.expiresAt.split("T")[0]}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Upgrade card — only show for free/trial */}
      {!isPro && (
        <div
          className="mb-4 p-4 rounded-xl"
          style={{
            background: "linear-gradient(135deg, #6366f108, #8b5cf610, #ec489808)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                Companion Pro
              </span>
              <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                $5/mo · $39/yr (save 35%)
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            <span>Unlimited sessions</span>
            <span>Multi-bot Telegram</span>
            <span>WebIntel research</span>
            <span>CodeGraph analysis</span>
            <span>Multi-platform debate</span>
            <span>Domain + SSL</span>
            <span>Custom personas</span>
            <span>RTK Pro compression</span>
          </div>
          <div className="flex gap-2">
            <a
              href="https://buy.polar.sh/polar_cl_CGWIyshnh7Xkodt1CaLkYPG0Z5jL1wjmLmD7Q4CEACZ"
              target="_blank"
              rel="noopener"
              className="flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-bold cursor-pointer"
              style={{
                background: "#8b5cf6",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Get Pro — $39/yr
            </a>
            <a
              href="https://pay.theio.vn/checkout/companion-pro"
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--glass-border)",
                textDecoration: "none",
              }}
            >
              SePay (VN)
            </a>
          </div>
        </div>
      )}

      {/* Activate key */}
      <div className="flex gap-2">
        <input
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="cmp_pro_XXXX_XXXX_XXXX"
          className="flex-1 px-3 py-2 rounded-lg text-sm input-bordered"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
          onKeyDown={(e) => e.key === "Enter" && handleActivate()}
        />
        <button
          onClick={handleActivate}
          disabled={activating || !licenseKey.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
          style={{
            background: activating ? "var(--color-text-muted)" : "var(--color-accent)",
            color: "#fff",
            border: "none",
            opacity: !licenseKey.trim() ? 0.5 : 1,
          }}
        >
          {activating ? "..." : "Activate"}
        </button>
      </div>

      <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>
        Already purchased? Enter your license key above to activate.
      </p>
    </SettingSection>
  );
}

// ── AI Provider Tab ──────────────────────────────────────────────────────────

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

  if (loading)
    return (
      <div className="text-xs py-8 text-center">
        Loading...
      </div>
    );

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
            <label className="text-xs font-medium">
              Provider Preset
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROVIDERS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handlePresetChange(p.name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
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
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyVal}
                onChange={(e) => setApiKeyVal(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered font-mono"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"

                aria-label={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              Default Model
            </label>
            {suggestedModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (!modelFast) setModelFast(e.target.value);
                  if (!modelStrong) setModelStrong(e.target.value);
                }}
                className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-primary)",
                }}
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
                className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-primary)",
                }}
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
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-xs font-medium">
                Auto-Summary
              </p>
              <p className="text-xs">
                Generate session summary when session ends
              </p>
            </div>
            <button
              onClick={() => setAutoSummary(!autoSummary)}
              className="w-10 h-5 rounded-full transition-colors cursor-pointer"
              role="switch"
              aria-checked={autoSummary}
              style={{
                background: autoSummary ? "var(--color-accent)" : "var(--color-bg-elevated)",
                border: `1px solid ${autoSummary ? "var(--color-accent)" : "var(--color-border)"}`,
                position: "relative",
              }}
            >
              <span
                className="block w-3.5 h-3.5 rounded-full transition-transform"
                style={{
                  background: "#fff",
                  transform: autoSummary ? "translateX(20px)" : "translateX(2px)",
                  marginTop: 1.5,
                }}
              />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-xs font-medium">
                Inject Previous Summaries
              </p>
              <p className="text-xs">
                Prepend last 3 session summaries to new sessions in same project
              </p>
            </div>
            <button
              onClick={() => setAutoInject(!autoInject)}
              className="w-10 h-5 rounded-full transition-colors cursor-pointer"
              role="switch"
              aria-checked={autoInject}
              style={{
                background: autoInject ? "var(--color-accent)" : "var(--color-bg-elevated)",
                border: `1px solid ${autoInject ? "var(--color-accent)" : "var(--color-border)"}`,
                position: "relative",
              }}
            >
              <span
                className="block w-3.5 h-3.5 rounded-full transition-transform"
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
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer w-full"
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

export function GeneralTab() {
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [serverStatus, setServerStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [promptScanEnabled, setPromptScanEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiKey(localStorage.getItem("api_key") ?? ""); // eslint-disable-line react-hooks/set-state-in-effect
    setServerUrl(localStorage.getItem("server_url") ?? "");
  }, []);

  useEffect(() => {
    api
      .health()
      .then(() => setServerStatus("online"))
      .catch(() => setServerStatus("offline"));
    api
      .get<{ data: { key: string; value: string } }>("/api/settings/security.promptScan")
      .then((res) => setPromptScanEnabled(res.data.value !== "false"))
      .catch(() => setPromptScanEnabled(true));
  }, []);

  const handleSave = useCallback(() => {
    localStorage.setItem("api_key", apiKey);
    localStorage.setItem("server_url", serverUrl);
    setSaved(true);
    toast.success("Settings saved");
    setTimeout(() => setSaved(false), 2000);
  }, [apiKey, serverUrl]);

  return (
    <div className="flex flex-col gap-5">
      {/* Server Connection */}
      <SettingSection
        title="Server Connection"
        description="Configure the Companion server connection."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Globe size={14} weight="bold" />
            <span className="text-xs">
              Status:
            </span>
            <span
              className="text-xs font-semibold"
              style={{
                color:
                  serverStatus === "online"
                    ? "var(--color-success)"
                    : serverStatus === "offline"
                      ? "var(--color-danger)"
                      : "var(--color-text-muted)",
              }}
            >
              {serverStatus === "online"
                ? "Connected"
                : serverStatus === "offline"
                  ? "Offline"
                  : "Checking..."}
            </span>
          </div>

          <InputField
            label="Server URL (leave empty for same-origin)"
            value={serverUrl}
            onChange={setServerUrl}
            placeholder="http://localhost:3579"
          />
        </div>
      </SettingSection>

      {/* Authentication */}
      <SettingSection
        title="Authentication"
        description="API key for authenticating with the server."
      >
        <div className="flex items-start gap-3">
          <Key
            size={16}
            weight="bold"
            style={{ color: "var(--color-text-muted)", marginTop: 8, flexShrink: 0 }}
          />
          <div className="flex-1">
            <InputField
              label="API Key"
              value={apiKey}
              onChange={setApiKey}
              type="password"
              placeholder="Enter your API key"
            />
          </div>
        </div>
      </SettingSection>

      {/* Appearance */}
      <SettingSection title="Appearance" description="Customize colors and theme.">
        <button
          onClick={() => useUiStore.getState().setSettingsActiveTab("appearance")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
          style={{
            color: "var(--color-text-secondary)",
            border: "1px solid var(--glass-border)",
            background: "none",
          }}
        >
          <PaintBrush size={16} />
          Theme Settings
        </button>
      </SettingSection>

      {/* License */}
      <LicenseSection />

      {/* Security */}
      <SettingSection title="Security" description="Configure prompt scanning and risk detection.">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Prompt Scanner
            </span>
            <span className="text-xs">
              Scan user prompts for risky patterns before forwarding to CLI
            </span>
          </div>
          <button
            onClick={async () => {
              const next = !promptScanEnabled;
              setPromptScanEnabled(next);
              try {
                await api.put("/api/settings/security.promptScan", {
                  value: next ? "true" : "false",
                });
                toast.success(`Prompt scanning ${next ? "enabled" : "disabled"}`);
              } catch {
                setPromptScanEnabled(!next);
                toast.error("Failed to update setting");
              }
            }}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
            style={{
              background: promptScanEnabled ? "var(--color-accent)" : "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
            }}
            role="switch"
            aria-checked={promptScanEnabled}
            aria-label="Toggle prompt scanning"
          >
            <span
              className="inline-block h-4 w-4 rounded-full transition-transform"
              style={{
                background: "#fff",
                transform: promptScanEnabled ? "translateX(22px)" : "translateX(4px)",
              }}
            />
          </button>
        </div>

        <a
          href="/settings/errors"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
          style={{
            color: "var(--color-text-secondary)",
            border: "1px solid var(--glass-border)",
            textDecoration: "none",
            marginTop: 12,
          }}
        >
          <Bug size={16} />
          View Error Log ↗
        </a>
      </SettingSection>

      {/* Save button */}
      <button
        onClick={handleSave}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
        style={{
          background: saved ? "var(--color-success)" : "var(--color-accent)",
          color: "#fff",
          border: "none",
        }}
      >
        {saved ? (
          <>
            <Check size={16} weight="bold" />
            Saved
          </>
        ) : (
          <>
            <FloppyDisk size={16} weight="bold" />
            Save Settings
          </>
        )}
      </button>
    </div>
  );
}

export function AppearanceTab() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div className="flex flex-col gap-5">
      <SettingSection title="Appearance">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Theme
            </span>
            <span className="text-xs">
              Switch between light and dark mode
            </span>
          </div>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <Robot size={14} weight="bold" aria-hidden="true" />
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </SettingSection>
    </div>
  );
}

export function TelegramTab() {
  const [configs, setConfigs] = useState<BotConfig[]>([]);
  const [running, setRunning] = useState<RunningBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBotId, setExpandedBotId] = useState<string | null>(null);

  // Add bot form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState<"claude" | "codex" | "gemini" | "opencode" | "general">("claude");
  const [newToken, setNewToken] = useState("");
  const [showNewToken, setShowNewToken] = useState(false);
  const [newChatIds, setNewChatIds] = useState("");
  const [newUserIds, setNewUserIds] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.telegram.bots();
      setConfigs(res.data.configs as BotConfig[]);
      setRunning(res.data.running);
    } catch (err) {
      toast.error(`Failed to load bots: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddBot() {
    if (!newLabel.trim() || !newToken.trim()) {
      toast.error("Label and bot token are required");
      return;
    }

    setAdding(true);
    try {
      const parsedChatIds = newChatIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const parsedUserIds = newUserIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      await api.telegram.createBot({
        label: newLabel,
        role: newRole,
        botToken: newToken,
        allowedChatIds: parsedChatIds,
        allowedUserIds: parsedUserIds,
        enabled: true,
      });

      toast.success("Bot added");
      setShowAddForm(false);
      setNewLabel("");
      setNewRole("claude");
      setNewToken("");
      setNewChatIds("");
      setNewUserIds("");
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  }

  const botOptions = configs.map((c) => ({ id: c.id, label: c.label }));

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: 2 columns — Preview + Status/Streaming */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left column */}
        <SettingSection title="Preview" description="How your bot looks in Telegram.">
          <TelegramPreview />
        </SettingSection>

        {/* Right column — Status + Streaming stacked */}
        <div className="flex flex-col gap-4">
          <SettingSection title="Bot Status" description="Real-time status.">
            <TelegramStatus />
          </SettingSection>

          {configs.length > 0 && (
            <SettingSection
              title="Session Streaming"
              description="Stream session output to Telegram."
            >
              <div className="flex flex-col gap-3">
                {configs.length > 1 && (
                  <select
                    value={expandedBotId ?? configs[0]?.id ?? ""}
                    onChange={(e) => setExpandedBotId(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
                    style={{
                      background: "var(--color-bg-elevated)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {configs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
                {(() => {
                  const selectedId = expandedBotId ?? configs[0]?.id;
                  const selectedBot = configs.find((c) => c.id === selectedId);
                  if (!selectedBot) return null;
                  return (
                    <TelegramStreaming
                      botId={selectedBot.id}
                      botLabel={selectedBot.label}
                      bots={botOptions}
                    />
                  );
                })()}
              </div>
            </SettingSection>
          )}

          {/* Bot Management — same column */}
          <SettingSection
            title="Bot Management"
            description="Add, configure, and control your Telegram bots."
          >
            <div className="flex flex-col gap-3">
              {/* Add bot button */}
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-fit"
                style={{
                  background: showAddForm ? "var(--color-bg-elevated)" : "var(--color-accent)",
                  border: "1px solid var(--glass-border)",
                  color: showAddForm ? "var(--color-text-secondary)" : "#fff",
                }}
              >
                <Plus size={12} weight="bold" aria-hidden="true" />
                {showAddForm ? "Cancel" : "Add Bot"}
              </button>

              {/* Add bot form */}
              {showAddForm && (
                <div
                  className="flex flex-col gap-3 p-4 rounded-xl"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--glass-border)",
                  }}
                >
                  <h3
                    className="text-xs font-semibold"

                  >
                    New Bot
                  </h3>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-medium"

                    >
                      Label
                    </label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="My Claude Bot"
                      className="px-3 py-2 rounded-lg text-sm input-bordered"
                      style={{
                        background: "var(--color-bg-card)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-medium"

                    >
                      Role
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as "claude" | "codex" | "gemini" | "opencode" | "general")}
                      className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
                      style={{
                        background: "var(--color-bg-card)",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      <option value="claude">Claude Code — Anthropic CLI</option>
                      <option value="codex">Codex CLI — OpenAI CLI</option>
                      <option value="gemini">Gemini CLI — Google CLI</option>
                      <option value="opencode">OpenCode — open-source CLI</option>
                      <option value="general">General — general purpose</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-medium"

                    >
                      Bot Token
                    </label>
                    <div className="relative">
                      <input
                        type={showNewToken ? "text" : "password"}
                        value={newToken}
                        onChange={(e) => setNewToken(e.target.value)}
                        placeholder="1234567890:ABCdefGHI..."
                        className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered font-mono"
                        style={{
                          background: "var(--color-bg-card)",
                          color: "var(--color-text-primary)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewToken(!showNewToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"

                        aria-label={showNewToken ? "Hide token" : "Show token"}
                      >
                        {showNewToken ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-medium"

                    >
                      Allowed Chat IDs{" "}
                      <span>
                        (comma-separated, optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={newChatIds}
                      onChange={(e) => setNewChatIds(e.target.value)}
                      placeholder="-100123456789"
                      className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
                      style={{
                        background: "var(--color-bg-card)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-xs font-medium"

                    >
                      Admin User IDs{" "}
                      <span>
                        (comma-separated, only these users can use bot)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={newUserIds}
                      onChange={(e) => setNewUserIds(e.target.value)}
                      placeholder="123456789"
                      className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
                      style={{
                        background: "var(--color-bg-card)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <span className="text-xs">
                      Get your ID: send /start to @userinfobot on Telegram
                    </span>
                  </div>

                  <button
                    onClick={handleAddBot}
                    disabled={adding}
                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      background: "var(--color-accent)",
                      color: "#fff",
                      border: "none",
                      opacity: adding ? 0.7 : 1,
                    }}
                  >
                    {adding ? (
                      <>
                        <ArrowsClockwise size={12} className="animate-spin" aria-hidden="true" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus size={12} weight="bold" aria-hidden="true" />
                        Add Bot
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Bot list */}
              {loading ? (
                <div
                  className="flex items-center gap-2 py-3"

                >
                  <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
                  <span className="text-xs">Loading bots...</span>
                </div>
              ) : configs.length === 0 ? (
                <p className="text-xs py-2">
                  No bots configured. Add one above.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {configs.map((config) => (
                    <TelegramBotCard
                      key={config.id}
                      config={config}
                      running={running.find((r) => r.botId === config.id)}
                      onRefresh={refresh}
                      onDelete={(id) => setConfigs((prev) => prev.filter((c) => c.id !== id))}
                    />
                  ))}
                </div>
              )}
            </div>
          </SettingSection>
        </div>
      </div>

      {/* Debate Setup Guide — full width below */}
      <TelegramDebateGuide />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TelegramPreviewTab() {
  return (
    <SettingSection
      title="Preview"
      description="How your bot looks and what commands are available in Telegram."
    >
      <TelegramPreview />
    </SettingSection>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TelegramBotsTab() {
  const [configs, setConfigs] = useState<BotConfig[]>([]);
  const [running, setRunning] = useState<RunningBot[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState<"claude" | "codex" | "gemini" | "opencode" | "general">("claude");
  const [newToken, setNewToken] = useState("");
  const [showNewToken, setShowNewToken] = useState(false);
  const [newChatIds, setNewChatIds] = useState("");
  const [newUserIds, setNewUserIds] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.telegram.bots();
      setConfigs(res.data.configs as BotConfig[]);
      setRunning(res.data.running);
    } catch (err) {
      toast.error(`Failed to load bots: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAddBot() {
    if (!newLabel.trim() || !newToken.trim()) {
      toast.error("Label and bot token are required");
      return;
    }
    setAdding(true);
    try {
      const parsedChatIds = newChatIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      const parsedUserIds = newUserIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      await api.telegram.createBot({
        label: newLabel,
        role: newRole,
        botToken: newToken,
        allowedChatIds: parsedChatIds,
        allowedUserIds: parsedUserIds,
        enabled: true,
      });
      toast.success("Bot added");
      setShowAddForm(false);
      setNewLabel("");
      setNewRole("claude");
      setNewToken("");
      setNewChatIds("");
      setNewUserIds("");
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingSection title="Bot Status" description="Real-time status of your Telegram bots.">
        <TelegramStatus />
      </SettingSection>

      <SettingSection
        title="Bot Management"
        description="Add, configure, and control your Telegram bots."
      >
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer w-fit"
            style={{
              background: showAddForm ? "var(--color-bg-elevated)" : "var(--color-accent)",
              border: "1px solid var(--glass-border)",
              color: showAddForm ? "var(--color-text-secondary)" : "#fff",
            }}
          >
            <Plus size={12} weight="bold" aria-hidden="true" />
            {showAddForm ? "Cancel" : "Add Bot"}
          </button>

          {showAddForm && (
            <div
              className="flex flex-col gap-3 p-4 rounded-xl"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <InputField
                label="Label"
                value={newLabel}
                onChange={setNewLabel}
                placeholder="My Claude Bot"
              />
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium"

                >
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as "claude" | "codex" | "gemini" | "opencode" | "general")}
                  className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
                  style={{
                    background: "var(--color-bg-card)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex CLI</option>
                  <option value="gemini">Gemini CLI</option>
                  <option value="opencode">OpenCode</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium"

                >
                  Bot Token
                </label>
                <div className="relative">
                  <input
                    type={showNewToken ? "text" : "password"}
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="1234567890:ABCdefGHI..."
                    className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered font-mono"
                    style={{
                      background: "var(--color-bg-card)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewToken(!showNewToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"

                    aria-label={showNewToken ? "Hide" : "Show"}
                  >
                    {showNewToken ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <InputField
                label="Allowed Chat IDs (comma-separated)"
                value={newChatIds}
                onChange={setNewChatIds}
                placeholder="-100123456789"
              />
              <div className="flex flex-col gap-1.5">
                <InputField
                  label="Admin User IDs (comma-separated)"
                  value={newUserIds}
                  onChange={setNewUserIds}
                  placeholder="123456789"
                />
                <span className="text-xs">
                  Get your ID: send /start to @userinfobot
                </span>
              </div>
              <button
                onClick={handleAddBot}
                disabled={adding}
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                style={{
                  background: "var(--color-accent)",
                  color: "#fff",
                  border: "none",
                  opacity: adding ? 0.7 : 1,
                }}
              >
                {adding ? (
                  <>
                    <ArrowsClockwise size={12} className="animate-spin" /> Adding...
                  </>
                ) : (
                  <>
                    <Plus size={12} weight="bold" /> Add Bot
                  </>
                )}
              </button>
            </div>
          )}

          {loading ? (
            <div
              className="flex items-center gap-2 py-3"

            >
              <ArrowsClockwise size={14} className="animate-spin" />{" "}
              <span className="text-xs">Loading...</span>
            </div>
          ) : configs.length === 0 ? (
            <p className="text-xs py-2">
              No bots configured.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {configs.map((config) => (
                <TelegramBotCard
                  key={config.id}
                  config={config}
                  running={running.find((r) => r.botId === config.id)}
                  onRefresh={refresh}
                  onDelete={(id) => setConfigs((prev) => prev.filter((c) => c.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TelegramStreamingTab() {
  const [configs, setConfigs] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  useEffect(() => {
    api.telegram
      .bots()
      .then((res) => {
        const c = res.data.configs as BotConfig[];
        setConfigs(c);
        if (c.length > 0) setSelectedBotId(c[0]!.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="py-4 text-xs">
        Loading...
      </div>
    );
  if (configs.length === 0)
    return (
      <p className="text-xs py-4">
        Add a bot first in Bot Management.
      </p>
    );

  const selected = configs.find((c) => c.id === selectedBotId) ?? configs[0]!;

  return (
    <SettingSection
      title="Session Streaming"
      description="Configure session output streaming to Telegram."
    >
      <div className="flex flex-col gap-4">
        {configs.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              Bot
            </label>
            <select
              value={selectedBotId ?? ""}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            >
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <TelegramStreaming
          botId={selected.id}
          botLabel={selected.label}
          bots={configs.map((c) => ({ id: c.id, label: c.label }))}
        />
      </div>
    </SettingSection>
  );
}

export function DomainTab() {
  const [mode, setMode] = useState<"off" | "tunnel" | "nginx">("off");
  const [hostname, setHostname] = useState("");
  const [tunnelToken, setTunnelToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [sslMode, setSslMode] = useState<"manual" | "letsencrypt">("manual");
  const [letsencryptEmail, setLetsencryptEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [issuingCert, setIssuingCert] = useState(false);
  const [status, setStatus] = useState<{ gateway: string; tunnel: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current config
  useEffect(() => {
    api
      .get<{ data: { mode: string; hostname: string; hasTunnelToken: boolean; sslMode?: string; letsencryptEmail?: string } }>("/api/domain")
      .then((res) => {
        if (res.data) {
          setMode((res.data.mode as "off" | "tunnel" | "nginx") ?? "off");
          setHostname(res.data.hostname ?? "");
          setSslMode((res.data.sslMode as "manual" | "letsencrypt") ?? "manual");
          setLetsencryptEmail(res.data.letsencryptEmail ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get<{ data: { gateway: string; tunnel: string } }>(
        "/api/domain/status",
      );
      if (res.data) setStatus(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (mode !== "off") checkStatus();
  }, [mode, checkStatus]);

  const handleSave = useCallback(async () => {
    if (mode !== "off" && !hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }
    setSaving(true);
    try {
      await api.put("/api/domain", {
        mode,
        hostname: hostname.trim(),
        tunnelToken: tunnelToken.trim() || undefined,
        sslMode: mode === "nginx" ? sslMode : undefined,
        letsencryptEmail: sslMode === "letsencrypt" ? letsencryptEmail.trim() || undefined : undefined,
      });
      setSaved(true);
      toast.success("Domain config saved — files generated");
      setTimeout(() => setSaved(false), 3000);
      checkStatus();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }, [mode, hostname, tunnelToken, sslMode, letsencryptEmail, checkStatus]);

  const handleIssueCert = useCallback(async () => {
    setIssuingCert(true);
    try {
      const res = await api.post<{
        data?: { issued: boolean; hostname: string; output?: string };
        error?: string;
      }>("/api/domain/issue-cert", {});
      if (res.data?.issued) {
        toast.success(`SSL certificate issued for ${res.data.hostname}`);
      } else {
        toast.error(res.error ?? "Certificate issuance failed");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIssuingCert(false);
    }
  }, []);

  const handleApply = useCallback(async () => {
    try {
      const res = await api.post<{
        data: { applied: boolean; manual: boolean; command?: string; message?: string };
      }>("/api/domain/apply", {});
      if (res.data?.applied) {
        toast.success("Containers restarted");
        checkStatus();
      } else if (res.data?.manual) {
        toast.info(res.data.message ?? "Run docker compose up -d on host");
      }
    } catch {
      toast.error("Failed to apply");
    }
  }, [checkStatus]);

  if (loading)
    return (
      <div className="text-xs py-8 text-center">
        Loading...
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      {/* Mode selector */}
      <SettingSection
        title="Custom Domain"
        description="Access Companion via your own domain with automatic SSL."
      >
        <div className="flex flex-col gap-4">
          {/* Mode buttons */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              Mode
            </label>
            <div className="flex gap-2">
              {(["off", "tunnel", "nginx"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    background: mode === m ? "var(--color-accent)" : "var(--color-bg-elevated)",
                    color: mode === m ? "#fff" : "var(--color-text-secondary)",
                    border: `1px solid ${mode === m ? "var(--color-accent)" : "var(--color-border)"}`,
                  }}
                >
                  {m === "off" ? "Off" : m === "tunnel" ? "Cloudflare Tunnel" : "Nginx + SSL"}
                </button>
              ))}
            </div>
          </div>

          {mode !== "off" && (
            <>
              {/* Hostname */}
              <InputField
                label="Domain"
                value={hostname}
                onChange={setHostname}
                placeholder="app.yourdomain.com"
              />

              {/* Tunnel token (only for tunnel mode) */}
              {mode === "tunnel" && (
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"

                  >
                    Tunnel Token
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder="eyJhIjoiN..."
                      className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered font-mono"
                      style={{
                        background: "var(--color-bg-elevated)",
                        color: "var(--color-text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"

                      aria-label={showToken ? "Hide" : "Show"}
                    >
                      {showToken ? <EyeSlash size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-xs">
                    Cloudflare Dashboard → Zero Trust → Tunnels → Create → copy token
                  </p>
                </div>
              )}

              {/* SSL mode selector (nginx only) */}
              {mode === "nginx" && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">
                      SSL Certificate
                    </label>
                    <div className="flex gap-2">
                      {(["letsencrypt", "manual"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSslMode(m)}
                          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex-1"
                          style={{
                            background: sslMode === m ? "var(--color-accent)" : "var(--color-bg-elevated)",
                            color: sslMode === m ? "#fff" : "var(--color-text-secondary)",
                            border: `1px solid ${sslMode === m ? "var(--color-accent)" : "var(--color-border)"}`,
                          }}
                        >
                          {m === "letsencrypt" ? "Let's Encrypt (free)" : "Manual Certificate"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {sslMode === "letsencrypt" ? (
                    <div className="flex flex-col gap-2">
                      <InputField
                        label="Email (for certificate expiry notices)"
                        value={letsencryptEmail}
                        onChange={setLetsencryptEmail}
                        placeholder="you@example.com (optional)"
                      />
                      <div
                        className="px-3 py-2.5 rounded-lg text-xs"
                        style={{
                          background: "#34A85310",
                          color: "var(--color-text-secondary)",
                          border: "1px solid #34A85330",
                        }}
                      >
                        <strong style={{ color: "#34A853" }}>Auto-renewing SSL</strong> — Certbot
                        will obtain and renew certificates automatically. Make sure your domain
                        points to this server before issuing.
                      </div>
                    </div>
                  ) : (
                    <div
                      className="px-3 py-2.5 rounded-lg text-xs"
                      style={{
                        background: "var(--color-bg-elevated)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Place SSL certificates in{" "}
                      <code className="px-1 rounded" style={{ background: "var(--color-bg-base)" }}>
                        nginx/certs/origin.pem
                      </code>{" "}
                      and{" "}
                      <code className="px-1 rounded" style={{ background: "var(--color-bg-base)" }}>
                        nginx/certs/origin.key
                      </code>
                      <br />
                      Tip: Use free Cloudflare Origin Certificate (15-year validity)
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SettingSection>

      {/* Status + Apply */}
      {mode !== "off" && (
        <SettingSection title="Status">
          <div className="flex flex-col gap-3">
            {status && (
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        status.gateway === "running"
                          ? "#34A853"
                          : status.gateway === "offline"
                            ? "#EA4335"
                            : "#FBBC04",
                    }}
                  />
                  <span>
                    Gateway: {status.gateway}
                  </span>
                </div>
                {mode === "tunnel" && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: status.tunnel === "configured" ? "#34A853" : "#FBBC04",
                      }}
                    />
                    <span>
                      Tunnel: {status.tunnel}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Command to run */}
            <div
              className="flex items-center justify-between px-3 py-2.5 rounded-lg font-mono text-xs"
              style={{
                background: "#1a1a2e",
                color: "#34A853",
                border: "1px solid var(--glass-border)",
              }}
            >
              <code>docker compose up -d</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText("docker compose up -d");
                  toast.success("Copied!");
                }}
                className="px-2 py-1 rounded text-xs cursor-pointer"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Copy
              </button>
            </div>

            <p className="text-xs">
              After saving, run this command on the host to start the gateway
              {mode === "tunnel" ? " and tunnel" : ""}.
            </p>

            {/* Issue Certificate button for Let's Encrypt */}
            {mode === "nginx" && sslMode === "letsencrypt" && hostname && (
              <button
                onClick={handleIssueCert}
                disabled={issuingCert}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  background: "#34A85315",
                  color: "#34A853",
                  border: "1px solid #34A85340",
                  opacity: issuingCert ? 0.7 : 1,
                }}
              >
                {issuingCert ? (
                  <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
                ) : (
                  <Globe size={14} weight="bold" />
                )}
                {issuingCert ? "Issuing certificate..." : "Issue SSL Certificate"}
              </button>
            )}
          </div>
        </SettingSection>
      )}

      {/* Save button */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
          style={{
            background: saved ? "#34A853" : "var(--color-accent)",
            color: "#fff",
            border: "none",
          }}
        >
          {saved ? (
            <>
              <Check size={16} weight="bold" />
              Saved — files generated
            </>
          ) : (
            <>
              <FloppyDisk size={16} weight="bold" />
              {saving ? "Saving..." : "Save & Generate"}
            </>
          )}
        </button>

        {mode !== "off" && saved && (
          <button
            onClick={handleApply}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <ArrowsClockwise size={16} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
