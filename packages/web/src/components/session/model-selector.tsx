"use client";
import { useState, useRef, useEffect } from "react";
import { Brain } from "@phosphor-icons/react";

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", short: "S" },
  { value: "claude-opus-4-7", label: "Opus 4.7", short: "O" },
  { value: "claude-opus-4-6", label: "Opus 4.6", short: "O" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5", short: "H" },
] as const;

interface ModelSelectorProps {
  currentModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

function getModelDisplay(model: string) {
  return MODELS.find((m) => m.value === model) ?? { value: model, label: model, short: "?" };
}

export function ModelSelector({ currentModel, onModelChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const display = getModelDisplay(currentModel);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="text-text-secondary bg-bg-elevated border-border flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Current model: ${display.label}. Click to change.`}
        title="Switch model"
      >
        <Brain size={14} weight="bold" />
        <span className="font-mono">{display.label}</span>
      </button>

      {open && (
        <div
          className="bg-bg-card absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-lg shadow-lg"
          style={{
            minWidth: 160,
          }}
        >
          {MODELS.map((m) => {
            const isActive = m.value === currentModel;
            return (
              <button
                key={m.value}
                onClick={() => {
                  if (!isActive) onModelChange(m.value);
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
                <span
                  className="inline-flex font-mono font-bold"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "var(--radius-sm)",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    background: isActive ? "#4285F420" : "var(--color-bg-base)",
                    color: isActive ? "#4285F4" : "var(--color-text-muted)",
                  }}
                >
                  {m.short}
                </span>
                <span>{m.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs" style={{ color: "#4285F4" }}>
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
