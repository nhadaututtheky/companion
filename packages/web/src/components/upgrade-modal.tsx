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
import { Z } from "@/lib/z-index";
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
  { icon: <Globe size={14} weight="fill" />, label: "CodeGraph analysis", color: "#10b981" },
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
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: Z.topModal,
        background: "var(--overlay-heavy)",
        backdropFilter: "blur(var(--glass-blur-sm))",
      }}
      onClick={handleBackdrop}
    >
      <div
        className="shadow-float bg-bg-card relative mx-4 w-full max-w-md overflow-hidden rounded-2xl"
        style={{
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="text-text-muted absolute right-3 top-3 z-10 cursor-pointer rounded-lg p-1.5 transition-colors"
          aria-label="Close"
        >
          <X size={16} weight="bold" />
        </button>

        {/* ── Step: Features + CTA ── */}
        {step === "features" && (
          <>
            {/* Header */}
            <div
              className="px-6 pb-4 pt-6"
              style={{ background: "linear-gradient(135deg, #6366f115, #8b5cf615, #ec489815)" }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Sparkle size={20} weight="fill" style={{ color: "#8b5cf6" }} />
                <h2 className="text-text-primary text-lg font-bold">Upgrade to Pro</h2>
              </div>
              {upgradeReason && <p className="text-text-secondary text-xs">{upgradeReason}</p>}
            </div>

            {/* Features */}
            <div className="grid grid-cols-2 gap-2 px-6 py-4">
              {PRO_FEATURE_HIGHLIGHTS.map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <span style={{ color: f.color }}>{f.icon}</span>
                  <span className="text-text-primary text-xs">{f.label}</span>
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div className="px-6 pb-4">
              <div className="bg-bg-elevated flex items-center justify-between rounded-xl p-4 shadow-sm">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-text-primary text-2xl font-bold">$5</span>
                    <span className="text-text-muted text-xs">/month</span>
                  </div>
                  <div className="text-text-secondary mt-0.5 text-xs">
                    or <strong>$39/year</strong>{" "}
                    <span style={{ color: "#34A853" }}>(save 35%)</span>
                  </div>
                </div>
                <Check size={20} weight="bold" style={{ color: "#34A853" }} />
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-2 px-6 pb-6">
              <a
                href={POLAR_YEARLY_URL}
                target="_blank"
                rel="noopener"
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
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
                  className="text-text-secondary bg-bg-elevated border-border flex flex-1 cursor-pointer items-center justify-center rounded-xl border py-2.5 text-xs font-semibold"
                  style={{
                    textDecoration: "none",
                  }}
                >
                  $5/month
                </a>
                <button
                  onClick={() => setStep("sepay-email")}
                  className="text-text-secondary bg-bg-elevated border-border flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold"
                >
                  <CreditCard size={14} weight="bold" />
                  Bank Transfer (VN)
                </button>
              </div>
              <p className="text-text-muted mt-1 text-center text-xs">
                Secure checkout via Polar.sh &middot; Cancel anytime
              </p>
            </div>
          </>
        )}

        {/* ── Step: SePay Email ── */}
        {step === "sepay-email" && (
          <div className="flex flex-col gap-4 px-6 py-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep("features")}
                className="text-text-muted cursor-pointer rounded p-1"
                aria-label="Back"
              >
                <ArrowLeft size={16} weight="bold" />
              </button>
              <h2 className="text-text-primary text-sm font-bold">
                Bank Transfer — Companion Pro (975,000đ/yr)
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-text-secondary text-xs font-medium">
                  Email (to receive license key)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="shadow-soft text-text-primary bg-bg-elevated rounded-lg px-3 py-2.5 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrder()}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-text-secondary text-xs font-medium">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="shadow-soft text-text-primary bg-bg-elevated rounded-lg px-3 py-2.5 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateOrder()}
                />
              </div>
            </div>

            <button
              onClick={handleCreateOrder}
              disabled={creating || !email.trim()}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
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
          <div className="flex flex-col gap-4 px-6 py-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  pollRef.current = null;
                  setStep("sepay-email");
                }}
                className="text-text-muted cursor-pointer rounded p-1"
                aria-label="Back"
              >
                <ArrowLeft size={16} weight="bold" />
              </button>
              <h2 className="text-text-primary text-sm font-bold">Scan QR to pay</h2>
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
            <div className="bg-bg-elevated flex flex-col gap-2 rounded-xl p-3 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Amount</span>
                <span className="text-text-primary font-bold">
                  {amount.toLocaleString("vi-VN")}đ
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Transfer content</span>
                <div className="flex items-center gap-1.5">
                  <code
                    className="bg-bg-base rounded px-2 py-0.5 font-bold"
                    style={{ color: "#8b5cf6", fontSize: 11 }}
                  >
                    {orderCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(orderCode);
                      toast.success("Copied!");
                    }}
                    className="text-text-muted cursor-pointer rounded p-1"
                    aria-label="Copy order code"
                  >
                    <Copy size={12} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Bank</span>
                <span className="text-text-secondary">TPBank — {BANK_ACCOUNT}</span>
              </div>
            </div>

            {/* Status */}
            <div
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium"
              style={{ background: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b30" }}
            >
              <ArrowsClockwise size={14} weight="bold" className="animate-spin" />
              Waiting for payment...
            </div>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && (
          <div className="flex flex-col items-center gap-4 px-6 py-8">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "#34A85315" }}
            >
              <Check size={28} weight="bold" style={{ color: "#34A853" }} />
            </div>
            <h2 className="text-text-primary text-lg font-bold">Payment received!</h2>
            <p className="text-text-secondary text-center text-xs">
              Your license key has been sent to <strong>{email}</strong>
            </p>

            {licenseKey && (
              <div className="flex w-full flex-col gap-2">
                <div className="shadow-soft bg-bg-elevated flex items-center justify-between rounded-lg px-3 py-2.5 font-mono">
                  <code className="text-xs font-bold" style={{ color: "#8b5cf6" }}>
                    {licenseKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(licenseKey);
                      toast.success("License key copied!");
                    }}
                    className="text-text-muted cursor-pointer rounded p-1"
                    aria-label="Copy license key"
                  >
                    <Copy size={14} weight="bold" />
                  </button>
                </div>
                <p className="text-text-muted text-center text-xs">
                  Go to Settings → License to activate
                </p>
              </div>
            )}

            <button
              onClick={handleClose}
              className="shadow-soft text-text-primary bg-bg-elevated w-full cursor-pointer rounded-xl py-2.5 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
