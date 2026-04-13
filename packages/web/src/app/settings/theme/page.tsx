"use client";

import { useState, useRef } from "react";
import { ArrowLeft, PaintBrush, Check, UploadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BUILTIN_THEMES } from "@companion/shared";
import type { ThemeDefinition, ThemeColors } from "@companion/shared";
import { useUiStore } from "@/lib/stores/ui-store";
import { applyTheme, getStoredThemeId, clearThemeOverrides } from "@/lib/theme-provider";
import { toast } from "sonner";

function ColorDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: color,
          border: "1px solid rgba(128,128,128,0.3)",
        }}
        title={`${label}: ${color}`}
      />
      <span className="text-text-muted" style={{ fontSize: 9 }}>
        {label}
      </span>
    </div>
  );
}

function ThemeCard({
  theme,
  isDark,
  isActive,
  onSelect,
}: {
  theme: ThemeDefinition;
  isDark: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  const colors = isDark ? theme.dark : theme.light;
  return (
    <button
      onClick={onSelect}
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-xl transition-all"
      style={{
        border: isActive ? `2px solid ${colors.accent}` : "2px solid var(--color-border)",
        background: colors.bgCard,
        minWidth: 200,
        textAlign: "left",
      }}
    >
      {isActive && (
        <div
          className="absolute right-2 top-2 flex items-center justify-center rounded-full"
          style={{ width: 20, height: 20, background: colors.accent }}
        >
          <Check size={12} weight="bold" style={{ color: "#fff" }} />
        </div>
      )}
      {/* Preview */}
      <div style={{ background: colors.bgBase, padding: 12 }}>
        <div className="mb-2 flex gap-2">
          <div style={{ width: 40, height: 6, borderRadius: 3, background: colors.accent }} />
          <div style={{ width: 24, height: 6, borderRadius: 3, background: colors.success }} />
          <div style={{ width: 16, height: 6, borderRadius: 3, background: colors.danger }} />
        </div>
        <div
          style={{
            width: "80%",
            height: 4,
            borderRadius: 2,
            background: colors.textMuted,
            marginBottom: 4,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: "60%",
            height: 4,
            borderRadius: 2,
            background: colors.textMuted,
            opacity: 0.3,
          }}
        />
      </div>
      {/* Info */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${colors.border}` }}>
        <div className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
          {theme.name}
        </div>
        {theme.author && (
          <div style={{ fontSize: 11, color: colors.textMuted }}>by {theme.author}</div>
        )}
      </div>
      {/* Color swatches */}
      <div className="flex gap-2 px-3 pb-3">
        <ColorDot color={colors.bgBase} label="BG" />
        <ColorDot color={colors.accent} label="Accent" />
        <ColorDot color={colors.textPrimary} label="Text" />
        <ColorDot color={colors.success} label="OK" />
        <ColorDot color={colors.danger} label="Err" />
      </div>
    </button>
  );
}

/** Try to parse a VS Code theme JSON and map to ThemeColors */
function parseVscodeTheme(json: Record<string, unknown>): ThemeColors | null {
  const colors = json.colors as Record<string, string> | undefined;
  if (!colors) return null;

  return {
    bgBase: colors["editor.background"] ?? "#1e1e1e",
    bgCard: colors["sideBar.background"] ?? colors["editor.background"] ?? "#252526",
    bgElevated: colors["editorWidget.background"] ?? "#2d2d2d",
    bgSidebar: colors["sideBar.background"] ?? "#252526",
    bgHover: colors["list.hoverBackground"] ?? "#2a2d2e",
    textPrimary: colors["editor.foreground"] ?? "#d4d4d4",
    textSecondary: colors["descriptionForeground"] ?? "#cccccc",
    textMuted: colors["editorLineNumber.foreground"] ?? "#858585",
    border: colors["panel.border"] ?? colors["editorGroup.border"] ?? "#404040",
    borderStrong: colors["contrastBorder"] ?? "#505050",
    accent: colors["focusBorder"] ?? colors["button.background"] ?? "#007acc",
    success: colors["terminal.ansiGreen"] ?? "#4ec9b0",
    danger: colors["errorForeground"] ?? colors["terminal.ansiRed"] ?? "#f44747",
    warning: colors["editorWarning.foreground"] ?? colors["terminal.ansiYellow"] ?? "#cca700",
  };
}

export default function ThemeSettingsPage() {
  const isDark = useUiStore((s) => s.theme === "dark");
  const [activeId, setActiveId] = useState(getStoredThemeId);
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("companion_custom_themes") ?? "[]");
    } catch {
      return [];
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = (id: string) => {
    setActiveId(id);
    // Apply theme (default included — its colors match the CSS vars)
    applyTheme(id, isDark);
    toast.success(`Theme "${id}" applied`);
  };

  const handleImportVscode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const darkColors = parseVscodeTheme(json);
      if (!darkColors) {
        toast.error("Could not parse VS Code theme — missing 'colors' key");
        return;
      }
      const name = (json.name as string) ?? file.name.replace(/\.json$/, "");
      const id = `custom-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      const newTheme: ThemeDefinition = {
        id,
        name,
        author: "VS Code Import",
        light: darkColors, // Use same colors for light (user can edit later)
        dark: darkColors,
      };
      const updated = [...customThemes, newTheme];
      setCustomThemes(updated);
      localStorage.setItem("companion_custom_themes", JSON.stringify(updated));
      toast.success(`Imported "${name}"`);
    } catch {
      toast.error("Failed to parse theme file");
    }
    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDeleteCustom = (id: string) => {
    const updated = customThemes.filter((t) => t.id !== id);
    setCustomThemes(updated);
    localStorage.setItem("companion_custom_themes", JSON.stringify(updated));
    if (activeId === id) {
      handleSelect("default");
    }
  };

  const allThemes = [...BUILTIN_THEMES, ...customThemes];

  return (
    <div className="bg-bg-base flex flex-col" style={{ height: "100vh" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        {/* Title */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/settings"
            className="cursor-pointer rounded-lg p-1.5"
            aria-label="Back to settings"
          >
            <ArrowLeft size={18} weight="bold" />
          </Link>
          <PaintBrush size={22} weight="bold" />
          <h1 className="text-lg font-bold">Themes</h1>
        </div>

        {/* Theme grid */}
        <div className="mb-8 flex flex-wrap gap-4">
          {allThemes.map((theme) => (
            <div key={theme.id} className="relative">
              <ThemeCard
                theme={theme}
                isDark={isDark}
                isActive={activeId === theme.id}
                onSelect={() => handleSelect(theme.id)}
              />
              {!BUILTIN_THEMES.find((t) => t.id === theme.id) && (
                <button
                  onClick={() => handleDeleteCustom(theme.id)}
                  className="absolute -right-2 -top-2 cursor-pointer rounded-full px-1.5 py-0.5 text-xs font-bold"
                  style={{
                    background: "var(--color-danger)",
                    color: "#fff",
                    border: "none",
                    fontSize: 10,
                  }}
                  aria-label={`Delete ${theme.name}`}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Import VS Code theme */}
        <div className="shadow-soft bg-bg-card rounded-xl p-4">
          <h2 className="mb-2 text-sm font-semibold">Import VS Code Theme</h2>
          <p className="mb-3 text-xs">
            Upload a VS Code theme JSON file (.json) to extract colors. The theme&apos;s
            &quot;colors&quot; key will be mapped to Companion&apos;s CSS variables.
          </p>
          <label className="shadow-soft text-text-secondary bg-bg-elevated inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors">
            <UploadSimple size={16} />
            Choose File
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleImportVscode}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
