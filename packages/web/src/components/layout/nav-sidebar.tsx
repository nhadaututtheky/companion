"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Z } from "@/lib/z-index";
import {
  MagnifyingGlass,
  FolderOpen,
  Globe,
  TerminalWindow,
  Brain,
  BookOpen,
  ChartBar,
  Square,
  Columns,
  Rows,
  GridFour,
  Terminal,
  Check,
  Moon,
  Sun,
  CircleHalf,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { useLayoutStore, type LayoutMode, BUILT_IN_PRESETS } from "@/lib/stores/layout-store";
import { BUILTIN_THEMES } from "@companion/shared";
import { applyTheme, getStoredThemeId } from "@/lib/theme-provider";

// ── Data ──────────────────────────────────────────────────────────────────

type PanelMode = "search" | "files" | "browser" | "terminal";
type AiPanelMode = "ai-context" | "wiki" | "stats";

interface NavItem {
  id: string;
  label: string;
  icon: typeof MagnifyingGlass;
  description: string;
  shortcut?: string;
}

const PANEL_ITEMS: NavItem[] = [
  {
    id: "search",
    label: "Search",
    icon: MagnifyingGlass,
    description: "Search across files in the current project",
    shortcut: "Ctrl+Shift+F",
  },
  {
    id: "files",
    label: "Files",
    icon: FolderOpen,
    description: "Browse and navigate project file tree",
  },
  {
    id: "browser",
    label: "Browser",
    icon: Globe,
    description: "Preview web pages and browser output",
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: TerminalWindow,
    description: "Interactive terminal for command execution",
  },
];

const AI_ITEMS: NavItem[] = [
  {
    id: "workspace",
    label: "Workspace",
    icon: GridFour,
    description: "Multi-CLI workspace dashboard — agents, costs, and activity",
  },
  {
    id: "ai-context",
    label: "AI Context",
    icon: Brain,
    description: "Code intelligence, web docs, and context graph for AI agents",
  },
  {
    id: "wiki",
    label: "Wiki KB",
    icon: BookOpen,
    description: "Domain knowledge base — feeds context to AI agents automatically",
  },
  {
    id: "stats",
    label: "Stats",
    icon: ChartBar,
    description: "Activity statistics, session metrics, and cost tracking",
  },
];

const LAYOUT_ITEMS: Array<NavItem & { mode: LayoutMode }> = [
  {
    id: "single",
    mode: "single",
    label: "Single",
    icon: Square,
    description: "One session fills the entire workspace",
  },
  {
    id: "side-by-side",
    mode: "side-by-side",
    label: "Side by Side",
    icon: Columns,
    description: "Two sessions displayed in horizontal columns",
  },
  {
    id: "stacked",
    mode: "stacked",
    label: "Stacked",
    icon: Rows,
    description: "Sessions stacked vertically in rows",
  },
  {
    id: "grid",
    mode: "grid",
    label: "Grid",
    icon: GridFour,
    description: "Multiple sessions in a responsive grid layout",
  },
];

// ── Glass Pill ────────────────────────────────────────────────────────────

function NavPill({
  icon,
  label,
  isActive,
  index,
  onClick,
  onHover,
  onLeave,
}: {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  index: number;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-4 py-2.5 text-xs font-medium transition-all"
      style={{
        background: isActive ? "var(--color-text-primary)" : "var(--glass-bg)",
        backdropFilter: isActive ? "none" : "blur(var(--glass-blur))",
        WebkitBackdropFilter: isActive ? "none" : "blur(var(--glass-blur))",
        border: isActive ? "1px solid var(--color-text-primary)" : "1px solid var(--glass-border)",
        color: isActive ? "var(--color-bg-base)" : "var(--color-text-secondary)",
        boxShadow: isActive ? "var(--shadow-float)" : "var(--shadow-soft)",
        fontWeight: isActive ? 600 : 400,
        minWidth: 140,
        animation: `navPillStaggerIn 250ms ease-out ${index * 60}ms both`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Glass Detail Card ─────────────────────────────────────────────────────

function DetailCard({ children, index }: { children: ReactNode; index: number }) {
  return (
    <div
      className="shadow-soft shrink-0 rounded-xl"
      style={{
        width: 240,
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        padding: 16,
        animation: `navPillStaggerIn 250ms ease-out ${index * 60}ms both`,
      }}
    >
      {children}
    </div>
  );
}

// ── Panels Content ────────────────────────────────────────────────────────

function PanelsContent() {
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const [hovered, setHovered] = useState<string | null>(null);

  const active =
    PANEL_ITEMS.find((p) => p.id === hovered) ?? PANEL_ITEMS.find((p) => p.id === rightPanelMode);

  return (
    <div className="flex items-start gap-2">
      {/* Left: individual glass pills */}
      <div className="flex flex-col gap-1.5">
        {PANEL_ITEMS.map((item, i) => (
          <NavPill
            key={item.id}
            icon={<item.icon size={14} weight={rightPanelMode === item.id ? "fill" : "regular"} />}
            label={item.label}
            isActive={rightPanelMode === item.id}
            index={i}
            onClick={() =>
              setRightPanelMode(rightPanelMode === item.id ? "none" : (item.id as PanelMode))
            }
            onHover={() => setHovered(item.id)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
      {/* Right: glass detail card */}
      {active && (
        <DetailCard index={PANEL_ITEMS.length}>
          <div className="mb-3 flex items-center gap-2">
            <active.icon
              size={16}
              weight={rightPanelMode === active.id ? "fill" : "regular"}
              style={{
                color:
                  rightPanelMode === active.id
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
              }}
            />
            <span className="text-text-primary text-sm font-semibold">{active.label}</span>
            {rightPanelMode === active.id && (
              <span
                className="text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                }}
              >
                <Check size={10} weight="bold" /> Active
              </span>
            )}
          </div>
          <p className="text-text-muted text-xs leading-relaxed">{active.description}</p>
          {active.shortcut && (
            <span className="text-text-muted bg-bg-elevated mt-3 inline-block rounded-sm px-2 py-1 font-mono text-xs">
              {active.shortcut}
            </span>
          )}
        </DetailCard>
      )}
    </div>
  );
}

// ── AI Content ────────────────────────────────────────────────────────────

function AIContent() {
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const statsBarOpen = useUiStore((s) => s.statsBarOpen);
  const setStatsBarOpen = useUiStore((s) => s.setStatsBarOpen);
  const [hovered, setHovered] = useState<string | null>(null);

  const isItemActive = (id: string) => (id === "stats" ? statsBarOpen : rightPanelMode === id);

  const handleClick = (id: string) => {
    if (id === "stats") {
      setStatsBarOpen(!statsBarOpen);
    } else {
      setRightPanelMode(rightPanelMode === id ? "none" : (id as AiPanelMode));
    }
  };

  const active = AI_ITEMS.find((p) => p.id === hovered) ?? AI_ITEMS.find((p) => isItemActive(p.id));

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-col gap-1.5">
        {AI_ITEMS.map((item, i) => (
          <NavPill
            key={item.id}
            icon={<item.icon size={14} weight={isItemActive(item.id) ? "fill" : "regular"} />}
            label={item.label}
            isActive={isItemActive(item.id)}
            index={i}
            onClick={() => handleClick(item.id)}
            onHover={() => setHovered(item.id)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
      {active && (
        <DetailCard index={AI_ITEMS.length}>
          <div className="mb-3 flex items-center gap-2">
            <active.icon
              size={16}
              weight={isItemActive(active.id) ? "fill" : "regular"}
              className="text-accent"
            />
            <span className="text-text-primary text-sm font-semibold">{active.label}</span>
            {isItemActive(active.id) && (
              <span
                className="text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                }}
              >
                <Check size={10} weight="bold" /> Active
              </span>
            )}
          </div>
          <p className="text-text-muted text-xs leading-relaxed">{active.description}</p>
        </DetailCard>
      )}
    </div>
  );
}

// ── Layout Content ────────────────────────────────────────────────────────

function LayoutContent() {
  const mode = useLayoutStore((s) => s.mode);
  const setMode = useLayoutStore((s) => s.setMode);
  const applyPreset = useLayoutStore((s) => s.applyPreset);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
  const uiTheme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const monochrome = useUiStore((s) => s.monochrome);
  const toggleMonochrome = useUiStore((s) => s.toggleMonochrome);

  const [activeThemeId, setActiveThemeId] = useState(() => getStoredThemeId());
  const [themeMode, setThemeMode] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("companion_theme_mode");
    if (stored === "light") return "light";
    return "dark";
  });

  const resolvedDark = themeMode === "dark";

  const handleToggleMode = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    localStorage.setItem("companion_theme_mode", next);
    setTheme(next);
    applyTheme(activeThemeId, next === "dark");
  };

  const handleSelectTheme = (id: string) => {
    setActiveThemeId(id);
    applyTheme(id, resolvedDark);
  };

  return (
    <div
      className="shadow-soft rounded-xl"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        padding: 16,
        width: 480,
        animation: "navPillStaggerIn 200ms ease-out both",
      }}
    >
      {/* Top row: Layout (left) + Mode (right) */}
      <div className="mb-4 flex gap-4">
        {/* Layout presets */}
        <div className="flex-1">
          <span className="text-text-muted mb-2 block text-[10px] font-semibold uppercase tracking-wider">
            Layout
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {LAYOUT_ITEMS.map((item) => {
              const isActive = mode === item.mode;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.mode)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-all"
                  style={{
                    background: isActive ? "var(--color-accent)" : "transparent",
                    color: isActive ? "#fff" : "var(--color-text-secondary)",
                    border: isActive
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--glass-border)",
                  }}
                >
                  <item.icon size={13} weight={isActive ? "fill" : "regular"} />
                  {item.label}
                </button>
              );
            })}
            {/* Activity Log toggle */}
            <button
              onClick={() => setActivityTerminalOpen(!activityTerminalOpen)}
              className="col-span-2 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-all"
              style={{
                background: activityTerminalOpen
                  ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                  : "transparent",
                color: activityTerminalOpen ? "var(--color-accent)" : "var(--color-text-muted)",
                border: activityTerminalOpen
                  ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)"
                  : "1px solid var(--glass-border)",
              }}
            >
              <Terminal size={13} weight={activityTerminalOpen ? "fill" : "regular"} />
              Activity Log
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ width: 120 }}>
          <span className="text-text-muted mb-2 block text-[10px] font-semibold uppercase tracking-wider">
            Mode
          </span>
          <div className="flex flex-col gap-1.5">
            {/* Dark ↔ Light toggle */}
            <button
              onClick={handleToggleMode}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-all"
              style={{
                background: "var(--color-accent)",
                color: "#fff",
                border: "1px solid var(--color-accent)",
              }}
              aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
            >
              {themeMode === "dark" ? (
                <Moon size={12} weight="fill" />
              ) : (
                <Sun size={12} weight="fill" />
              )}
              {themeMode === "dark" ? "Dark" : "Light"}
            </button>
            {/* Monochrome toggle */}
            <button
              onClick={toggleMonochrome}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-all"
              style={{
                background: monochrome
                  ? "var(--color-text-primary)"
                  : "transparent",
                color: monochrome
                  ? "var(--color-bg-base)"
                  : "var(--color-text-secondary)",
                border: monochrome
                  ? "1px solid var(--color-text-primary)"
                  : "1px solid var(--glass-border)",
              }}
              aria-label="Toggle monochrome mode"
            >
              <CircleHalf size={12} weight={monochrome ? "fill" : "regular"} />
              Mono
            </button>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="mb-3" style={{ height: 1, background: "var(--glass-border)" }} />

      {/* Theme palette row */}
      <div>
        <span className="text-text-muted mb-2 block text-[10px] font-semibold uppercase tracking-wider">
          Theme
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {BUILTIN_THEMES.map((t) => {
            const isActive = activeThemeId === t.id;
            const colors = resolvedDark ? t.dark : t.light;
            return (
              <button
                key={t.id}
                onClick={() => handleSelectTheme(t.id)}
                className="flex shrink-0 cursor-pointer flex-col items-center gap-1.5 transition-all"
                style={{ opacity: isActive ? 1 : 0.7 }}
                title={t.name}
              >
                {/* Color swatch */}
                <div
                  className="relative rounded-md"
                  style={{
                    width: 36,
                    height: 36,
                    background: colors.bgBase,
                    border: isActive
                      ? `2px solid ${colors.accent}`
                      : "1px solid var(--glass-border)",
                    overflow: "hidden",
                    boxShadow: isActive
                      ? `0 0 0 2px color-mix(in srgb, ${colors.accent} 30%, transparent)`
                      : "none",
                  }}
                >
                  {/* Accent stripe */}
                  <div
                    className="absolute"
                    style={{
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 6,
                      background: colors.accent,
                    }}
                  />
                  {/* Mini dots: success, danger */}
                  <div className="absolute left-1.5 top-1.5 flex gap-1">
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "var(--radius-xs)",
                        background: colors.success,
                      }}
                    />
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: "var(--radius-xs)",
                        background: colors.danger,
                      }}
                    />
                  </div>
                </div>
                {/* Label */}
                <span
                  className="text-[9px] font-medium"
                  style={{
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  }}
                >
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── NavSidebar (Floating Overlay) ─────────────────────────────────────────

export function NavSidebar() {
  const activeNavMenu = useUiStore((s) => s.activeNavMenu);
  const setActiveNavMenu = useUiStore((s) => s.setActiveNavMenu);
  const layerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!activeNavMenu) return;
    const handler = (e: MouseEvent) => {
      if (layerRef.current && !layerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-nav-trigger]")) return;
        setActiveNavMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeNavMenu, setActiveNavMenu]);

  if (!activeNavMenu) return null;

  return (
    <div
      ref={layerRef}
      style={{
        position: "fixed",
        top: "50%",
        transform: "translateY(-50%)",
        left: 92,
        zIndex: Z.sidebar,
        animation: "navSidebarSlideIn 200ms ease-out",
      }}
      key={activeNavMenu}
    >
      {activeNavMenu === "panels" && <PanelsContent />}
      {activeNavMenu === "ai" && <AIContent />}
      {activeNavMenu === "layout" && <LayoutContent />}
    </div>
  );
}
