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

/** Apply theme colors to the document root */
export function applyTheme(themeId: string, isDark: boolean): void {
  const theme = findTheme(themeId);
  const colors = isDark ? theme.dark : theme.light;
  const vars = themeToCssVars(colors);

  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    if (!SAFE_COLOR.test(value.trim())) continue; // Skip unsafe values
    root.style.setProperty(key, value);
  }

  localStorage.setItem(THEME_ID_KEY, themeId);
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
    const themeId = getStoredThemeId();
    if (themeId === "default") {
      // Default theme uses CSS-defined vars, no override needed
      clearThemeOverrides();
    } else {
      applyTheme(themeId, isDark);
    }
  }, [isDark]);
}
