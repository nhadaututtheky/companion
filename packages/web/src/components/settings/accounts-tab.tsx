"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, CheckCircle, PencilSimple, Trash, Warning } from "@phosphor-icons/react";
import { SettingSection } from "./settings-tabs";
import { accounts as accountsApi, type AccountInfo } from "@/lib/api/accounts";

const STATUS_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  ready: { bg: "#10b98115", dot: "#10b981", label: "Ready" },
  rate_limited: { bg: "#f59e0b15", dot: "#f59e0b", label: "Rate Limited" },
  expired: { bg: "#ef444415", dot: "#ef4444", label: "Expired" },
  error: { bg: "#ef444415", dot: "#ef4444", label: "Error" },
};

function formatCost(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(usd);
}

function formatCooldown(until: string | null): string | null {
  if (!until) return null;
  const remainMs = new Date(until).getTime() - Date.now();
  if (remainMs <= 0) return null;
  const mins = Math.ceil(remainMs / 60_000);
  return `${mins}m left`;
}

export function AccountsTab() {
  const [list, setList] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await accountsApi.list();
      setList(res.data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleActivate = async (id: string) => {
    setSwitching(id);
    try {
      await accountsApi.activate(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSwitching(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      await accountsApi.rename(id, editLabel.trim());
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete account "${label}"? This cannot be undone.`)) return;
    try {
      await accountsApi.remove(id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      await accountsApi.capture();
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setCapturing(false);
    }
  };

  if (loading && list.length === 0) {
    return (
      <SettingSection title="Accounts">
        <p className="text-text-secondary text-sm">Loading...</p>
      </SettingSection>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingSection
        title="Multi-Account Manager"
        description="Manage multiple Anthropic OAuth accounts. Accounts are auto-captured when you run /login in Claude Code."
      >
        {error && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#ef444415", color: "#ef4444" }}
          >
            <Warning size={14} weight="bold" />
            {error}
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-text-secondary flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm">No accounts saved yet.</p>
            <p className="text-xs">
              Run <code className="bg-bg-elevated rounded px-1.5 py-0.5">/login</code> in Claude
              Code — Companion will auto-capture the credentials.
            </p>
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="text-accent flex cursor-pointer items-center gap-1.5 text-xs font-medium disabled:opacity-50"
            >
              <ArrowsClockwise size={12} weight="bold" className={capturing ? "animate-spin" : ""} />
              {capturing ? "Scanning..." : "Manual capture"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((account) => {
              const statusInfo = STATUS_COLORS[account.status] ?? STATUS_COLORS.ready;
              const cooldown = formatCooldown(account.statusUntil);
              const isEditing = editingId === account.id;

              return (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors"
                  style={{
                    background: account.isActive
                      ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                      : "var(--color-bg-elevated)",
                    border: account.isActive
                      ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)"
                      : "1px solid var(--glass-border)",
                  }}
                >
                  {/* Status dot */}
                  <div
                    className="shrink-0 rounded-full"
                    role="img"
                    aria-label={statusInfo.label}
                    style={{
                      width: 8,
                      height: 8,
                      background: statusInfo.dot,
                      boxShadow: `0 0 6px ${statusInfo.dot}40`,
                    }}
                    title={statusInfo.label}
                  />

                  {/* Label + info */}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(account.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="bg-bg-base rounded px-2 py-1 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => void handleRename(account.id)}
                          className="text-accent cursor-pointer text-xs font-medium"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-text-primary text-sm font-medium">
                          {account.label}
                        </span>
                        {account.isActive && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                            style={{
                              background: "color-mix(in srgb, var(--color-accent) 15%, transparent)",
                              color: "var(--color-accent)",
                            }}
                          >
                            Active
                          </span>
                        )}
                        {account.subscriptionType && (
                          <span className="text-text-muted text-xs capitalize">
                            {account.subscriptionType}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-text-muted mt-0.5 flex items-center gap-2 text-xs">
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {formatCost(account.totalCostUsd)}
                      </span>
                      {cooldown && (
                        <span style={{ color: statusInfo.dot }}>
                          {statusInfo.label} ({cooldown})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {!account.isActive && (
                      <button
                        onClick={() => void handleActivate(account.id)}
                        disabled={switching === account.id}
                        className="cursor-pointer rounded-md p-1.5 transition-colors"
                        style={{
                          color: "var(--color-accent)",
                          background: switching === account.id ? "var(--color-bg-elevated)" : "transparent",
                        }}
                        title="Switch to this account"
                        aria-label={`Switch to ${account.label}`}
                      >
                        <CheckCircle size={16} weight="bold" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingId(account.id);
                        setEditLabel(account.label);
                      }}
                      className="text-text-secondary cursor-pointer rounded-md p-1.5 transition-colors"
                      title="Rename"
                      aria-label={`Rename ${account.label}`}
                    >
                      <PencilSimple size={14} weight="bold" />
                    </button>
                    {!account.isActive && (
                      <button
                        onClick={() => void handleDelete(account.id, account.label)}
                        className="cursor-pointer rounded-md p-1.5 transition-colors"
                        style={{ color: "#ef4444" }}
                        title="Delete"
                        aria-label={`Delete ${account.label}`}
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer actions */}
        {list.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="text-text-secondary flex cursor-pointer items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
            >
              <ArrowsClockwise size={12} weight="bold" className={capturing ? "animate-spin" : ""} />
              {capturing ? "Scanning..." : "Re-scan credentials"}
            </button>
            <span className="text-text-muted text-xs">
              {list.length} account{list.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </SettingSection>
    </div>
  );
}
