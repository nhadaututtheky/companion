"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  LinkSimple,
  QrCode,
  Copy,
  Check,
  Trash,
  Eye,
  PencilSimple,
  CircleNotch,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import QRCode from "qrcode";

interface ShareModalProps {
  sessionId: string;
  onClose: () => void;
}

interface ShareInfo {
  token: string;
  permission: string;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
}

export function ShareModal({ sessionId, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [permission, setPermission] = useState<"read-only" | "interactive">("read-only");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.share.list(sessionId);
      setShares(res.data);
    } catch {
      toast.error("Failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await api.share.create(sessionId, { permission, expiresInHours });
      toast.success("Share link created");
      setSelectedToken(res.data.token);
      await refresh();
      await generateQR(res.data.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await api.share.revoke(token);
      toast.success("Share revoked");
      if (selectedToken === token) {
        setSelectedToken(null);
        setQrDataUrl(null);
      }
      await refresh();
    } catch {
      toast.error("Failed to revoke share");
    }
  };

  const generateQR = async (token: string) => {
    const spectateUrl = `${window.location.origin}/spectate/${token}`;
    try {
      const dataUrl = await QRCode.toDataURL(spectateUrl, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setSelectedToken(token);
    } catch {
      toast.error("Failed to generate QR code");
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/spectate/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--overlay-medium)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="shadow-float bg-bg-card flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl p-5"
        style={{
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode size={18} weight="bold" aria-hidden="true" />
            <span className="text-sm font-semibold">Share Session</span>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
            aria-label="Close share modal"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        {/* Create new share */}
        <div className="bg-bg-elevated flex flex-col gap-3 rounded-xl p-3 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide">New Share Link</span>
          <div className="flex items-center gap-3">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as "read-only" | "interactive")}
              className="text-text-primary bg-bg-card border-border flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-xs"
              aria-label="Permission level"
            >
              <option value="read-only">Read-only (view stream)</option>
              <option value="interactive">Interactive (can chat)</option>
            </select>
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="text-text-primary bg-bg-card border-border cursor-pointer rounded-lg border px-2 py-1.5 text-xs"
              aria-label="Expiry time"
            >
              <option value={1}>1 hour</option>
              <option value={6}>6 hours</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
              border: "none",
            }}
          >
            {creating ? (
              <CircleNotch size={14} className="animate-spin" />
            ) : (
              <LinkSimple size={14} weight="bold" />
            )}
            Generate Share Link
          </button>
        </div>

        {/* QR Code display */}
        {qrDataUrl && selectedToken && (
          <div className="flex flex-col items-center gap-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR code for session share link"
              className="rounded-xl"
              style={{ width: 200, height: 200 }}
            />
            <div className="flex items-center gap-2">
              <span
                className="text-text-muted bg-bg-elevated max-w-[200px] truncate rounded-lg px-2 py-1 text-[10px]"
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {selectedToken.slice(0, 16)}...
              </span>
              <button
                onClick={() => copyLink(selectedToken)}
                className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{
                  color:
                    copiedToken === selectedToken
                      ? "var(--color-success)"
                      : "var(--color-text-muted)",
                }}
                aria-label="Copy share link"
              >
                {copiedToken === selectedToken ? (
                  <Check size={14} weight="bold" />
                ) : (
                  <Copy size={14} weight="bold" />
                )}
              </button>
            </div>
            <span className="text-[10px]">Scan QR or share the link — no login required</span>
          </div>
        )}

        {/* Active shares list */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <CircleNotch size={14} className="animate-spin" />
            <span className="text-xs">Loading shares...</span>
          </div>
        ) : shares.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Active Shares ({shares.length})
            </span>
            {shares.map((s) => (
              <div
                key={s.token}
                className="border-border flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{
                  background:
                    selectedToken === s.token ? "var(--color-bg-elevated)" : "transparent",
                }}
              >
                <span style={{ color: s.permission === "interactive" ? "#a78bfa" : "#4285f4" }}>
                  {s.permission === "interactive" ? (
                    <PencilSimple size={12} weight="bold" aria-hidden="true" />
                  ) : (
                    <Eye size={12} weight="bold" aria-hidden="true" />
                  )}
                </span>
                <span
                  className="text-text-secondary flex-1 truncate text-[10px]"
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {s.token.slice(0, 12)}...
                </span>
                <span className="text-[10px]">
                  {new Date(s.expiresAt) > new Date()
                    ? `${Math.round((new Date(s.expiresAt).getTime() - Date.now()) / 3600000)}h left`
                    : "Expired"}
                </span>
                <button
                  onClick={() => generateQR(s.token)}
                  className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--color-bg-elevated)]"
                  aria-label="Show QR code"
                  title="Show QR code"
                >
                  <QrCode size={12} weight="bold" />
                </button>
                <button
                  onClick={() => copyLink(s.token)}
                  className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--color-bg-elevated)]"
                  style={{
                    color:
                      copiedToken === s.token ? "var(--color-success)" : "var(--color-text-muted)",
                  }}
                  aria-label="Copy link"
                  title="Copy link"
                >
                  {copiedToken === s.token ? (
                    <Check size={12} weight="bold" />
                  ) : (
                    <Copy size={12} weight="bold" />
                  )}
                </button>
                <button
                  onClick={() => handleRevoke(s.token)}
                  className="cursor-pointer rounded p-1 transition-colors hover:bg-[var(--color-bg-elevated)]"
                  style={{ color: "var(--color-danger, #EA4335)" }}
                  aria-label="Revoke share"
                  title="Revoke share"
                >
                  <Trash size={12} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
