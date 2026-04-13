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
        className="shadow-float bg-bg-card flex w-full max-w-sm flex-col gap-6 rounded-xl p-8"
        style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-2 text-center">
          <CompanionLogo size="lg" />
          <p className="text-text-secondary text-sm leading-relaxed">Enter your PIN to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin-input" className="text-xs font-semibold">
              PIN
            </label>
            <div className="relative flex items-center">
              <span
                className="pointer-events-none absolute left-3 flex items-center"
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
                className="input-bordered bg-bg-elevated w-full rounded-lg py-2.5 pl-9 pr-10 text-center text-sm tracking-widest transition-colors"
                style={{
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
                className="absolute right-3 flex cursor-pointer items-center rounded p-0.5"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
              >
                {showPin ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && (
              <div
                id="pin-error"
                className="text-danger flex items-center gap-1.5 text-xs"
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
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--color-google-blue)",
              color: "#fff",
            }}
          >
            {loading ? (
              <>
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden="true"
                />
                Verifying...
              </>
            ) : (
              "Unlock"
            )}
          </button>
        </form>

        <p className="text-text-muted text-center text-xs">
          Set your PIN in Settings. Remove it to disable authentication.
        </p>
      </div>
    </div>
  );
}
