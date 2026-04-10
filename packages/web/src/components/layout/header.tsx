"use client";
import { useMemo } from "react";
import { MagnifyingGlass, Gear, List } from "@phosphor-icons/react";
import { TemplateQuickPicker } from "./template-quick-picker";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { CompanionLogo } from "./companion-logo";

export function HeaderStats() {
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

  return (
    <div className="header-stats flex items-center gap-4 px-3">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: activeCount > 0 ? "var(--color-success)" : "var(--color-text-muted)",
          }}
        />
        <span className="text-sm font-semibold tabular-nums">{activeCount}</span>
        <span className="text-xs text-[var(--color-text-muted)]">active</span>
      </div>
      <span className="w-px h-3.5 bg-[var(--color-border)]" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold font-mono tabular-nums text-[var(--color-accent)]">
          ${totalCost < 0.01 && totalCost > 0 ? "<0.01" : totalCost.toFixed(2)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">cost</span>
      </div>
      <span className="w-px h-3.5 bg-[var(--color-border)]" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{totalTurns}</span>
        <span className="text-xs text-[var(--color-text-muted)]">turns</span>
      </div>
    </div>
  );
}

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const activeNavMenu = useUiStore((s) => s.activeNavMenu);
  const toggleNavMenu = useUiStore((s) => s.toggleNavMenu);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);

  const statsBarOpen = useUiStore((s) => s.statsBarOpen);
  const featureGuideOpen = useUiStore((s) => s.featureGuideOpen);
  const setFeatureGuideOpen = useUiStore((s) => s.setFeatureGuideOpen);

  const hasPanelActive = ["search", "files", "browser", "terminal"].includes(rightPanelMode);
  const hasAiActive = ["ai-context", "wiki"].includes(rightPanelMode) || statsBarOpen;

  return (
    <header
      className="flex items-center px-5 gap-3 h-12 relative z-10"
      style={{
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-float)",
        margin: "8px 12px 0 12px",
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        className="md:hidden p-2 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center -ml-1"
        onClick={onMenuToggle}
        aria-label="Open sidebar menu"
      >
        <List size={20} weight="bold" />
      </button>

      {/* Left: Logo */}
      <a href="/" aria-label="Home">
        <CompanionLogo size="sm" />
      </a>

      <div className="flex-1" />

      {/* Center: Search trigger (⌘K) */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer min-h-[44px]"
        style={{
          borderRadius: "var(--radius-md)",
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-muted)",
          border: "1px solid var(--glass-border)",
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
            border: "1px solid var(--glass-border)",
            padding: "1px 5px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ⌘K
        </span>
      </button>

      <div className="flex-1" />

      {/* Right: Nav menu triggers — desktop only */}
      <div className="hidden md:flex items-center gap-1">
        {[
          { id: "panels" as const, label: "Panels", isActive: hasPanelActive },
          { id: "ai" as const, label: "AI", isActive: hasAiActive },
          { id: "layout" as const, label: "View", isActive: false },
        ].map((item) => {
          const isOpen = activeNavMenu === item.id;
          return (
            <button
              key={item.id}
              data-nav-trigger
              onClick={() => toggleNavMenu(item.id)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-all cursor-pointer"
              style={{
                borderRadius: "var(--radius-md)",
                background: isOpen
                  ? "var(--color-text-primary)"
                  : item.isActive
                    ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                    : "transparent",
                color: isOpen
                  ? "var(--color-bg-base)"
                  : item.isActive
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
                border: isOpen ? "1px solid var(--color-text-primary)" : "1px solid transparent",
                fontWeight: isOpen ? 600 : 400,
              }}
              aria-expanded={isOpen}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Right: Standalone actions */}
      <div className="flex items-center gap-1">
        <TemplateQuickPicker />
        <button
          data-guide-trigger
          onClick={() => setFeatureGuideOpen(!featureGuideOpen)}
          className="px-3 py-1.5 text-xs font-medium transition-all cursor-pointer min-h-[44px] flex items-center"
          style={{
            borderRadius: "var(--radius-md)",
            background: featureGuideOpen ? "var(--color-accent)" : "transparent",
            color: featureGuideOpen ? "#fff" : "var(--color-text-secondary)",
            border: featureGuideOpen ? "1px solid var(--color-accent)" : "1px solid transparent",
          }}
          aria-label="Feature Guide"
          title="Feature Guide (Ctrl+/)"
        >
          Guide
        </button>
        <button
          onClick={() => useUiStore.getState().setSettingsModalOpen(true)}
          className="p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          aria-label="Settings"
          title={
            typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
              ? "Settings (⌘,)"
              : "Settings (Ctrl+,)"
          }
        >
          <Gear size={16} weight="bold" />
        </button>
      </div>
    </header>
  );
}
