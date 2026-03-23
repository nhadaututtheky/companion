"use client";

import { useEffect, useCallback, useMemo } from "react";
import { Command } from "cmdk";
import {
  Terminal,
  Plus,
  StopCircle,
  Sun,
  Moon,
  Gear,
  ArrowRight,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);

  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = useMemo(() => Object.values(sessionsMap), [sessionsMap]);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const router = useRouter();

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [setOpen],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  const handleSwitchSession = (id: string) => {
    setActiveSession(id);
    setOpen(false);
    router.push(`/sessions/${id}`);
  };

  const setNewSessionModalOpen = useUiStore((s) => s.setNewSessionModalOpen);
  const setCompareModalOpen = useUiStore((s) => s.setCompareModalOpen);

  const handleNewSession = () => {
    setOpen(false);
    setNewSessionModalOpen(true);
  };

  const handleCompareSessions = () => {
    setOpen(false);
    setCompareModalOpen(true);
  };

  const handleStopSession = async () => {
    if (!activeSessionId) return;
    setOpen(false);
    try {
      await api.sessions.stop(activeSessionId);
    } catch {
      // ignore
    }
  };

  const handleToggleTheme = () => {
    toggleTheme();
    setOpen(false);
  };

  const handleGoSettings = () => {
    setOpen(false);
    router.push("/settings");
  };

  if (!open) return null;

  return (
    <div
      className="command-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          margin: "0 16px",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          label="Command palette"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--color-border)",
              gap: "10px",
            }}
          >
            <Terminal
              size={16}
              color="var(--color-text-muted)"
              aria-hidden="true"
            />
            <Command.Input
              placeholder="Type a command..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "var(--font-body)",
                fontSize: "14px",
                color: "var(--color-text-primary)",
              }}
            />
            <kbd
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--color-text-muted)",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                padding: "2px 6px",
              }}
            >
              ESC
            </kbd>
          </div>

          <Command.List
            style={{
              maxHeight: "360px",
              overflowY: "auto",
              padding: "8px",
            }}
          >
            <Command.Empty
              style={{
                padding: "24px",
                textAlign: "center",
                fontSize: "13px",
                color: "var(--color-text-muted)",
              }}
            >
              No results found.
            </Command.Empty>

            {/* Sessions group */}
            {sessions.length > 0 && (
              <Command.Group
                heading="Switch Session"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "4px 8px 4px",
                }}
              >
                {sessions.map((s) => (
                  <Command.Item
                    key={s.id}
                    value={`session-${s.id}-${s.projectName ?? s.id}`}
                    onSelect={() => handleSwitchSession(s.id)}
                    style={commandItemStyle(s.id === activeSessionId)}
                  >
                    <Terminal size={14} aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.projectName || s.id.slice(0, 8)}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      {s.status}
                    </span>
                    <ArrowRight size={12} aria-hidden="true" style={{ color: "var(--color-text-muted)" }} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions group */}
            <Command.Group
              heading="Actions"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "4px 8px 4px",
              }}
            >
              <Command.Item
                value="new session start"
                onSelect={handleNewSession}
                style={commandItemStyle(false)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>New Session</span>
                <ShortcutBadge keys={["N"]} />
              </Command.Item>

              <Command.Item
                value="stop session kill end"
                onSelect={handleStopSession}
                disabled={!activeSessionId}
                style={commandItemStyle(false, !activeSessionId)}
              >
                <StopCircle size={14} aria-hidden="true" />
                <span>Stop Current Session</span>
              </Command.Item>

              <Command.Item
                value="compare sessions side by side diff"
                onSelect={handleCompareSessions}
                style={commandItemStyle(false)}
              >
                <ArrowsLeftRight size={14} aria-hidden="true" />
                <span>Compare Sessions</span>
              </Command.Item>

              <Command.Item
                value="toggle theme dark light mode"
                onSelect={handleToggleTheme}
                style={commandItemStyle(false)}
              >
                {theme === "light" ? (
                  <Moon size={14} aria-hidden="true" />
                ) : (
                  <Sun size={14} aria-hidden="true" />
                )}
                <span>Toggle Theme ({theme === "light" ? "Light" : "Dark"})</span>
              </Command.Item>

              <Command.Item
                value="settings preferences"
                onSelect={handleGoSettings}
                style={commandItemStyle(false)}
              >
                <Gear size={14} aria-hidden="true" />
                <span>Go to Settings</span>
                <ShortcutBadge keys={[","]} />
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function commandItemStyle(
  active: boolean,
  disabled = false,
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "var(--radius-md)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "14px",
    color: disabled
      ? "var(--color-text-muted)"
      : active
        ? "var(--color-accent)"
        : "var(--color-text-primary)",
    background: active ? "var(--color-bg-hover)" : "transparent",
    opacity: disabled ? 0.5 : 1,
    transition: "background 150ms ease",
    userSelect: "none",
  };
}

function ShortcutBadge({ keys }: { keys: string[] }) {
  return (
    <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
      {keys.map((k) => (
        <kbd
          key={k}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--color-text-muted)",
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            padding: "1px 5px",
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
