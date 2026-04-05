"use client";
import { useMemo } from "react";
import {
  MagnifyingGlass,
  Moon,
  Sun,
  Gear,
  Terminal,
  FolderOpen,
  Globe,
  TerminalWindow,
  List,
  ChartBar,
  Brain,
} from "@phosphor-icons/react";
import { TemplateQuickPicker } from "./template-quick-picker";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { CompanionLogo } from "./companion-logo";
import { LayoutSelector } from "./layout-selector";

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
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: activeCount > 0 ? "var(--color-success)" : "var(--color-text-muted)" }}
        />
        <span className="text-sm font-semibold tabular-nums">
          {activeCount}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          active
        </span>
      </div>

      {/* Separator */}
      <span className="w-px h-3.5 bg-[var(--color-border)]" />

      {/* Cost */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold font-mono tabular-nums text-[var(--color-accent)]">
          ${totalCost < 0.01 && totalCost > 0 ? "<0.01" : totalCost.toFixed(2)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          cost
        </span>
      </div>

      {/* Separator */}
      <span className="w-px h-3.5 bg-[var(--color-border)]" />

      {/* Turns */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">
          {totalTurns}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          turns
        </span>
      </div>
    </div>
  );
}

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);

  return (
    <header
      className="flex items-center px-5 gap-4 h-12 relative z-10 bg-[var(--color-bg-card)]"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Hamburger — mobile only */}
      <button
        className="md:hidden p-2 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1"
       
        onClick={onMenuToggle}
        aria-label="Open sidebar menu"
      >
        <List size={20} weight="bold" />
      </button>

      {/* Left: Logo + Stats */}
      <a href="/" aria-label="Home">
        <CompanionLogo size="sm" />
      </a>
      <div className="hidden sm:block">
        <HeaderStats />
      </div>

      {/* Center: push search to middle */}
      <div className="flex-1" />

      {/* Center: Search trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer min-h-[44px]"
        style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-muted)",
          border: "1px solid var(--color-border)",
          minWidth: 44,
        }}
        aria-label="Open command palette"
      >
        <MagnifyingGlass size={14} weight="bold" />
        <span className="hidden sm:inline">Search...</span>
        <span
          className="ml-auto text-xs hidden sm:inline"
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
        {/* Panel toggles — desktop only */}
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "search" ? "none" : "search")}
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color: rightPanelMode === "search" ? "var(--color-accent)" : "var(--color-text-muted)",
            background: rightPanelMode === "search" ? "var(--color-accent)" + "15" : "transparent",
          }}
          aria-label="Search in files"
          title="Search in Files (Ctrl+Shift+F)"
        >
          <MagnifyingGlass size={16} weight={rightPanelMode === "search" ? "fill" : "regular"} />
        </button>
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "files" ? "none" : "files")}
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
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
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
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
          onClick={() => setRightPanelMode(rightPanelMode === "terminal" ? "none" : "terminal")}
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color:
              rightPanelMode === "terminal" ? "var(--color-accent)" : "var(--color-text-muted)",
            background:
              rightPanelMode === "terminal" ? "var(--color-accent)" + "15" : "transparent",
          }}
          aria-label="Terminal"
          title="Terminal"
        >
          <TerminalWindow size={16} weight={rightPanelMode === "terminal" ? "fill" : "regular"} />
        </button>
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "stats" ? "none" : "stats")}
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color: rightPanelMode === "stats" ? "var(--color-accent)" : "var(--color-text-muted)",
            background: rightPanelMode === "stats" ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "transparent",
          }}
          aria-label="Activity stats"
          title="Activity Stats"
        >
          <ChartBar size={16} weight={rightPanelMode === "stats" ? "fill" : "regular"} />
        </button>
        <button
          onClick={() => setRightPanelMode(rightPanelMode === "ai-context" ? "none" : "ai-context")}
          className="hidden md:flex p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{
            color: rightPanelMode === "ai-context" ? "var(--color-purple)" : "var(--color-text-muted)",
            background: rightPanelMode === "ai-context" ? "color-mix(in srgb, var(--color-purple) 8%, transparent)" : "transparent",
          }}
          aria-label="AI Context panel"
          title="AI Context — Code intelligence & web docs"
        >
          <Brain size={16} weight={rightPanelMode === "ai-context" ? "fill" : "regular"} />
        </button>
        {/* Layout selector — switch between single, split, grid */}
        <div className="hidden md:flex">
          <LayoutSelector />
        </div>
        <button
          onClick={() => setActivityTerminalOpen(!activityTerminalOpen)}
          className="hidden md:flex p-2 rounded-lg transition-colors cursor-pointer"
          style={{
            color: activityTerminalOpen ? "var(--color-accent)" : "var(--color-text-secondary)",
            background: activityTerminalOpen ? "rgba(66,133,244,0.12)" : undefined,
          }}
          aria-label="Toggle activity terminal"
          title="Activity Terminal (Ctrl+`)"
        >
          <Terminal size={16} weight={activityTerminalOpen ? "fill" : "bold"} />
        </button>
        {/* Theme toggle — always visible */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
         
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}
        </button>
        {/* Quick start from template */}
        <TemplateQuickPicker />
        <button
          onClick={() => useUiStore.getState().setSettingsModalOpen(true)}
          className="p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          aria-label="Settings"
          title={typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "Settings (⌘,)" : "Settings (Ctrl+,)"}
        >
          <Gear size={16} weight="bold" />
        </button>
      </div>
    </header>
  );
}
