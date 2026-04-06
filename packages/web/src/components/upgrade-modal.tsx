"use client";

import { useCallback } from "react";
import {
  X,
  Lightning,
  Check,
  Globe,
  Robot,
  ChartLineUp,
  ShieldCheck,
  Users,
  Sparkle,
} from "@phosphor-icons/react";
import { useLicenseStore } from "@/lib/stores/license-store";

const POLAR_MONTHLY_URL = "https://buy.polar.sh/polar_cl_companion_pro_monthly";
const POLAR_YEARLY_URL = "https://buy.polar.sh/polar_cl_FbxFpo0LqLA1kENgDfKKL8rmNjeL2UBdecWw93NvX9a";
const SEPAY_URL = "https://pay.theio.vn/checkout/companion-pro";

const PRO_FEATURES = [
  { icon: <Lightning size={16} weight="fill" />, label: "Unlimited sessions", color: "#f59e0b" },
  { icon: <Users size={16} weight="fill" />, label: "Multi-bot Telegram", color: "#3b82f6" },
  { icon: <Robot size={16} weight="fill" />, label: "Multi-platform debate (Codex, Gemini, OpenCode)", color: "#8b5cf6" },
  { icon: <Globe size={16} weight="fill" />, label: "WebIntel (research, crawl, scrape)", color: "#10b981" },
  { icon: <ChartLineUp size={16} weight="fill" />, label: "CodeGraph (blast radius, flow trace)", color: "#06b6d4" },
  { icon: <ShieldCheck size={16} weight="fill" />, label: "Domain + Let's Encrypt SSL", color: "#34A853" },
  { icon: <Sparkle size={16} weight="fill" />, label: "Custom personas + RTK Pro", color: "#ec4899" },
];

export function UpgradeModal() {
  const showUpgrade = useLicenseStore((s) => s.showUpgrade);
  const upgradeReason = useLicenseStore((s) => s.upgradeReason);
  const dismissUpgrade = useLicenseStore((s) => s.dismissUpgrade);
  const tier = useLicenseStore((s) => s.tier);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) dismissUpgrade();
    },
    [dismissUpgrade],
  );

  if (!showUpgrade || tier === "pro") return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* Close */}
        <button
          onClick={dismissUpgrade}
          className="absolute top-3 right-3 p-1.5 rounded-lg cursor-pointer transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close"
        >
          <X size={16} weight="bold" />
        </button>

        {/* Header */}
        <div
          className="px-6 pt-6 pb-4"
          style={{
            background: "linear-gradient(135deg, #6366f115, #8b5cf615, #ec489815)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkle size={20} weight="fill" style={{ color: "#8b5cf6" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
              Upgrade to Pro
            </h2>
          </div>
          {upgradeReason && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              {upgradeReason}
            </p>
          )}
        </div>

        {/* Features */}
        <div className="px-6 py-4 flex flex-col gap-2.5">
          {PRO_FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: `${f.color}15`, color: f.color }}
              >
                {f.icon}
              </div>
              <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="px-6 pb-4">
          <div
            className="flex items-center justify-between p-4 rounded-xl"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
                  $5
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  /month
                </span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                or <strong>$39/year</strong>{" "}
                <span style={{ color: "#34A853" }}>(save 35%)</span>
              </div>
            </div>
            <Check size={20} weight="bold" style={{ color: "#34A853" }} />
          </div>
        </div>

        {/* CTA buttons */}
        <div className="px-6 pb-6 flex flex-col gap-2">
          <a
            href={POLAR_YEARLY_URL}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold cursor-pointer transition-colors"
            style={{
              background: "#8b5cf6",
              color: "#fff",
              border: "none",
              textDecoration: "none",
            }}
          >
            <Sparkle size={16} weight="fill" />
            Get Pro — $39/year
          </a>
          <div className="flex gap-2">
            <a
              href={POLAR_MONTHLY_URL}
              target="_blank"
              rel="noopener"
              className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                textDecoration: "none",
              }}
            >
              $5/month
            </a>
            <a
              href={SEPAY_URL}
              target="_blank"
              rel="noopener"
              className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                textDecoration: "none",
              }}
            >
              Pay via SePay (VN)
            </a>
          </div>
          <p
            className="text-center text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Secure checkout via Polar.sh &middot; Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
