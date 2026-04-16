"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Lightning, LightningSlash, Brain } from "@phosphor-icons/react";
import type { ThinkingMode } from "@companion/shared";
import { getAvailableThinkingModes } from "@companion/shared";

const ALL_MODES: { value: ThinkingMode; label: string; short: string; icon: typeof Lightning }[] = [
  { value: "adaptive", label: "Adaptive", short: "A", icon: Lightning },
  { value: "off", label: "Off", short: "—", icon: LightningSlash },
  { value: "deep", label: "Deep", short: "D", icon: Brain },
];

interface ThinkingModeSelectorProps {
  currentMode: ThinkingMode;
  onModeChange: (mode: ThinkingMode) => void;
  /** Current model ID — used to filter available thinking modes */
  currentModel?: string;
  disabled?: boolean;
}

function getModeDisplay(mode: ThinkingMode) {
  return ALL_MODES.find((m) => m.value === mode) ?? ALL_MODES[0]!;
}

export function ThinkingModeSelector({
  currentMode,
  onModeChange,
  currentModel,
  disabled,
}: ThinkingModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const availableModes = useMemo(() => {
    const allowed = getAvailableThinkingModes(currentModel ?? "claude-sonnet-4-6");
    return ALL_MODES.filter((m) => allowed.includes(m.value));
  }, [currentModel]);

  // Auto-downgrade: if current mode isn't available for this model, switch to adaptive
  useEffect(() => {
    const allowed = getAvailableThinkingModes(currentModel ?? "claude-sonnet-4-6");
    if (!allowed.includes(currentMode)) {
      onModeChange("adaptive");
    }
  }, [currentModel, currentMode, onModeChange]);

  const display = getModeDisplay(currentMode);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const Icon = display.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="text-text-secondary bg-bg-elevated border-border flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Thinking mode: ${display.label}. Click to change.`}
        title="Switch thinking mode"
      >
        <Icon size={14} weight="bold" />
        <span className="font-mono">{display.label}</span>
      </button>

      {open && (
        <div
          className="bg-bg-card absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-lg shadow-lg"
          style={{
            minWidth: 160,
          }}
        >
          {availableModes.map((m) => {
            const isActive = m.value === currentMode;
            const MIcon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => {
                  if (!isActive) onModeChange(m.value);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors"
                style={{
                  background: isActive ? "var(--color-bg-elevated)" : "transparent",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <MIcon
                  size={14}
                  weight="bold"
                  style={{
                    color: isActive ? "#F59E0B" : "var(--color-text-muted)",
                  }}
                />
                <span>{m.label}</span>
                {m.value === "adaptive" && <span className="ml-auto text-[10px]">default</span>}
                {m.value === "deep" && <span className="ml-auto text-[10px]">50k tokens</span>}
                {isActive && (
                  <span className="ml-auto text-xs" style={{ color: "#F59E0B" }}>
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
