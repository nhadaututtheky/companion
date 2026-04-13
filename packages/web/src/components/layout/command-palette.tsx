"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { Z } from "@/lib/z-index";
import { Command } from "cmdk";
import {
  Terminal,
  Plus,
  StopCircle,
  Sun,
  Moon,
  Gear,
  ArrowRight,
  FolderOpen,
  MagnifyingGlass,
  TerminalWindow,
  Globe,
  Folder,
  ListBullets,
  House,
  ClockCounterClockwise,
  Timer,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { api } from "@/lib/api-client";
import { BUILTIN_THEMES } from "@companion/shared";
import { applyTheme, clearThemeOverrides, getStoredThemeId } from "@/lib/theme-provider";

// ── Recent actions helpers ────────────────────────────────────────────────────

const RECENT_ACTIONS_KEY = "companion_recent_actions";

function getRecentActions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_ACTIONS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function addRecentAction(label: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentActions();
    const updated = [label, ...existing.filter((a) => a !== label)].slice(0, 5);
    localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);
  const setNewSessionModalOpen = useUiStore((s) => s.setNewSessionModalOpen);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);

  const sessionsMap = useSessionStore((s) => s.sessions);
  const sessions = useMemo(() => Object.values(sessionsMap), [sessionsMap]);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const router = useRouter();

  // Track recent actions — refresh when palette opens
  const [recentActions, setRecentActions] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setRecentActions(getRecentActions()); // eslint-disable-line react-hooks/set-state-in-effect -- refresh on open
    }
  }, [open]);

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

  // ── Action helpers ──────────────────────────────────────────────────────────

  const close = useCallback(
    (label?: string) => {
      if (label) addRecentAction(label);
      setOpen(false);
    },
    [setOpen],
  );

  const handleSwitchSession = (id: string, name: string) => {
    setActiveSession(id);
    close(`Switch to: ${name}`);
    router.push(`/sessions/${id}`);
  };

  const handleNewSession = () => {
    close("New Session");
    setNewSessionModalOpen(true);
  };

  const handleStopAllSessions = async () => {
    close("Stop All Sessions");
    const running = sessions.filter((s) => ["running", "waiting", "idle"].includes(s.status));
    await Promise.allSettled(running.map((s) => api.sessions.stop(s.id)));
  };

  const handleToggleTheme = () => {
    const label = `Toggle Theme (${theme === "light" ? "→ Dark" : "→ Light"})`;
    close(label);
    toggleTheme();
  };

  const handleSelectTheme = (themeId: string, themeName: string) => {
    applyTheme(themeId, theme === "dark");
    close(`Theme: ${themeName}`);
  };

  const handleGoSettings = () => {
    close("Go to Settings");
    router.push("/settings");
  };

  const handleGoDashboard = () => {
    close("Go to Dashboard");
    router.push("/");
  };

  const handleGoProjects = () => {
    close("Go to Projects");
    router.push("/projects");
  };

  const handleGoTemplates = () => {
    close("Go to Templates");
    router.push("/templates");
  };

  const handleGoSchedules = () => {
    close("Go to Schedules");
    useUiStore.getState().setSchedulesModalOpen(true);
  };

  const handleTogglePanel = (mode: "files" | "search" | "terminal" | "browser", label: string) => {
    close(label);
    setRightPanelMode(rightPanelMode === mode ? "none" : mode);
  };

  const handleToggleActivity = () => {
    close("Toggle Activity Terminal");
    setActivityTerminalOpen(!activityTerminalOpen);
  };

  const handleRecentAction = (label: string) => {
    // Re-run the matching action by dispatching synthetic click to item
    // For simplicity: just close and add it back as most-recent
    close(label);
  };

  // ── All registered actions for lookup ──────────────────────────────────────
  const ACTION_HANDLERS: Record<string, () => void> = {
    "New Session": handleNewSession,
    "Stop All Sessions": handleStopAllSessions,
    "Toggle Theme (→ Dark)": handleToggleTheme,
    "Toggle Theme (→ Light)": handleToggleTheme,
    ...Object.fromEntries(
      BUILTIN_THEMES.map((t) => [`Theme: ${t.name}`, () => handleSelectTheme(t.id, t.name)]),
    ),
    "Go to Settings": handleGoSettings,
    "Go to Dashboard": handleGoDashboard,
    "Go to Projects": handleGoProjects,
    "Go to Templates": handleGoTemplates,
    "Go to Schedules": handleGoSchedules,
    "Toggle File Explorer": () => handleTogglePanel("files", "Toggle File Explorer"),
    "Toggle Search": () => handleTogglePanel("search", "Toggle Search"),
    "Toggle Terminal": () => handleTogglePanel("terminal", "Toggle Terminal"),
    "Toggle Browser Preview": () => handleTogglePanel("browser", "Toggle Browser Preview"),
    "Toggle Activity Terminal": handleToggleActivity,
  };

  if (!open) return null;

  const activeSessions = sessions.filter((s) => ["running", "waiting", "idle"].includes(s.status));

  return (
    <div
      className="command-palette-overlay flex"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.commandPalette,
        background: "rgba(0, 0, 0, 0.4)",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        backdropFilter: "blur(var(--glass-blur-sm))",
      }}
    >
      <div
        className="shadow-soft overflow-hidden rounded-xl"
        style={{
          width: "100%",
          maxWidth: "560px",
          margin: "0 16px",
          background: "var(--glass-bg-heavy)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          boxShadow: "var(--shadow-float)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" style={{ fontFamily: "var(--font-body)" }}>
          {/* Search input row */}
          <div
            className="flex"
            style={{
              alignItems: "center",
              padding: "12px 16px",
              boxShadow: "0 1px 0 var(--glass-border)",
              gap: "10px",
            }}
          >
            <Terminal size={16} color="var(--color-text-muted)" aria-hidden="true" />
            <Command.Input
              placeholder="Type a command..."
              className="text-text-primary"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "var(--font-body)",
                fontSize: "14px",
              }}
            />
            <kbd
              className="text-text-muted bg-bg-elevated rounded-sm font-mono"
              style={{
                fontSize: "11px",
                padding: "2px 6px",
              }}
            >
              ESC
            </kbd>
          </div>

          <Command.List
            style={{
              maxHeight: "400px",
              overflowY: "auto",
              padding: "8px",
            }}
          >
            <Command.Empty
              className="text-text-muted text-center"
              style={{
                padding: "24px",
                fontSize: "13px",
              }}
            >
              No results found.
            </Command.Empty>

            {/* Recent actions — only when not searching */}
            {recentActions.length > 0 && (
              <Command.Group heading="Recent" style={groupHeadingStyle}>
                {recentActions.map((label) => (
                  <Command.Item
                    key={label}
                    value={`recent-${label}`}
                    onSelect={() => {
                      const handler = ACTION_HANDLERS[label];
                      if (handler) {
                        handler();
                      } else {
                        handleRecentAction(label);
                      }
                    }}
                    style={commandItemStyle(false)}
                  >
                    <div style={itemInnerStyle}>
                      <ClockCounterClockwise size={14} aria-hidden="true" />
                      <span style={labelStyle}>{label}</span>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Sessions group */}
            <Command.Group heading="Sessions" style={groupHeadingStyle}>
              <Command.Item
                value="new session start create"
                onSelect={handleNewSession}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <Plus size={14} aria-hidden="true" />
                  <span style={labelStyle}>New Session</span>
                </div>
                <ShortcutBadge keys={["N"]} />
              </Command.Item>

              {activeSessions.length > 0 && (
                <Command.Item
                  value="stop all sessions kill end terminate"
                  onSelect={handleStopAllSessions}
                  style={commandItemStyle(false)}
                >
                  <div style={itemInnerStyle}>
                    <StopCircle size={14} aria-hidden="true" />
                    <span style={labelStyle}>Stop All Sessions</span>
                  </div>
                  <span style={metaStyle}>{activeSessions.length} active</span>
                </Command.Item>
              )}

              {sessions.map((s) => {
                const name = s.projectName || s.id.slice(0, 8);
                return (
                  <Command.Item
                    key={s.id}
                    value={`switch session ${name} ${s.id} ${s.status}`}
                    onSelect={() => handleSwitchSession(s.id, name)}
                    style={commandItemStyle(s.id === activeSessionId)}
                  >
                    <div style={itemInnerStyle}>
                      <ArrowRight size={14} aria-hidden="true" />
                      <span style={labelStyle}>Switch to: {name}</span>
                    </div>
                    <span style={metaStyle}>{s.model.split("-").slice(-1)[0]}</span>
                    <span
                      className="font-semibold"
                      style={{
                        ...metaStyle,
                        color: statusColor(s.status),
                      }}
                    >
                      {s.status}
                    </span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Panels group */}
            <Command.Group heading="Panels" style={groupHeadingStyle}>
              <Command.Item
                value="toggle file explorer files sidebar"
                onSelect={() => handleTogglePanel("files", "Toggle File Explorer")}
                style={commandItemStyle(rightPanelMode === "files")}
              >
                <div style={itemInnerStyle}>
                  <FolderOpen size={14} aria-hidden="true" />
                  <span style={labelStyle}>Toggle File Explorer</span>
                </div>
                <ActiveBadge active={rightPanelMode === "files"} />
              </Command.Item>

              <Command.Item
                value="toggle search find in files"
                onSelect={() => handleTogglePanel("search", "Toggle Search")}
                style={commandItemStyle(rightPanelMode === "search")}
              >
                <div style={itemInnerStyle}>
                  <MagnifyingGlass size={14} aria-hidden="true" />
                  <span style={labelStyle}>Toggle Search</span>
                </div>
                <ShortcutBadge keys={["Ctrl", "Shift", "F"]} />
                <ActiveBadge active={rightPanelMode === "search"} />
              </Command.Item>

              <Command.Item
                value="toggle terminal panel shell"
                onSelect={() => handleTogglePanel("terminal", "Toggle Terminal")}
                style={commandItemStyle(rightPanelMode === "terminal")}
              >
                <div style={itemInnerStyle}>
                  <TerminalWindow size={14} aria-hidden="true" />
                  <span style={labelStyle}>Toggle Terminal</span>
                </div>
                <ActiveBadge active={rightPanelMode === "terminal"} />
              </Command.Item>

              <Command.Item
                value="toggle browser preview web"
                onSelect={() => handleTogglePanel("browser", "Toggle Browser Preview")}
                style={commandItemStyle(rightPanelMode === "browser")}
              >
                <div style={itemInnerStyle}>
                  <Globe size={14} aria-hidden="true" />
                  <span style={labelStyle}>Toggle Browser Preview</span>
                </div>
                <ActiveBadge active={rightPanelMode === "browser"} />
              </Command.Item>

              <Command.Item
                value="toggle activity terminal log output"
                onSelect={handleToggleActivity}
                style={commandItemStyle(activityTerminalOpen)}
              >
                <div style={itemInnerStyle}>
                  <Terminal size={14} aria-hidden="true" />
                  <span style={labelStyle}>Toggle Activity</span>
                </div>
                <ShortcutBadge keys={["Ctrl", "`"]} />
                <ActiveBadge active={activityTerminalOpen} />
              </Command.Item>
            </Command.Group>

            {/* Navigation group */}
            <Command.Group heading="Navigation" style={groupHeadingStyle}>
              <Command.Item
                value="go to dashboard home"
                onSelect={handleGoDashboard}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <House size={14} aria-hidden="true" />
                  <span style={labelStyle}>Go to Dashboard</span>
                </div>
              </Command.Item>

              <Command.Item
                value="go to settings preferences"
                onSelect={handleGoSettings}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <Gear size={14} aria-hidden="true" />
                  <span style={labelStyle}>Go to Settings</span>
                </div>
                <ShortcutBadge keys={[","]} />
              </Command.Item>

              <Command.Item
                value="go to projects list"
                onSelect={handleGoProjects}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <Folder size={14} aria-hidden="true" />
                  <span style={labelStyle}>Go to Projects</span>
                </div>
              </Command.Item>

              <Command.Item
                value="go to templates starters"
                onSelect={handleGoTemplates}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <ListBullets size={14} aria-hidden="true" />
                  <span style={labelStyle}>Go to Templates</span>
                </div>
              </Command.Item>

              <Command.Item
                value="go to schedules scheduled sessions cron"
                onSelect={handleGoSchedules}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <Timer size={14} aria-hidden="true" />
                  <span style={labelStyle}>Go to Schedules</span>
                </div>
              </Command.Item>
            </Command.Group>

            {/* Theme group */}
            <Command.Group heading="Theme" style={groupHeadingStyle}>
              <Command.Item
                value="toggle theme dark light mode appearance"
                onSelect={handleToggleTheme}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  {theme === "light" ? (
                    <Moon size={14} aria-hidden="true" />
                  ) : (
                    <Sun size={14} aria-hidden="true" />
                  )}
                  <span style={labelStyle}>
                    {theme === "light" ? "Switch to Dark" : "Switch to Light"}
                  </span>
                </div>
              </Command.Item>

              {BUILTIN_THEMES.map((t) => {
                const colors = theme === "dark" ? t.dark : t.light;
                const isActive = getStoredThemeId() === t.id;
                return (
                  <Command.Item
                    key={t.id}
                    value={`theme ${t.name} ${t.id} ${t.author ?? ""} color scheme`}
                    onSelect={() => handleSelectTheme(t.id, t.name)}
                    style={commandItemStyle(isActive)}
                  >
                    <div style={itemInnerStyle}>
                      <span
                        aria-hidden="true"
                        className="flex shrink-0"
                        style={{
                          gap: "2px",
                        }}
                      >
                        {[colors.bgBase, colors.accent, colors.success, colors.danger].map(
                          (c, i) => (
                            <span
                              key={i}
                              className="border-border rounded-full"
                              style={{
                                width: 8,
                                height: 8,
                                background: c,
                              }}
                            />
                          ),
                        )}
                      </span>
                      <span style={labelStyle}>{t.name}</span>
                      {t.author && <span style={{ ...metaStyle, marginLeft: 4 }}>{t.author}</span>}
                    </div>
                    {isActive && <ActiveBadge active />}
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Actions group */}
            <Command.Group heading="Actions" style={groupHeadingStyle}>
              <Command.Item
                value="search in files find text"
                onSelect={() => handleTogglePanel("search", "Toggle Search")}
                style={commandItemStyle(false)}
              >
                <div style={itemInnerStyle}>
                  <MagnifyingGlass size={14} aria-hidden="true" />
                  <span style={labelStyle}>Search in Files</span>
                </div>
                <ShortcutBadge keys={["Ctrl", "Shift", "F"]} />
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const groupHeadingStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "4px 8px 4px",
};

const itemInnerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flex: 1,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  color: "var(--color-text-muted)",
  flexShrink: 0,
};

function commandItemStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
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

function statusColor(status: string): string {
  switch (status) {
    case "running":
      return "var(--color-success, #10b981)";
    case "waiting":
      return "var(--color-warning, #f59e0b)";
    case "idle":
      return "var(--color-text-muted)";
    default:
      return "var(--color-text-muted)";
  }
}

function ShortcutBadge({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0" style={{ gap: "3px" }}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="text-text-muted bg-bg-base rounded-sm font-mono"
          style={{
            fontSize: "10px",
            padding: "1px 5px",
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      className="text-accent shrink-0 rounded-full font-semibold"
      style={{
        fontSize: "10px",
        background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
        padding: "1px 6px",
      }}
    >
      ON
    </span>
  );
}
