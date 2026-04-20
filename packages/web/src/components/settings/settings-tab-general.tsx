"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Globe,
  FloppyDisk,
  Check,
  PaintBrush,
  Bug,
  Lightbulb,
  Link,
  Sparkle,
  PaperPlaneTilt,
  ChartBar,
} from "@phosphor-icons/react";
import { areTipsEnabled, setTipsEnabled, resetDismissedTips } from "@/components/tips/tip-storage";
import {
  areInlineSuggestionsEnabled,
  setInlineSuggestionsEnabled,
} from "@/lib/suggest/settings";
import { useUiStore } from "@/lib/stores/ui-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { FEEDBACK_TYPES, openFeedback, type FeedbackType } from "@/lib/feedback";
import { isAnalyticsEnabled, setAnalyticsEnabled, trackEvent } from "@/lib/analytics";
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

  // GET /api/license returns a wrapped ApiResponse; POST /activate returns flat.
  interface LicenseInfo {
    tier: string;
    valid: boolean;
    maxSessions: number;
    expiresAt: string;
    daysLeft?: number;
    features?: string[];
  }
  interface LicenseGetResponse {
    success: boolean;
    data: LicenseInfo;
  }
  interface LicenseActivateResponse extends LicenseInfo {
    success?: boolean;
    error?: string;
    message?: string;
  }

  // Fetch current license status
  useEffect(() => {
    api
      .get<LicenseGetResponse>("/api/license")
      .then((res) => {
        if (res.data?.tier) setLicense(res.data);
      })
      .catch(() => {});
  }, []);

  const handleActivate = useCallback(async () => {
    if (!licenseKey.trim()) return;
    setActivating(true);
    try {
      const res = await api.post<LicenseActivateResponse>("/api/license/activate", {
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
          className="mb-4 flex items-center justify-between rounded-xl px-3 py-3 text-xs"
          style={{
            background: isPro ? "#34A85310" : isTrial ? "#f59e0b10" : "var(--color-bg-elevated)",
            border: `1px solid ${isPro ? "#34A85330" : isTrial ? "#f59e0b30" : "var(--color-border)"}`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: tierColors[license.tier] ?? "var(--color-text-muted)" }}
            />
            <span className="font-bold" style={{ color: tierColors[license.tier] }}>
              {license.tier === "pro" ? "PRO" : license.tier === "trial" ? "TRIAL" : "FREE"}
            </span>
            <span className="text-text-secondary">
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
            <span className="text-text-muted">
              {isPro || isTrial ? `Expires ${license.expiresAt.split("T")[0]}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Upgrade card — only show for free/trial */}
      {!isPro && (
        <div
          className="shadow-soft mb-4 rounded-xl p-4"
          style={{
            background: "linear-gradient(135deg, #6366f108, #8b5cf610, #ec489808)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <span className="text-text-primary text-sm font-bold">Companion Pro</span>
              <span className="text-text-muted ml-2 text-xs">$5/mo · $39/yr (save 35%)</span>
            </div>
          </div>
          <div className="text-text-secondary mb-3 grid grid-cols-2 gap-1.5 text-xs">
            <span>Unlimited sessions</span>
            <span>Multi-bot Telegram</span>
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
              className="flex flex-1 cursor-pointer items-center justify-center rounded-lg py-2 text-xs font-bold"
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
              className="text-text-secondary bg-bg-elevated shadow-soft flex cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
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
          className="input-bordered text-text-primary bg-bg-elevated flex-1 rounded-lg px-3 py-2 font-mono text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleActivate()}
        />
        <button
          onClick={handleActivate}
          disabled={activating || !licenseKey.trim()}
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
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

      <p className="text-text-muted mt-2 text-xs">
        Already purchased? Enter your license key above to activate.
      </p>
    </SettingSection>
  );
}

// ── Inline Suggestions Section ───────────────────────────────────────────────

function InlineSuggestionsSection() {
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? true : areInlineSuggestionsEnabled(),
  );

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setInlineSuggestionsEnabled(next);
    toast.success(`Inline suggestions ${next ? "enabled" : "disabled"}`);
  }, [enabled]);

  return (
    <SettingSection
      title="Inline Suggestions"
      description="Surface relevant skills as pill suggestions above the prompt input while you type."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkle size={16} weight="fill" className="text-accent" />
          <span className="text-sm font-medium">Show Inline Suggestions</span>
        </div>
        <button
          onClick={handleToggle}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors"
          style={{
            background: enabled ? "var(--color-accent)" : "var(--color-bg-elevated)",
          }}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle inline suggestions"
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-transform"
            style={{
              background: "#fff",
              transform: enabled ? "translateX(22px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>
    </SettingSection>
  );
}

// ── Tips Section ────────────────────────────────────────────────────────────

function TipsSection() {
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? true : areTipsEnabled(),
  );

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setTipsEnabled(next);
    toast.success(`Tips ${next ? "enabled" : "disabled"}`);
  }, [enabled]);

  const handleReset = useCallback(() => {
    resetDismissedTips();
    toast.success("All dismissed tips restored");
  }, []);

  return (
    <SettingSection
      title="Tips & Hints"
      description="Contextual tips to help you get the most out of Companion."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} weight="fill" className="text-warning" />
          <span className="text-sm font-medium">Show Tips</span>
        </div>
        <button
          onClick={handleToggle}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors"
          style={{
            background: enabled ? "var(--color-accent)" : "var(--color-bg-elevated)",
          }}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle tips"
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-transform"
            style={{
              background: "#fff",
              transform: enabled ? "translateX(22px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>
      <button
        onClick={handleReset}
        className="text-text-muted mt-2 cursor-pointer text-xs"
        style={{ background: "none", border: "none" }}
      >
        Reset dismissed tips
      </button>
    </SettingSection>
  );
}

// ── Analytics Section ───────────────────────────────────────────────────────

function AnalyticsSection() {
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined" ? false : isAnalyticsEnabled(),
  );

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setAnalyticsEnabled(next);
    if (next) {
      void trackEvent("analytics_opt_in");
      toast.success("Thanks for helping us improve Companion 💛");
    } else {
      toast.success("Analytics disabled");
    }
  }, [enabled]);

  return (
    <SettingSection
      title="Usage Analytics"
      description="Share anonymous usage data so we know which features matter. No personal data, no tracking across apps."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChartBar size={16} weight="fill" className="text-accent" />
          <span className="text-sm font-medium">Share anonymous usage data</span>
        </div>
        <button
          onClick={handleToggle}
          className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors"
          style={{
            background: enabled ? "var(--color-accent)" : "var(--color-bg-elevated)",
          }}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle usage analytics"
        >
          <span
            className="inline-block h-4 w-4 rounded-full transition-transform"
            style={{
              background: "#fff",
              transform: enabled ? "translateX(22px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>
      <p className="text-text-muted mt-2 text-xs leading-relaxed">
        Sent via Aptabase (privacy-first). Events: app opened, feature used, feedback sent. No IPs,
        no user IDs, no prompt content.
      </p>
    </SettingSection>
  );
}

// ── Feedback Section ────────────────────────────────────────────────────────

function FeedbackSection() {
  const handleClick = useCallback((type: FeedbackType) => {
    openFeedback(type);
    toast.success("Opening Telegram — drop your feedback there, bro 💛", {
      duration: 2500,
    });
  }, []);

  return (
    <SettingSection
      title="Feedback & Support"
      description="Help us shape Companion — send feedback directly via Telegram. No account signup needed."
    >
      <div className="flex flex-col gap-2">
        {(Object.keys(FEEDBACK_TYPES) as FeedbackType[]).map((type) => {
          const meta = FEEDBACK_TYPES[type];
          return (
            <button
              key={type}
              onClick={() => handleClick(type)}
              className="shadow-soft group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
              aria-label={`Send ${meta.label} via Telegram`}
            >
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base"
                style={{
                  background: `${meta.color}15`,
                  border: `1px solid ${meta.color}40`,
                }}
                aria-hidden="true"
              >
                {meta.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-text-primary text-sm font-semibold"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </div>
                <div className="text-text-muted truncate text-xs">{meta.description}</div>
              </div>
              <PaperPlaneTilt
                size={14}
                weight="bold"
                className="text-text-muted flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <p className="text-text-muted mt-3 text-xs leading-relaxed">
        Your message opens in Telegram pre-filled with app version + OS info. We usually reply
        within 24h.
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
  const [publicUrl, setPublicUrl] = useState("");

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
    api
      .get<{ data: { key: string; value: string } }>("/api/settings/review.publicUrl")
      .then((res) => setPublicUrl(res.data.value ?? ""))
      .catch(() => {});
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

      {/* Public URL (for Telegram review links) */}
      <SettingSection
        title="Public URL"
        description="External URL for Telegram review links. Leave empty to auto-detect LAN IP."
      >
        <div className="flex items-start gap-3">
          <Link
            size={16}
            weight="bold"
            className="text-text-muted shrink-0"
            style={{ marginTop: 8 }}
          />
          <div className="flex-1">
            <InputField
              label="Public URL"
              value={publicUrl}
              onChange={async (v) => {
                setPublicUrl(v);
                try {
                  await api.put("/api/settings/review.publicUrl", { value: v });
                } catch {
                  // non-fatal
                }
              }}
              placeholder="https://companion.mylab.dev"
            />
            <span className="text-text-muted text-xs opacity-70">
              Used by Telegram bot to generate clickable review links
            </span>
          </div>
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
            className="text-text-muted shrink-0"
            style={{ marginTop: 8 }}
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
          className="text-text-secondary shadow-soft flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{
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
            className="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors"
            style={{
              background: promptScanEnabled ? "var(--color-accent)" : "var(--color-bg-elevated)",
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
          className="text-text-secondary shadow-soft flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{
            textDecoration: "none",
            marginTop: 12,
          }}
        >
          <Bug size={16} />
          View Error Log ↗
        </a>
      </SettingSection>

      {/* Inline Suggestions */}
      <InlineSuggestionsSection />

      {/* Tips & Hints */}
      <TipsSection />

      {/* Usage Analytics */}
      <AnalyticsSection />

      {/* Feedback & Support */}
      <FeedbackSection />

      {/* Save button */}
      <button
        onClick={handleSave}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors"
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
