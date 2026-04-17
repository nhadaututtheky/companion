"use client";
import type { ContextMode } from "@companion/shared";
import { modelSupports1M } from "@companion/shared";

interface ContextModeSelectorProps {
  currentMode: ContextMode;
  onModeChange: (mode: ContextMode) => void;
  /** Current model ID — used to determine whether the toggle should appear */
  currentModel?: string;
  disabled?: boolean;
}

/**
 * Context window toggle (200K / 1M) — only rendered when the model supports
 * the 1M context beta (Opus 4.7/4.6, Sonnet 4.6).
 */
export function ContextModeSelector({
  currentMode,
  onModeChange,
  currentModel,
  disabled,
}: ContextModeSelectorProps) {
  if (!modelSupports1M(currentModel ?? "")) return null;

  const handleToggle = (mode: ContextMode) => {
    if (disabled || mode === currentMode) return;
    onModeChange(mode);
  };

  return (
    <div
      className="bg-bg-elevated border-border flex items-center gap-0.5 rounded-lg px-0.5 py-0.5"
      role="group"
      aria-label="Context window size"
      title="Context window — 1M is beta and increases cost"
    >
      {(["200k", "1m"] as const).map((mode) => {
        const active = currentMode === mode;
        return (
          <button
            key={mode}
            onClick={() => handleToggle(mode)}
            disabled={disabled}
            aria-pressed={active}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: active ? "#4285F4" : "transparent",
              color: active ? "#fff" : "var(--color-text-secondary)",
            }}
          >
            {mode === "1m" ? "1M" : "200K"}
          </button>
        );
      })}
    </div>
  );
}
