"use client";

import { useUiStore } from "@/lib/stores/ui-store";
import { useThemeSync } from "@/lib/theme-provider";

/** Invisible component that syncs the active theme's CSS variables */
export function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useThemeSync(theme === "dark");
  return null;
}
