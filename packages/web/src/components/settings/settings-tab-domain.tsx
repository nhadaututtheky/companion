"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, FloppyDisk, Check, Eye, EyeSlash, ArrowsClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { SettingSection, InputField } from "./settings-tabs";

// ── Domain Tab ──────────────────────────────────────────────────────────────

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
      .get<{
        data: {
          mode: string;
          hostname: string;
          hasTunnelToken: boolean;
          sslMode?: string;
          letsencryptEmail?: string;
        };
      }>("/api/domain")
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
        letsencryptEmail:
          sslMode === "letsencrypt" ? letsencryptEmail.trim() || undefined : undefined,
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

  if (loading) return <div className="py-8 text-center text-xs">Loading...</div>;

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
            <label className="text-xs font-medium">Mode</label>
            <div className="flex gap-2">
              {(["off", "tunnel", "nginx"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
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
                  <label className="text-xs font-medium">Tunnel Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      placeholder="eyJhIjoiN..."
                      className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg px-3 py-2 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
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
                    <label className="text-xs font-medium">SSL Certificate</label>
                    <div className="flex gap-2">
                      {(["letsencrypt", "manual"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSslMode(m)}
                          className="flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                          style={{
                            background:
                              sslMode === m ? "var(--color-accent)" : "var(--color-bg-elevated)",
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
                        className="text-text-secondary rounded-lg px-3 py-2.5 text-xs"
                        style={{
                          background: "#34A85310",
                          border: "1px solid #34A85330",
                        }}
                      >
                        <strong style={{ color: "#34A853" }}>Auto-renewing SSL</strong> — Certbot
                        will obtain and renew certificates automatically. Make sure your domain
                        points to this server before issuing.
                      </div>
                    </div>
                  ) : (
                    <div className="text-text-muted bg-bg-elevated rounded-lg px-3 py-2.5 text-xs">
                      Place SSL certificates in{" "}
                      <code className="bg-bg-base rounded px-1">nginx/certs/origin.pem</code> and{" "}
                      <code className="bg-bg-base rounded px-1">nginx/certs/origin.key</code>
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
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        status.gateway === "running"
                          ? "#34A853"
                          : status.gateway === "offline"
                            ? "#EA4335"
                            : "#FBBC04",
                    }}
                  />
                  <span>Gateway: {status.gateway}</span>
                </div>
                {mode === "tunnel" && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: status.tunnel === "configured" ? "#34A853" : "#FBBC04",
                      }}
                    />
                    <span>Tunnel: {status.tunnel}</span>
                  </div>
                )}
              </div>
            )}

            {/* Command to run */}
            <div
              className="shadow-soft flex items-center justify-between rounded-lg px-3 py-2.5 font-mono text-xs"
              style={{
                background: "#1a1a2e",
                color: "#34A853",
              }}
            >
              <code>docker compose up -d</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText("docker compose up -d");
                  toast.success("Copied!");
                }}
                className="text-text-secondary bg-bg-elevated cursor-pointer rounded px-2 py-1 text-xs"
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
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-colors"
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
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors"
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
            className="text-text-primary bg-bg-elevated shadow-soft cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <ArrowsClockwise size={16} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
