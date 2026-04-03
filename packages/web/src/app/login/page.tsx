"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash, Key, WarningCircle } from "@phosphor-icons/react";
import { CompanionLogo } from "@/components/layout/companion-logo";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, {
      headers: { "X-API-Key": key },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = apiKey.trim();
      if (!trimmed) {
        setError("Please enter the access code.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const valid = await validateApiKey(trimmed);
        if (valid) {
          localStorage.setItem("api_key", trimmed);
          router.replace("/");
        } else {
          setError("Invalid access code. Please check and try again.");
        }
      } catch {
        setError("Could not reach the server. Make sure Companion is running.");
      } finally {
        setLoading(false);
      }
    },
    [apiKey, router],
  );

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
     
    >
      {/* Card */}
      <div
        className="w-full max-w-sm flex flex-col gap-6 p-8 rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-2 text-center">
          <CompanionLogo size="lg" />
          <p className="text-sm leading-relaxed">
            Enter the server access code to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* API key field */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="api-key"
              className="text-xs font-semibold"
             
            >
              Access Code
            </label>
            <div className="relative flex items-center">
              <span
                className="absolute left-3 flex items-center pointer-events-none"
                aria-hidden="true"
              >
                <Key size={15} />
              </span>
              <input
                id="api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="your-access-code"
                autoComplete="current-password"
                spellCheck={false}
                className="w-full rounded-lg pl-9 pr-10 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
                aria-describedby={error ? "api-key-error" : undefined}
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 flex items-center cursor-pointer rounded p-0.5"
               
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? <EyeSlash size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {/* Error message */}
            {error && (
              <div
                id="api-key-error"
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--color-danger)" }}
                role="alert"
              >
                <WarningCircle size={13} weight="fill" aria-hidden="true" />
                {error}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
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
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </button>
        </form>

        {/* Footer hint */}
        <p className="text-center text-xs" style={{ color: "var(--color-text-muted)" }}>
          The access code is set via{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>API_KEY</code> in
          your server config. Remove it to skip authentication.
        </p>
      </div>
    </div>
  );
}
