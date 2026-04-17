"use client";

import { useCallback, useState } from "react";
import {
  Lightning,
  GitBranch,
  UsersThree,
  ArrowRight,
  X,
  Check,
  CaretDown,
} from "@phosphor-icons/react";
import { useDispatchStore } from "@/lib/stores/dispatch-store";
import type { OrchestrationPattern } from "@companion/shared/types";

const PATTERN_META: Record<
  OrchestrationPattern,
  { label: string; icon: typeof Lightning; color: string }
> = {
  single: { label: "Single", icon: Lightning, color: "#94a3b8" },
  workflow: { label: "Workflow", icon: ArrowRight, color: "#10b981" },
  debate: { label: "Debate", icon: UsersThree, color: "#f59e0b" },
  mention: { label: "Mention", icon: GitBranch, color: "#06b6d4" },
};

interface DispatchSuggestionProps {
  onConfirm: (pattern: OrchestrationPattern) => void;
  onDismiss: () => void;
}

export function DispatchSuggestion({ onConfirm, onDismiss }: DispatchSuggestionProps) {
  const suggestion = useDispatchStore((s) => s.suggestion);
  const overridePattern = useDispatchStore((s) => s.overridePattern);
  const [showOverride, setShowOverride] = useState(false);

  const handleConfirm = useCallback(() => {
    if (!suggestion) return;
    onConfirm(suggestion.classification.pattern);
  }, [suggestion, onConfirm]);

  if (!suggestion || suggestion.dismissed) return null;

  const { classification } = suggestion;
  const meta = PATTERN_META[classification.pattern];
  const Icon = meta.icon;
  const isAutoDispatch = classification.confidence >= 0.8;
  const confidencePct = Math.round(classification.confidence * 100);

  return (
    <div
      className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs"
      style={{
        background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 25%, transparent)`,
      }}
    >
      {/* Icon + pattern label */}
      <div className="flex items-center gap-1.5" style={{ color: meta.color }}>
        <Icon size={14} weight="bold" />
        <span className="font-semibold">{meta.label}</span>
      </div>

      {/* Intent + confidence */}
      <span className="text-text-secondary truncate" style={{ maxWidth: 200 }}>
        {classification.intent}
      </span>
      <span
        className="font-mono text-[10px]"
        style={{ color: isAutoDispatch ? "#10b981" : "#f59e0b" }}
      >
        {confidencePct}%
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Override dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowOverride(!showOverride)}
          className="flex cursor-pointer items-center gap-0.5 rounded px-1.5 py-0.5 transition-colors"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
          }}
          aria-label="Override pattern"
        >
          <CaretDown size={10} />
        </button>
        {showOverride && (
          <div
            className="absolute bottom-full right-0 z-10 mb-1 flex flex-col gap-0.5 rounded-md border p-1 shadow-lg"
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
              minWidth: 120,
            }}
          >
            {(["workflow", "debate", "single"] as const).map((p) => {
              const pm = PATTERN_META[p];
              const PIcon = pm.icon;
              return (
                <button
                  key={p}
                  onClick={() => {
                    overridePattern(p);
                    setShowOverride(false);
                  }}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors"
                  style={{
                    background:
                      classification.pattern === p
                        ? `color-mix(in srgb, ${pm.color} 15%, transparent)`
                        : "transparent",
                    color: classification.pattern === p ? pm.color : "var(--color-text-secondary)",
                  }}
                >
                  <PIcon size={12} weight="bold" />
                  {pm.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        className="flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors"
        style={{ background: meta.color, color: "#fff" }}
        aria-label="Confirm dispatch"
      >
        <Check size={12} weight="bold" />
        {isAutoDispatch ? "Auto" : "Go"}
      </button>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="cursor-pointer rounded p-0.5 transition-colors"
        style={{ color: "var(--color-text-muted)" }}
        aria-label="Dismiss suggestion"
      >
        <X size={12} />
      </button>
    </div>
  );
}
