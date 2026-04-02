/**
 * Theme schema — defines color tokens for UI themes.
 * Each theme provides both light and dark mode variants.
 */

export interface ThemeColors {
  bgBase: string;
  bgCard: string;
  bgElevated: string;
  bgSidebar: string;
  bgHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  author?: string;
  light: ThemeColors;
  dark: ThemeColors;
}

/** Map theme colors to CSS custom properties */
export function themeToCssVars(colors: ThemeColors): Record<string, string> {
  return {
    "--color-bg-base": colors.bgBase,
    "--color-bg-card": colors.bgCard,
    "--color-bg-elevated": colors.bgElevated,
    "--color-bg-sidebar": colors.bgSidebar,
    "--color-bg-hover": colors.bgHover,
    "--color-text-primary": colors.textPrimary,
    "--color-text-secondary": colors.textSecondary,
    "--color-text-muted": colors.textMuted,
    "--color-border": colors.border,
    "--color-border-strong": colors.borderStrong,
    "--color-accent": colors.accent,
    "--color-success": colors.success,
    "--color-danger": colors.danger,
    "--color-warning": colors.warning,
  };
}

// ─── Built-in Themes ───────────────────────────────────────────────────────

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "default",
    name: "Default",
    light: {
      bgBase: "#f5f3ef",
      bgCard: "#ffffff",
      bgElevated: "#f0ede8",
      bgSidebar: "#fafaf8",
      bgHover: "#ede9e3",
      textPrimary: "#1f2d3d",
      textSecondary: "#4b5563",
      textMuted: "#9ca3af",
      border: "#e5e0d8",
      borderStrong: "#d0cac0",
      accent: "#4285f4",
      success: "#34a853",
      danger: "#ea4335",
      warning: "#fbbc04",
    },
    dark: {
      bgBase: "#050505",
      bgCard: "#0d0d0d",
      bgElevated: "#161616",
      bgSidebar: "#0a0a0a",
      bgHover: "#1e1e1e",
      textPrimary: "#f0f0f0",
      textSecondary: "#aaaaaa",
      textMuted: "#808080",
      border: "#1e1e1e",
      borderStrong: "#2e2e2e",
      accent: "#4285f4",
      success: "#34a853",
      danger: "#ea4335",
      warning: "#fbbc04",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    author: "Wimer Hazenberg",
    light: {
      bgBase: "#fafafa",
      bgCard: "#ffffff",
      bgElevated: "#f0f0f0",
      bgSidebar: "#f5f5f5",
      bgHover: "#e8e8e8",
      textPrimary: "#272822",
      textSecondary: "#49483e",
      textMuted: "#90908a",
      border: "#e0e0e0",
      borderStrong: "#cccccc",
      accent: "#a6e22e",
      success: "#a6e22e",
      danger: "#f92672",
      warning: "#e6db74",
    },
    dark: {
      bgBase: "#272822",
      bgCard: "#2d2e27",
      bgElevated: "#3e3d32",
      bgSidebar: "#1e1f1c",
      bgHover: "#3e3d32",
      textPrimary: "#f8f8f2",
      textSecondary: "#cfcfc2",
      textMuted: "#75715e",
      border: "#3e3d32",
      borderStrong: "#49483e",
      accent: "#a6e22e",
      success: "#a6e22e",
      danger: "#f92672",
      warning: "#e6db74",
    },
  },
  {
    id: "nord",
    name: "Nord",
    author: "Arctic Ice Studio",
    light: {
      bgBase: "#eceff4",
      bgCard: "#ffffff",
      bgElevated: "#e5e9f0",
      bgSidebar: "#f0f2f6",
      bgHover: "#d8dee9",
      textPrimary: "#2e3440",
      textSecondary: "#3b4252",
      textMuted: "#7b88a1",
      border: "#d8dee9",
      borderStrong: "#c8ced9",
      accent: "#5e81ac",
      success: "#a3be8c",
      danger: "#bf616a",
      warning: "#ebcb8b",
    },
    dark: {
      bgBase: "#2e3440",
      bgCard: "#3b4252",
      bgElevated: "#434c5e",
      bgSidebar: "#272c36",
      bgHover: "#434c5e",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textMuted: "#7b88a1",
      border: "#3b4252",
      borderStrong: "#434c5e",
      accent: "#88c0d0",
      success: "#a3be8c",
      danger: "#bf616a",
      warning: "#ebcb8b",
    },
  },
];
