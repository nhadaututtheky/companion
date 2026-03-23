"use client";
import { useMemo } from "react";
import { MagnifyingGlass, Moon, Sun, Gear, Terminal, ListBullets, FolderOpen, Globe } from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { CompanionLogo } from "./companion-logo";

function HeaderStats() {
  const sessions = useSessionStore((s) => s.sessions);

  const { activeCount, totalCost, totalTurns } = useMemo(() => {
    const all = Object.values(sessions);
    const active = all.filter((s) =>
      ["starting", "running", "waiting", "idle", "busy"].includes(s.status),
    );
    const cost = active.reduce((sum, s) => sum + (s.state?.total_cost_usd ?? 0), 0);
    const turns = active.reduce((sum, s) => sum + (s.state?.num_turns ?? 0), 0);
    return { activeCount: active.length, totalCost: cost, totalTurns: turns };
  }, [sessions]);

  // Always show stats — even when 0

  return (
    <div className="header-stats flex items-center gap-4 px-3">
      {/* Active sessions */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: activeCount > 0 ? "#34A853" : "#9CA3AF",
            display: "inline-block",
          }}
        />
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {activeCount}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          active
        </span>
      </div>

      {/* Separator */}
      <span style={{ width: 1, height: 14, background: "var(--color-border)" }} />

      {/* Cost */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold font-mono" style={{ color: "#4285F4" }}>
          ${totalCost < 0.01 && totalCost > 0 ? "<0.01" : totalCost.toFixed(2)}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          cost
        </span>
      </div>

      {/* Separator */}
      <span style={{ width: 1, height: 14, background: "var(--color-border)" }} />

      {/* Turns */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {totalTurns}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          turns
        </span>
      </div>
    </div>
  );
}

export function Header() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);

  return (
    <header
      className="flex items-center px-5 py-3 gap-4"
      style={{
        background: "var(--color-bg-card)",
        height: 52,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Left: Logo + Stats */}
      <CompanionLogo size="sm" />
      <HeaderStats />

      {/* Center: push search to middle */}
      <div className="flex-1" />

      {/* Center: Search trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer"
        style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
          minWidth: 200,
        }}
        aria-label="Open command palette"
      >
        <MagnifyingGlass size={14} weight="bold" />
        <span>Search...</span>
        <span
          className="ml-auto text-xs"
          style={{
            background: "var(--color-bg-base)",
            border: "1px solid var(--color-border)",
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          ⌘K
        </span>
      </button>

      <div className="flex-1" />

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "files" ? "none" : "files")}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color: rightPanelMode === "files" ? "var(--color-accent)" : "var(--color-text-muted)",
            background: rightPanelMode === "files" ? "var(--color-accent)" + "15" : "transparent",
          }}
          aria-label="File Explorer"
          title="File Explorer"
        >
          <FolderOpen size={16} weight={rightPanelMode === "files" ? "fill" : "regular"} />
        </button>
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "browser" ? "none" : "browser")}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color: rightPanelMode === "browser" ? "var(--color-accent)" : "var(--color-text-muted)",
            background: rightPanelMode === "browser" ? "var(--color-accent)" + "15" : "transparent",
          }}
          aria-label="Browser Preview"
          title="Browser Preview"
        >
          <Globe size={16} weight={rightPanelMode === "browser" ? "fill" : "regular"} />
        </button>
        <button
          onClick={() => setActivityTerminalOpen(!activityTerminalOpen)}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{
            color: activityTerminalOpen ? "#4285F4" : "var(--color-text-secondary)",
            background: activityTerminalOpen ? "rgba(66,133,244,0.12)" : undefined,
          }}
          aria-label="Toggle activity terminal"
          title="Activity Terminal (Ctrl+`)"
        >
          <Terminal size={16} weight={activityTerminalOpen ? "fill" : "bold"} />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
        </button>
        <a
          href="/templates"
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Templates"
        >
          <ListBullets size={16} weight="bold" />
        </a>
        <a
          href="/settings"
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--color-text-secondary)" }}
          aria-label="Settings"
        >
          <Gear size={16} weight="bold" />
        </a>
      </div>
    </header>
  );
}
