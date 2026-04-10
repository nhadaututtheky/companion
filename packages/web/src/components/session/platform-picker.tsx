"use client";
import { CircleNotch, Check, WarningCircle } from "@phosphor-icons/react";
import type { CLIPlatformInfo } from "@/hooks/use-cli-platforms";

type PlatformId = "claude" | "codex" | "gemini" | "opencode";

const PLATFORM_META: Record<PlatformId, { icon: string; color: string; freeLabel?: string }> = {
  claude: { icon: "◈", color: "#D97706" },
  codex: { icon: "◇", color: "#10B981" },
  gemini: { icon: "◆", color: "#4285F4", freeLabel: "Free tier" },
  opencode: { icon: "☁", color: "#8B5CF6" },
};

interface PlatformPickerProps {
  platforms: CLIPlatformInfo[];
  loading: boolean;
  selected: PlatformId;
  onSelect: (id: PlatformId) => void;
}

export function PlatformPicker({ platforms, loading, selected, onSelect }: PlatformPickerProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 gap-2">
        <CircleNotch
          size={16}
          className="animate-spin"
          style={{ color: "var(--color-text-muted)" }}
        />
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Detecting CLI platforms...
        </span>
      </div>
    );
  }

  // Merge detected platforms with known platform IDs
  const allPlatforms: PlatformId[] = ["claude", "codex", "gemini", "opencode"];

  return (
    <div>
      <label
        className="text-xs font-semibold uppercase tracking-wider mb-2 block"
        style={{ color: "var(--color-text-muted)" }}
      >
        Platform
      </label>
      <div className="grid grid-cols-4 gap-2">
        {allPlatforms.map((id) => {
          const meta = PLATFORM_META[id];
          const detected = platforms.find((p) => p.id === id);
          const available = detected?.available ?? false;
          const isSelected = selected === id;

          return (
            <button
              key={id}
              onClick={() => available && onSelect(id)}
              disabled={!available}
              className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isSelected ? `${meta.color}15` : "var(--color-bg-elevated)",
                border: isSelected
                  ? `1.5px solid ${meta.color}`
                  : "1.5px solid var(--color-border)",
                position: "relative",
              }}
              aria-label={`${detected?.name ?? id}${available ? "" : " (not installed)"}`}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div
                  className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-full"
                  style={{
                    width: 14,
                    height: 14,
                    background: meta.color,
                    color: "#fff",
                  }}
                >
                  <Check size={8} weight="bold" />
                </div>
              )}

              {/* Icon */}
              <span
                className="text-lg font-bold"
                style={{ color: isSelected ? meta.color : "var(--color-text-secondary)" }}
              >
                {meta.icon}
              </span>

              {/* Name */}
              <span
                className="text-xs font-semibold"
                style={{
                  color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
              >
                {detected?.name ?? id}
              </span>

              {/* Version / Status */}
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                {available ? (
                  <>
                    <span style={{ color: "#34A853" }}>●</span>{" "}
                    {detected?.version ? `v${detected.version.replace(/^v/, "")}` : "Ready"}
                  </>
                ) : (
                  <>
                    <WarningCircle
                      size={10}
                      style={{ display: "inline", verticalAlign: "middle" }}
                    />{" "}
                    Not installed
                  </>
                )}
              </span>

              {/* Free tier badge */}
              {meta.freeLabel && available && (
                <span
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                  style={{ background: `${meta.color}20`, color: meta.color }}
                >
                  {meta.freeLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
