"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  CreditCard,
  ArrowLeft,
  Copy,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useLicenseStore } from "@/lib/stores/license-store";
import { toast } from "sonner";

const PAY_API = "https://pay.theio.vn";
const BANK_ID = "tpbank";
const BANK_ACCOUNT = "04162263666";
const BANK_NAME = "NGUYEN VIET NAM";

const POLAR_MONTHLY_URL =
  "https://buy.polar.sh/polar_cl_bH3oM1b9ub5rugiUyeV4NvdHQf3IhkhtZBRkb0h2bmr";
const POLAR_YEARLY_URL =
  "https://buy.polar.sh/polar_cl_CGWIyshnh7Xkodt1CaLkYPG0Z5jL1wjmLmD7Q4CEACZ";

const PRO_FEATURE_HIGHLIGHTS = [
  { icon: <Lightning size={14} weight="fill" />, label: "Unlimited sessions", color: "#f59e0b" },
  { icon: <Users size={14} weight="fill" />, label: "Multi-bot Telegram", color: "#3b82f6" },
  { icon: <Robot size={14} weight="fill" />, label: "Multi-platform debate", color: "#8b5cf6" },
  { icon: <Globe size={14} weight="fill" />, label: "WebIntel + CodeGraph", color: "#10b981" },
  { icon: <ChartLineUp size={14} weight="fill" />, label: "Domain + SSL", color: "#06b6d4" },
  { icon: <ShieldCheck size={14} weight="fill" />, label: "Personas + RTK Pro", color: "#34A853" },
];

type Step = "features" | "sepay-email" | "sepay-qr" | "success";

