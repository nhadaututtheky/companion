"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Gear, Timer, Lightning, X, TelegramLogo } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionSettings {
  idleTimeoutMs: number;
  keepAlive: boolean;
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

function SessionSettingsPopover({
  sessionId,
  onClose,
  anchorRef,
}: SessionSettingsPopoverProps) {
  const [settings, setSettings] = useState<SessionSettings>({
    idleTimeoutMs: DEFAULT_TIMEOUT_MS,
    keepAlive: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load current settings
  useEffect(() => {
    api.sessions
      .getSettings(sessionId)
      .then((res) => {
        setSettings(res.data);
      })
      .catch(() => {
        // Use defaults if not available
      })
      .finally(() => setLoading(false));
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
      const next = { ...settings, ...patch };
      setSettings(next);
      setSaving(true);
      try {
        await api.sessions.updateSettings(sessionId, patch);
      } catch {
        // Revert on error
        setSettings(settings);
      } finally {
        setSaving(false);
      }
    },
    [sessionId, settings],
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

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Session settings"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        zIndex: 50,
        width: 240,
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
        <span
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--color-text-muted)" }}
        >
          Session Settings
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close settings"
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="px-3 py-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Loading...
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Idle Timeout */}
          <div
            className="px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Timer size={12} style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                Idle Timeout
              </span>
              {saving && (
                <span className="ml-auto text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Saving...
                </span>
              )}
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
          <div
            className="px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <div className="flex items-start gap-2">
              <TelegramLogo
                size={12}
                style={{ color: "#2AABEE", marginTop: 1, flexShrink: 0 }}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Stream to Telegram
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Use <code style={{ fontFamily: "var(--font-mono)" }}>/stream</code> in Telegram to attach to this session and see messages in real time.
                </span>
              </div>
            </div>
          </div>

          {/* Keep Alive */}
          <div className="px-3 py-2.5">
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
                <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Keep Alive
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Prevents auto-kill on idle
                </span>
              </div>
            </button>
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
