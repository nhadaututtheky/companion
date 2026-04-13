"use client";

import { useEffect } from "react";
import { BUILTIN_THEMES, themeToCssVars } from "@companion/shared";
import type { ThemeDefinition } from "@companion/shared";

const THEME_ID_KEY = "companion_theme_id";

/** Get stored theme ID or default */
export function getStoredThemeId(): string {
  if (typeof window === "undefined") return "default";
  try {
    return localStorage.getItem(THEME_ID_KEY) ?? "default";
  } catch {
    return "default";
  }
}

/** Find a theme by ID (built-in or custom) */
export function findTheme(id: string): ThemeDefinition {
  // Check localStorage for custom themes
  if (typeof window !== "undefined") {
    try {
      const custom = localStorage.getItem("companion_custom_themes");
      if (custom) {
        const customs = JSON.parse(custom) as ThemeDefinition[];
        const found = customs.find((t) => t.id === id);
        if (found) return found;
      }
    } catch {
      // ignore parse errors
    }
  }
  return BUILTIN_THEMES.find((t) => t.id === id) ?? BUILTIN_THEMES[0];
}

/** Validate a CSS color value — only allow hex, rgb(), hsl(), and named colors */
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,20})$/;

/** Monochrome overrides — applied on top of any theme */
const MONO_OVERRIDES: Record<string, string> = {
  "--color-accent": "#888888",
  "--color-success": "#808080",
  "--color-danger": "#707070",
  "--color-warning": "#999999",
};

/** Apply theme colors to the document root */
export function applyTheme(themeId: string, isDark: boolean): void {
  const theme = findTheme(themeId);
  const colors = isDark ? theme.dark : theme.light;
  const vars = themeToCssVars(colors);

  const root = document.documentElement;
  const isMono = root.classList.contains("mono");

  for (const [key, value] of Object.entries(vars)) {
    // In mono mode, override color accents with grayscale
    const finalValue = isMono && MONO_OVERRIDES[key] ? MONO_OVERRIDES[key] : value;
    if (!SAFE_COLOR.test(finalValue.trim())) continue;
    root.style.setProperty(key, finalValue);
  }

  localStorage.setItem(THEME_ID_KEY, themeId);
}

/** Re-apply current theme (used when toggling mono mode) */
export function reapplyCurrentTheme(): void {
  const themeId = getStoredThemeId();
  const isDark = document.documentElement.classList.contains("dark");
  applyTheme(themeId, isDark);
}

/** Remove inline theme overrides (revert to CSS defaults) */
export function clearThemeOverrides(): void {
  const root = document.documentElement;
  const keys = [
    "--color-bg-base",
    "--color-bg-card",
    "--color-bg-elevated",
    "--color-bg-sidebar",
    "--color-bg-hover",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-muted",
    "--color-border",
    "--color-border-strong",
    "--color-accent",
    "--color-success",
    "--color-danger",
    "--color-warning",
  ];
  for (const key of keys) {
    root.style.removeProperty(key);
  }
}

/** React hook that syncs theme on mount and when dark mode changes */
export function useThemeSync(isDark: boolean): void {
  useEffect(() => {
    // Restore monochrome class BEFORE applyTheme so it picks up mono overrides
    try {
      const mono = localStorage.getItem("companion_mono") === "1";
      document.documentElement.classList.toggle("mono", mono);
    } catch {
      // ignore
    }

    const themeId = getStoredThemeId();
    applyTheme(themeId, isDark);
  }, [isDark]);
}
