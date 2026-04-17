"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowsLeftRight, CaretDown, CircleNotch, UserCircle } from "@phosphor-icons/react";
import { accounts as accountsApi, type AccountInfo } from "@/lib/api/accounts";
import { useUiStore } from "@/lib/stores/ui-store";

const STATUS_COLORS: Record<string, string> = {
  ready: "#10b981",
  rate_limited: "#f59e0b",
  expired: "#ef4444",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  rate_limited: "Rate limited",
  expired: "Expired",
  error: "Error",
};

/** Refresh interval: long enough to avoid noise, short enough to catch rate-limit cascades. */
const REFRESH_MS = 15_000;

export function AccountIndicator() {
  const [active, setActive] = useState<AccountInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const setSettingsModalOpen = useUiStore((s) => s.setSettingsModalOpen);

  const refresh = useCallback(async () => {
    try {
      const res = await accountsApi.active();
      setActive(res.data);
    } catch {
      // Silent — indicator is non-critical
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSwitchNext = async () => {
    if (switching) return;
    setSwitching(true);
    setMenuOpen(false);
    try {
      const res = await accountsApi.switchNext();
      toast.success(`Switched to ${res.data.label}`);
      await refresh();
    } catch (err) {
      toast.error(`Switch failed: ${String(err)}`);
    } finally {
      setSwitching(false);
    }
  };

  const handleOpenSettings = () => {
    setMenuOpen(false);
    setSettingsModalOpen(true);
  };

  // Nothing to show if no accounts configured
  if (!loaded || !active) return null;

  const statusDot = STATUS_COLORS[active.status] ?? STATUS_COLORS.ready;
  const statusLabel = STATUS_LABELS[active.status] ?? active.status;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="text-text-secondary flex min-h-[44px] max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all"
        style={{
          background: menuOpen ? "var(--color-bg-elevated)" : "transparent",
          border: "1px solid transparent",
        }}
        aria-label={`Active account: ${active.label} (${statusLabel})`}
        aria-expanded={menuOpen}
        title={`${active.label} — ${statusLabel}`}
      >
        {switching ? (
          <CircleNotch size={12} weight="bold" className="animate-spin" />
        ) : (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{
              background: statusDot,
              boxShadow: `0 0 6px ${statusDot}60`,
            }}
          />
        )}
        <span className="truncate">{active.label}</span>
        <CaretDown size={10} weight="bold" className="shrink-0 opacity-60" />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 z-20 mt-1 flex min-w-[220px] flex-col overflow-hidden rounded-lg"
          style={{
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            border: "1px solid var(--glass-border)",
            boxShadow: "var(--shadow-float)",
          }}
          role="menu"
        >
          <div className="flex flex-col gap-0.5 px-3 py-2">
            <span className="text-text-primary text-sm font-semibold">{active.label}</span>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: statusDot }}
              />
              <span className="text-text-muted text-xs">{statusLabel}</span>
              {active.subscriptionType && (
                <span className="text-text-muted text-xs capitalize">
                  · {active.subscriptionType}
                </span>
              )}
            </div>
          </div>
          <div className="h-px" style={{ background: "var(--glass-border)" }} />
          <button
            onClick={() => void handleSwitchNext()}
            disabled={switching}
            className="text-text-primary hover:bg-bg-elevated flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            role="menuitem"
          >
            <ArrowsLeftRight size={12} weight="bold" />
            Switch to next ready
          </button>
          <button
            onClick={handleOpenSettings}
            className="text-text-primary hover:bg-bg-elevated flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium transition-colors"
            role="menuitem"
          >
            <UserCircle size={12} weight="bold" />
            Manage accounts
          </button>
        </div>
      )}
    </div>
  );
}
