"use client";
import { useState, useRef, useEffect } from "react";
import { Lightning, LightningSlash, Brain } from "@phosphor-icons/react";
import type { ThinkingMode } from "@companion/shared";

const MODES: { value: ThinkingMode; label: string; short: string; icon: typeof Lightning }[] = [
  { value: "adaptive", label: "Adaptive", short: "A", icon: Lightning },
  { value: "off", label: "Off", short: "—", icon: LightningSlash },
  { value: "deep", label: "Deep", short: "D", icon: Brain },
];

interface ThinkingModeSelectorProps {
  currentMode: ThinkingMode;
  onModeChange: (mode: ThinkingMode) => void;
  disabled?: boolean;
}

function getModeDisplay(mode: ThinkingMode) {
  return MODES.find((m) => m.value === mode) ?? MODES[0]!;
}

export function ThinkingModeSelector({
  currentMode,
  onModeChange,
  disabled,
}: ThinkingModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-secondary)",
        }}
        aria-label={`Thinking mode: ${display.label}. Click to change.`}
        title="Switch thinking mode"
      >
        <Icon size={14} weight="bold" />
        <span className="font-mono">{display.label}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg overflow-hidden shadow-lg z-50"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            minWidth: 160,
          }}
        >
          {MODES.map((m) => {
            const isActive = m.value === currentMode;
            const MIcon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => {
                  if (!isActive) onModeChange(m.value);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium transition-colors cursor-pointer text-left"
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
                {m.value === "adaptive" && (
                  <span className="ml-auto text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    default
                  </span>
                )}
                {m.value === "deep" && (
                  <span className="ml-auto text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                    50k tokens
                  </span>
                )}
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