export function UpgradeModal() {
  const showUpgrade = useLicenseStore((s) => s.showUpgrade);
  const upgradeReason = useLicenseStore((s) => s.upgradeReason);
  const dismissUpgrade = useLicenseStore((s) => s.dismissUpgrade);
  const tier = useLicenseStore((s) => s.tier);

  const [step, setStep] = useState<Step>("features");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [amount, setAmount] = useState(975000);
  const [licenseKey, setLicenseKey] = useState("");
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup poll on unmount or close
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const resetState = useCallback(() => {
    setStep("features");
    setEmail("");
    setName("");
    setOrderCode("");
    setLicenseKey("");
    setCreating(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    dismissUpgrade();
  }, [resetState, dismissUpgrade]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const startPolling = useCallback((code: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${PAY_API}/order/${code}`);
        const data = (await res.json()) as { status: string; licenseKey?: string };
        if (
          data.status === "fulfilled" ||
          data.status === "delivered" ||
          data.status === "completed"
        ) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLicenseKey(data.licenseKey ?? "");
          setStep("success");
        }
      } catch {
        // Continue polling
      }
    }, 5000);
  }, []);

  const handleCreateOrder = useCallback(async () => {
    if (!email.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${PAY_API}/order/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "CMP-PRO",
          email: email.trim(),
          name: name.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        orderCode: string;
        amount: number;
        error?: string;
      };
      if (!data.success) throw new Error(data.error ?? "Order creation failed");

      setOrderCode(data.orderCode);
      setAmount(data.amount ?? 975000);
      setStep("sepay-qr");
      startPolling(data.orderCode);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCreating(false);
    }
  }, [email, name, startPolling]);

  const qrUrl = orderCode
    ? `https://img.vietqr.io/image/${BANK_ID}-${BANK_ACCOUNT}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(orderCode)}&accountName=${encodeURIComponent(BANK_NAME)}`
    : "";

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
          onClick={handleClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg cursor-pointer transition-colors z-10"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close"
        >
          <X size={16} weight="bold" />
        </button>

        {/* ── Step: Features + CTA ── */}
        {step === "features" && (
          <>
            {/* Header */}
            <div
              className="px-6 pt-6 pb-4"
              style={{ background: "linear-gradient(135deg, #6366f115, #8b5cf615, #ec489815)" }}
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
            <div className="px-6 py-4 grid grid-cols-2 gap-2">
              {PRO_FEATURE_HIGHLIGHTS.map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <span style={{ color: f.color }}>{f.icon}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-primary)" }}>
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
                    <span
                      className="text-2xl font-bold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
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

            {/* CTA */}
            <div className="px-6 pb-6 flex flex-col gap-2">
              <a
                href={POLAR_YEARLY_URL}
                target="_blank"
                rel="noopener"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold cursor-pointer"
                style={{ background: "#8b5cf6", color: "#fff", textDecoration: "none" }}
              >
                <Sparkle size={16} weight="fill" />
                Get Pro — $39/year
              </a>
              <div className="flex gap-2">
                <a
                  href={POLAR_MONTHLY_URL}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                    textDecoration: "none",
                  }}
                >
                  $5/month
                </a>
                <button
                  onClick={() => setStep("sepay-email")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <CreditCard size={14} weight="bold" />
                  Bank Transfer (VN)
                </button>
              </div>
              <p className="text-center text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Secure checkout via Polar.sh &middot; Cancel anytime
              </p>
            </div>
          </>
        )}

        {/* ── Step: SePay Email ── */}
        {step === "sepay-email" && (
          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep("features")}
                className="p-1 rounded cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
                aria-label="Back"
              >
                <ArrowLeft size={16} weight="bold" />
              </button>
              <h2 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                Bank Transfer — Companion Pro (975,000đ/yr)
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Email (to receive license key)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrder()}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrder()}
                />
              </div>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={creating || !email.trim()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold cursor-pointer"
              style={{
                background: creating ? "var(--color-text-muted)" : "#8b5cf6",
                color: "#fff",
                opacity: !email.trim() ? 0.5 : 1,
              }}
            >
              {creating ? (
                <>
                  <ArrowsClockwise size={16} weight="bold" className="animate-spin" />
                  Creating order...
                </>
              ) : (
                "Generate QR Code"
              )}
            </button>
          </div>
        )}

        {/* ── Step: SePay QR ── */}
        {step === "sepay-qr" && (
          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  pollRef.current = null;
                  setStep("sepay-email");
                }}
                className="p-1 rounded cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
                aria-label="Back"
              >
                <ArrowLeft size={16} weight="bold" />
              </button>
              <h2 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                Scan QR to pay
              </h2>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- external QR code URL, can't use next/image */}
              <img
                src={qrUrl}
                alt="VietQR Payment"
                className="rounded-xl"
                style={{ width: 240, height: 240, background: "#fff" }}
              />
            </div>

            {/* Details */}
            <div
              className="flex flex-col gap-2 p-3 rounded-xl text-xs"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Amount</span>
                <span className="font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {amount.toLocaleString("vi-VN")}đ
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Transfer content</span>
                <div className="flex items-center gap-1.5">
                  <code
                    className="px-2 py-0.5 rounded font-bold"
                    style={{ background: "var(--color-bg-base)", color: "#8b5cf6", fontSize: 11 }}
                  >
                    {orderCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(orderCode);
                      toast.success("Copied!");
                    }}
                    className="p-1 rounded cursor-pointer"
                    style={{ color: "var(--color-text-muted)" }}
                    aria-label="Copy order code"
                  >
                    <Copy size={12} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--color-text-muted)" }}>Bank</span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  TPBank — {BANK_ACCOUNT}
                </span>
              </div>
            </div>

            {/* Status */}
            <div
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium"
              style={{ background: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b30" }}
            >
              <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
              Waiting for payment...
            </div>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && (
          <div className="px-6 py-8 flex flex-col items-center gap-4">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full"
              style={{ background: "#34A85315" }}
            >
              <Check size={28} weight="bold" style={{ color: "#34A853" }} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
              Payment received!
            </h2>
            <p className="text-xs text-center" style={{ color: "var(--color-text-secondary)" }}>
              Your license key has been sent to <strong>{email}</strong>
            </p>

            {licenseKey && (
              <div className="w-full flex flex-col gap-2">
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <code className="text-xs font-bold" style={{ color: "#8b5cf6" }}>
                    {licenseKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(licenseKey);
                      toast.success("License key copied!");
                    }}
                    className="p-1 rounded cursor-pointer"
                    style={{ color: "var(--color-text-muted)" }}
                    aria-label="Copy license key"
                  >
                    <Copy size={14} weight="bold" />
                  </button>
                </div>
                <p className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
                  Go to Settings → License to activate
                </p>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
