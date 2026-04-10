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
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
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
      <h2 className="text-sm font-semibold mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-xs mb-4">
          {description}
        </p>
      )}
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
      <label className="text-xs font-medium">
        {label}
      </label>
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

  return (
    <div className="flex flex-col gap-5">
      <SettingSection title="Appearance">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Theme
            </span>
            <span className="text-xs">
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
    </div>
  );
}

// ── Re-exports from extracted tab files ─────────────────────────────────────

export { GeneralTab } from "./settings-tab-general";
export { AIProviderTab } from "./settings-tab-ai";
export { TelegramTab } from "./settings-tab-telegram";
export { DomainTab } from "./settings-tab-domain";
