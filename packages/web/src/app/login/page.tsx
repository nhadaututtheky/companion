"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash, LockSimple, WarningCircle } from "@phosphor-icons/react";
import { CompanionLogo } from "@/components/layout/companion-logo";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function validatePin(pin: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { "X-API-Key": pin },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = pin.trim();
      if (!trimmed) {
        setError("Please enter your PIN.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const valid = await validatePin(trimmed);
        if (valid) {
          localStorage.setItem("api_key", trimmed);
          router.replace("/");
        } else {
          setError("Invalid PIN. Please try again.");
        }
      } catch {
        setError("Could not reach the server. Make sure Companion is running.");
      } finally {
        setLoading(false);
      }
    },
    [pin, router],
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        className="shadow-float w-full max-w-sm flex flex-col gap-6 p-8 rounded-xl bg-bg-card" style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-2 text-center">
          <CompanionLogo size="lg" />
          <p className="text-sm leading-relaxed text-text-secondary">
            Enter your PIN to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin-input" className="text-xs font-semibold">
              PIN
            </label>
            <div className="relative flex items-center">
              <span
                className="absolute left-3 flex items-center pointer-events-none"
                aria-hidden="true"
              >
                <LockSimple size={15} />
              </span>
              <input
                id="pin-input"
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter PIN"
                autoComplete="current-password"
                spellCheck={false}
                className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm text-center tracking-widest input-bordered transition-colors bg-bg-elevated" style={{
                  ...(error ? { borderColor: "var(--color-danger)" } : {}),
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "1.25rem",
                  letterSpacing: "0.3em",
                }}
                aria-describedby={error ? "pin-error" : undefined}
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 flex items-center cursor-pointer rounded p-0.5"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && (
              <div
                id="pin-error"
                className="flex items-center gap-1.5 text-xs text-danger"
                role="alert"
              >
                <WarningCircle size={13} weight="fill" aria-hidden="true" />
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            style={{
              background: "var(--color-google-blue)",
              color: "#fff",
            }}
          >
            {loading ? (
              <>
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden="true"
                />
                Verifying...
              </>
            ) : (
              "Unlock"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-text-muted">
          Set your PIN in Settings. Remove it to disable authentication.
        </p>
      </div>
    </div>
  );
}
