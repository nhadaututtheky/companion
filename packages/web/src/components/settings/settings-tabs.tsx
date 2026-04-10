"use client";

import {
  Globe,
  Robot,
  TelegramLogo,
  PaintBrush,
  Gear,
  Plugs,
  Bug,
  BookOpen,
  Crown,
  CheckCircle,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { useMascotStore, MASCOT_OPTIONS, type MascotId } from "@/lib/stores/mascot-store";
import { useLicenseStore } from "@/lib/stores/license-store";
import { MascotViewer } from "@/components/mascot/mascot-viewer";
import type { SettingsTab } from "@/types/settings";

// ── Shared primitives ─────────────────────────────────────────────────────────

export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-5 rounded-xl"
      style={{
        background: "var(--glass-bg-heavy)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      <h2 className="text-sm font-semibold mb-1">{title}</h2>
      {description && <p className="text-xs mb-4">{description}</p>}
      {children}
    </div>
  );
}

export function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg text-sm input-bordered transition-colors"
        style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
        }}
      />
    </div>
  );
}

// ── Tab types ────────────────────────────────────────────────────────────────

export const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <Gear size={15} weight="bold" /> },
  { id: "domain", label: "Domain", icon: <Globe size={15} weight="bold" /> },
  { id: "ai", label: "AI Provider", icon: <Robot size={15} weight="bold" /> },
  { id: "telegram", label: "Telegram", icon: <TelegramLogo size={15} weight="fill" /> },
  { id: "mcp", label: "MCP", icon: <Plugs size={15} weight="bold" /> },
  { id: "rtk", label: "RTK", icon: <Bug size={15} weight="bold" /> },
  { id: "appearance", label: "Appearance", icon: <PaintBrush size={15} weight="bold" /> },
  { id: "skills", label: "Skills", icon: <BookOpen size={15} weight="bold" /> },
];

// ── Bot config types ─────────────────────────────────────────────────────────

export interface BotConfig {
  id: string;
  label: string;
  role: "claude" | "codex" | "gemini" | "opencode" | "general";
  enabled: boolean;
  allowedChatIds: number[];
  allowedUserIds: number[];
}

export interface RunningBot {
  botId: string;
  label: string;
  role: string;
  running: boolean;
}

// ── Appearance Tab (small, stays here) ──────────────────────────────────────

export function AppearanceTab() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const selected = useMascotStore((s) => s.selected);
  const setSelected = useMascotStore((s) => s.setSelected);
  const isPro = useLicenseStore((s) => s.isPro());
  const promptUpgrade = useLicenseStore((s) => s.promptUpgrade);

  const handleMascotSelect = (id: MascotId) => {
    const option = MASCOT_OPTIONS.find((m) => m.id === id);
    if (!option) return;
    if (option.proOnly && !isPro) {
      promptUpgrade("Mascot customization requires Pro tier");
      return;
    }
    setSelected(id);
  };

  const mascotOptions = MASCOT_OPTIONS;

  return (
    <div className="flex flex-col gap-5">
      {/* Theme */}
      <SettingSection title="Theme">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Color mode</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Switch between light and dark mode
            </span>
          </div>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <Robot size={14} weight="bold" aria-hidden="true" />
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </SettingSection>

      {/* Mascot Picker */}
      <SettingSection
        title="Companion Mascot"
        description="Choose your floating companion avatar"
      >
        <div className="grid grid-cols-3 gap-3">
          {mascotOptions.map((option) => {
            const isSelected = selected === option.id;
            const isLocked = option.proOnly && !isPro;

            return (
              <button
                key={option.id}
                onClick={() => handleMascotSelect(option.id)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all cursor-pointer relative"
                style={{
                  background: isSelected
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "var(--color-bg-elevated)",
                  border: isSelected
                    ? "2px solid var(--color-accent)"
                    : "2px solid var(--glass-border)",
                  opacity: isLocked ? 0.6 : 1,
                }}
                aria-label={`Select ${option.label} mascot`}
              >
                {/* Pro badge */}
                {option.proOnly && (
                  <div
                    className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: isLocked ? "#FBBC0420" : "#34A85320",
                      color: isLocked ? "#FBBC04" : "#34A853",
                    }}
                  >
                    <Crown size={10} weight="fill" />
                    Pro
                  </div>
                )}

                {/* Preview */}
                <div
                  className="flex items-center justify-center"
                  style={{ width: 64, height: 64 }}
                >
                  {option.lottieFile ? (
                    <MascotViewer lottieFile={option.lottieFile} size={64} />
                  ) : (
                    <div
                      className="rounded-full"
                      style={{
                        width: 48,
                        height: 48,
                        background:
                          "radial-gradient(circle at 40% 35%, #4285F4, #34A853, #FBBC04, #EA4335)",
                        boxShadow: "0 0 20px rgba(66,133,244,0.4)",
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <span className="text-xs font-semibold">{option.label}</span>
                <span
                  className="text-xs text-center leading-tight"
                  style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                >
                  {option.description}
                </span>

                {/* Selected check */}
                {isSelected && (
                  <CheckCircle
                    size={16}
                    weight="fill"
                    style={{
                      color: "var(--color-accent)",
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </SettingSection>
    </div>
  );
}

// ── Re-exports from extracted tab files ─────────────────────────────────────

export { GeneralTab } from "./settings-tab-general";
export { AIProviderTab } from "./settings-tab-ai";
export { TelegramTab } from "./settings-tab-telegram";
export { DomainTab } from "./settings-tab-domain";
