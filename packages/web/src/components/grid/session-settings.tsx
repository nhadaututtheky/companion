"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Z } from "@/lib/z-index";
import {
  Gear,
  Timer,
  Lightning,
  X,
  TelegramLogo,
  ArrowsClockwise,
  CurrencyDollar,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionSettings {
  idleTimeoutMs: number;
  keepAlive: boolean;
}

type CompactMode = "manual" | "smart" | "aggressive";

interface SessionConfig {
  compactMode: CompactMode;
  compactThreshold: number;
  costBudgetUsd: number | null;
}

interface TimeoutOption {
  label: string;
  value: number;
}

const TIMEOUT_OPTIONS: TimeoutOption[] = [
  { label: "Never", value: 0 },
  { label: "30 min", value: 30 * 60 * 1000 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "4 hours", value: 4 * 60 * 60 * 1000 },
  { label: "12 hours", value: 12 * 60 * 60 * 1000 },
];

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min (matches server default)

// ── Popover ──────────────────────────────────────────────────────────────────

interface SessionSettingsPopoverProps {
  sessionId: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function SessionSettingsPopover({ sessionId, onClose, anchorRef }: SessionSettingsPopoverProps) {
  const [settings, setSettings] = useState<SessionSettings>({
    idleTimeoutMs: DEFAULT_TIMEOUT_MS,
    keepAlive: false,
  });
  const [config, setConfig] = useState<SessionConfig>({
    compactMode: "manual",
    compactThreshold: 75,
    costBudgetUsd: null,
  });
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load current settings
  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on mount
    Promise.all([
      api.sessions.getSettings(sessionId).catch(() => null),
      api.sessions.get(sessionId).catch(() => null),
    ])
      .then(([settingsRes, sessionRes]) => {
        if (settingsRes?.data) {
          setSettings(settingsRes.data);
        }
        if (sessionRes?.data) {
          const s = sessionRes.data as Record<string, unknown>;
          setConfig({
            compactMode: (s.compact_mode as CompactMode) ?? "manual",
            compactThreshold: (s.compact_threshold as number) ?? 75,
            costBudgetUsd: (s.cost_budget_usd as number) ?? null,
          });
          setBudgetInput(s.cost_budget_usd ? String(s.cost_budget_usd) : "");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const applySettings = useCallback(
    async (patch: Partial<SessionSettings>) => {
      setSaving(true);
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        api.sessions
          .updateSettings(sessionId, patch)
          .catch(() => {
            // Revert on error
            setSettings(prev);
          })
          .finally(() => {
            setSaving(false);
          });
        return next;
      });
    },
    [sessionId],
  );

  const handleTimeoutChange = useCallback(
    (value: number) => {
      applySettings({ idleTimeoutMs: value });
    },
    [applySettings],
  );

  const handleKeepAliveToggle = useCallback(() => {
    applySettings({ keepAlive: !settings.keepAlive });
  }, [applySettings, settings.keepAlive]);

  const handleCompactModeChange = useCallback(
    async (mode: CompactMode) => {
      setConfig((prev) => {
        api.sessions.updateConfig(sessionId, { compactMode: mode }).catch(() => {
          setConfig((c) => ({ ...c, compactMode: prev.compactMode }));
        });
        return { ...prev, compactMode: mode };
      });
    },
    [sessionId],
  );

  const handleBudgetSubmit = useCallback(async () => {
    const value = budgetInput.trim() ? parseFloat(budgetInput) : null;
    if (budgetInput.trim() && (isNaN(value!) || value! <= 0)) return;
    setConfig((c) => ({ ...c, costBudgetUsd: value }));
    try {
      await api.sessions.updateConfig(sessionId, { costBudgetUsd: value });
    } catch {
      setConfig((c) => ({ ...c, costBudgetUsd: config.costBudgetUsd }));
    }
  }, [sessionId, budgetInput, config.costBudgetUsd]);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Session settings"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        zIndex: Z.popover,
        width: 260,
        borderRadius: 10,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <span className="text-xs font-semibold uppercase">Session Settings</span>
        <button
          onClick={onClose}
          className="p-0.5 rounded cursor-pointer"
          aria-label="Close settings"
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="px-3 py-4 text-xs">Loading...</div>
      ) : (
        <div className="flex flex-col">
          {/* Idle Timeout */}
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Timer size={12} aria-hidden="true" />
              <span className="text-xs font-semibold">Idle Timeout</span>
              {saving && <span className="ml-auto text-xs">Saving...</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {TIMEOUT_OPTIONS.map((opt) => {
                const active = settings.idleTimeoutMs === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleTimeoutChange(opt.value)}
                    disabled={settings.keepAlive}
                    className="px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: active ? "#4285F4" : "var(--color-bg-elevated)",
                      color: active ? "#fff" : "var(--color-text-secondary)",
                      border: active ? "none" : "1px solid var(--color-border)",
                    }}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stream to Telegram */}
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex items-start gap-2">
              <TelegramLogo
                size={12}
                style={{ color: "#2AABEE", marginTop: 1, flexShrink: 0 }}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold">Stream to Telegram</span>
                <span className="text-xs">
                  Use <code style={{ fontFamily: "var(--font-mono)" }}>/stream</code> in Telegram to
                  attach to this session and see messages in real time.
                </span>
              </div>
            </div>
          </div>

          {/* Keep Alive */}
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <button
              onClick={handleKeepAliveToggle}
              className="w-full flex items-center gap-2 text-left cursor-pointer"
              aria-pressed={settings.keepAlive}
            >
              <div
                className="flex items-center justify-center rounded flex-shrink-0"
                style={{
                  width: 16,
                  height: 16,
                  background: settings.keepAlive ? "#34A853" : "var(--color-bg-elevated)",
                  border: settings.keepAlive ? "none" : "1px solid var(--color-border)",
                  transition: "background 150ms ease",
                }}
              >
                {settings.keepAlive && (
                  <Lightning size={10} weight="fill" color="#fff" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">Keep Alive</span>
                <span className="text-xs">Prevents auto-kill on idle</span>
              </div>
            </button>
          </div>

          {/* Compact Mode */}
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowsClockwise size={12} aria-hidden="true" />
              <span className="text-xs font-semibold">Auto-Compact</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(["manual", "smart", "aggressive"] as CompactMode[]).map((mode) => {
                const active = config.compactMode === mode;
                const labels: Record<CompactMode, string> = {
                  manual: "Manual",
                  smart: "Smart",
                  aggressive: "Aggressive",
                };
                return (
                  <button
                    key={mode}
                    onClick={() => handleCompactModeChange(mode)}
                    className="px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors"
                    style={{
                      background: active ? "#4285F4" : "var(--color-bg-elevated)",
                      color: active ? "#fff" : "var(--color-text-secondary)",
                      border: active ? "none" : "1px solid var(--color-border)",
                    }}
                    aria-pressed={active}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
            <span className="text-xs mt-1 block">
              {config.compactMode === "manual" && "Warn only, you run /compact"}
              {config.compactMode === "smart" &&
                `Handoff at idle when >${config.compactThreshold}%`}
              {config.compactMode === "aggressive" &&
                `Compact immediately at ${config.compactThreshold}%`}
            </span>
          </div>

          {/* Cost Budget */}
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <CurrencyDollar size={12} aria-hidden="true" />
              <span className="text-xs font-semibold">Cost Budget</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs">$</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onBlur={handleBudgetSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBudgetSubmit();
                }}
                placeholder="No limit"
                className="flex-1 text-xs px-2 py-1 rounded bg-transparent input-bordered"
                style={{
                  color: "var(--color-text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
                aria-label="Cost budget in USD"
              />
            </div>
            <span className="text-xs mt-1 block">
              {config.costBudgetUsd
                ? `Warn at $${(config.costBudgetUsd * 0.8).toFixed(2)} and $${config.costBudgetUsd.toFixed(2)}`
                : "No budget set — no warnings"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

interface SessionSettingsButtonProps {
  sessionId: string;
}

export function SessionSettingsButton({ sessionId }: SessionSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex-shrink-0 p-1 rounded-md transition-colors cursor-pointer"
        style={{
          color: open ? "#4285F4" : "var(--color-text-muted)",
          background: open ? "#4285F415" : "transparent",
        }}
        aria-label="Session settings"
        title="Session settings (idle timeout, keep alive)"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Gear size={14} weight={open ? "fill" : "regular"} aria-hidden="true" />
      </button>

      {open && (
        <SessionSettingsPopover
          sessionId={sessionId}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}
