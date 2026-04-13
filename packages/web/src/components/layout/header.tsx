"use client";
import { MagnifyingGlass, Gear, List, Timer } from "@phosphor-icons/react";
import { TemplateQuickPicker } from "./template-quick-picker";
import { useUiStore } from "@/lib/stores/ui-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useShallow } from "zustand/react/shallow";
import { CompanionLogo } from "./companion-logo";

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

export function HeaderStats() {
  const { activeCount, totalCost, totalTurns } = useSessionStore(
    useShallow((s) => {
      let activeCount = 0;
      let totalCost = 0;
      let totalTurns = 0;
      for (const sess of Object.values(s.sessions)) {
        if (ACTIVE_STATUSES.has(sess.status)) {
          activeCount++;
          totalCost += sess.state?.total_cost_usd ?? 0;
          totalTurns += sess.state?.num_turns ?? 0;
        }
      }
      return { activeCount, totalCost: Math.round(totalCost * 100) / 100, totalTurns };
    }),
  );

  return (
    <div className="header-stats flex items-center gap-4 px-3">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: activeCount > 0 ? "var(--color-success)" : "var(--color-text-muted)",
          }}
        />
        <span className="text-sm font-semibold tabular-nums">{activeCount}</span>
        <span className="text-xs text-[var(--color-text-muted)]">active</span>
      </div>
      <span className="h-3.5 w-px bg-[var(--color-border)]" />
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--color-accent)]">
          ${totalCost < 0.01 && totalCost > 0 ? "<0.01" : totalCost.toFixed(2)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">cost</span>
      </div>
      <span className="h-3.5 w-px bg-[var(--color-border)]" />
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
      className="rounded-xl shadow-soft relative z-10 flex h-12 items-center gap-3 px-5"
      style={{
        background: "var(--glass-bg-heavy)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        margin: "8px 12px 0 12px",
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        className="-ml-1 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg p-2 md:hidden"
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
        className="text-text-muted bg-bg-elevated rounded-md shadow-soft flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors"
        style={{
          minWidth: 44,
        }}
        aria-label="Open command palette"
      >
        <MagnifyingGlass size={14} weight="bold" />
        <span className="hidden sm:inline">Search...</span>
        <span
          className="bg-bg-base rounded-sm shadow-soft ml-auto hidden text-xs sm:inline"
          style={{
            padding: "1px 5px",
          }}
        >
          ⌘K
        </span>
      </button>

      <div className="flex-1" />

      {/* Right: Nav menu triggers — desktop only */}
      <div className="hidden items-center gap-1 md:flex">
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
              className="rounded-md flex cursor-pointer items-center gap-1 px-3 py-1.5 text-xs font-medium transition-all"
              style={{
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
          onClick={() => useUiStore.getState().setSchedulesModalOpen(true)}
          className="text-text-secondary rounded-md flex min-h-[44px] cursor-pointer items-center gap-1 px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            background: "transparent",
            border: "1px solid transparent",
          }}
          aria-label="Schedules"
          title="Scheduled Sessions"
        >
          <Timer size={14} weight="bold" />
          <span className="hidden sm:inline">Schedule</span>
        </button>
        <button
          data-guide-trigger
          onClick={() => setFeatureGuideOpen(!featureGuideOpen)}
          className="rounded-md flex min-h-[44px] cursor-pointer items-center px-3 py-1.5 text-xs font-medium transition-all"
          style={{
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
          className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg p-2 transition-colors"
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
