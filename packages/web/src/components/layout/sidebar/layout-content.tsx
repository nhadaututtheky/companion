"use client";

import { useState } from "react";
import {
  Square,
  Columns,
  Rows,
  GridFour,
  Terminal,
  Moon,
  Sun,
  CircleHalf,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { useLayoutStore, type LayoutMode } from "@/lib/stores/layout-store";
import { BUILTIN_THEMES } from "@companion/shared";
import { applyTheme, getStoredThemeId } from "@/lib/theme-provider";
import type { NavItem } from "./nav-primitives";

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

export function LayoutContent() {
  const mode = useLayoutStore((s) => s.mode);
  const setMode = useLayoutStore((s) => s.setMode);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
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
            <button
              onClick={toggleMonochrome}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium transition-all"
              style={{
                background: monochrome ? "var(--color-text-primary)" : "transparent",
                color: monochrome ? "var(--color-bg-base)" : "var(--color-text-secondary)",
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

      <div className="mb-3" style={{ height: 1, background: "var(--glass-border)" }} />

      {/* Theme palette */}
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
