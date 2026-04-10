"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Globe, FloppyDisk, Check, PaintBrush, Bug } from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SettingSection, InputField } from "./settings-tabs";

// ── License Section ─────────────────────────────────────────────────────────

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
    } catch (err) {
      // Server returns 400 with JSON body — extract the actual error message
      const msg = err instanceof Error ? err.message : String(err);
      // Try to parse server error JSON from the response text
      const jsonMatch = msg.match(/\{[^}]*"error"\s*:\s*"([^"]+)"/);
      const serverError = jsonMatch?.[1];
      toast.error(
        serverError ??
          (msg.includes("Cannot reach")
            ? "Cannot reach license server — check network"
            : "License activation failed"),
      );
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
      description={
        isPro
          ? "You have full access to all Companion features."
          : "Upgrade to Pro to unlock all features."
      }
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
                ? license.maxSessions < 0
                  ? "Unlimited sessions"
                  : `${license.maxSessions} sessions`
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
          <div
            className="grid grid-cols-2 gap-1.5 mb-3 text-xs"
            style={{ color: "var(--color-text-secondary)" }}
          >
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

// ── General Tab ─────────────────────────────────────────────────────────────

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
            <span className="text-xs">Status:</span>
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
            <span className="text-sm font-medium">Prompt Scanner</span>
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
