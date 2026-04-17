"use client";

import { useState } from "react";
import { ArrowLeft, PaintBrush, Check, Plus, X } from "@phosphor-icons/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { BUILTIN_THEMES } from "@companion/shared";
import type { ThemeDefinition } from "@companion/shared";
import { useUiStore } from "@/lib/stores/ui-store";
import { applyTheme, getStoredThemeId } from "@/lib/theme-provider";
import { toast } from "sonner";
import { AddThemeModal } from "@/components/settings/add-theme-modal";

function ColorDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "var(--radius-md)",
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
          <div
            style={{
              width: 40,
              height: 6,
              borderRadius: "var(--radius-xs)",
              background: colors.accent,
            }}
          />
          <div
            style={{
              width: 24,
              height: 6,
              borderRadius: "var(--radius-xs)",
              background: colors.success,
            }}
          />
          <div
            style={{
              width: 16,
              height: 6,
              borderRadius: "var(--radius-xs)",
              background: colors.danger,
            }}
          />
        </div>
        <div
          style={{
            width: "80%",
            height: 4,
            borderRadius: "var(--radius-xs)",
            background: colors.textMuted,
            marginBottom: 4,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: "60%",
            height: 4,
            borderRadius: "var(--radius-xs)",
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
  const [showAddModal, setShowAddModal] = useState(false);

  const handleSelect = (id: string) => {
    setActiveId(id);
    applyTheme(id, isDark);
    toast.success(`Theme "${id}" applied`);
  };

  const handleImport = (theme: ThemeDefinition) => {
    const updated = [...customThemes, theme];
    setCustomThemes(updated);
    localStorage.setItem("companion_custom_themes", JSON.stringify(updated));
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
        {/* Title + Add CTA */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/settings"
            className="cursor-pointer rounded-lg p-1.5"
            aria-label="Back to settings"
          >
            <ArrowLeft size={18} weight="bold" />
          </Link>
          <PaintBrush size={22} weight="bold" />
          <h1 className="flex-1 text-lg font-bold">Themes</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <Plus size={14} weight="bold" /> Add Theme
          </button>
        </div>

        {/* Theme grid — hover-reveal delete on custom themes */}
        <div className="flex flex-wrap gap-4">
          {allThemes.map((theme) => {
            const isBuiltin = BUILTIN_THEMES.find((t) => t.id === theme.id);
            return (
              <div key={theme.id} className="group relative">
                <ThemeCard
                  theme={theme}
                  isDark={isDark}
                  isActive={activeId === theme.id}
                  onSelect={() => handleSelect(theme.id)}
                />
                {!isBuiltin && (
                  <button
                    onClick={() => handleDeleteCustom(theme.id)}
                    className="absolute -right-2 -top-2 flex cursor-pointer items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    style={{
                      width: 22,
                      height: 22,
                      background: "var(--color-danger)",
                      color: "#fff",
                      border: "none",
                    }}
                    aria-label={`Delete ${theme.name}`}
                    title={`Delete ${theme.name}`}
                  >
                    <X size={12} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showAddModal && (
        <AddThemeModal onClose={() => setShowAddModal(false)} onImport={handleImport} />
      )}
    </div>
  );
}
