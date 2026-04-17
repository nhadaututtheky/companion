"use client";

import { useState, useCallback, useMemo } from "react";
import { X, Lightbulb, ArrowRight } from "@phosphor-icons/react";
import { TIPS, type Tip } from "./tips-data";
import { isDismissed, dismissTip, areTipsEnabled } from "./tip-storage";

interface TipBannerProps {
  context?: "dashboard" | "session";
  conditions?: Record<string, boolean>;
}

export function TipBanner({ context = "dashboard", conditions }: TipBannerProps) {
  // Bumped after dismiss to re-filter and re-pick (localStorage-backed dismissals
  // aren't reactive, so we force availableTips to recompute).
  const [dismissCounter, setDismissCounter] = useState(0);

  const availableTips = useMemo(() => {
    if (!areTipsEnabled()) return [];

    return TIPS.filter((tip) => {
      if (isDismissed(tip.id)) return false;
      if (tip.showWhen && !conditions?.[tip.showWhen]) return false;

      if (context === "session") {
        return tip.category === "usage";
      }
      return true;
    });

  }, [context, conditions, dismissCounter]);

  const currentTip: Tip | null = useMemo(() => {
    if (availableTips.length === 0) return null;
    const idx = Math.floor(Math.random() * availableTips.length);
    return availableTips[idx] ?? null;
  }, [availableTips]);

  const handleDismiss = useCallback(() => {
    if (!currentTip) return;
    dismissTip(currentTip.id);
    setDismissCounter((c) => c + 1);
  }, [currentTip]);

  const handleAction = useCallback(() => {
    if (!currentTip?.action) return;

    if (currentTip.action.href) {
      if (currentTip.action.href.startsWith("http")) {
        window.open(currentTip.action.href, "_blank", "noopener");
      } else {
        window.location.href = currentTip.action.href;
      }
    }

    if (currentTip.action.settingsTab) {
      window.dispatchEvent(
        new CustomEvent("open-settings", { detail: { tab: currentTip.action.settingsTab } }),
      );
    }
  }, [currentTip]);

  if (!currentTip) return null;

  const CATEGORY_COLORS = {
    setup: { bg: "rgba(99,102,241,0.1)", accent: "var(--color-accent, #6366f1)" },
    usage: { bg: "rgba(16,185,129,0.1)", accent: "var(--color-success, #10b981)" },
    discovery: { bg: "rgba(245,158,11,0.1)", accent: "var(--color-warning, #f59e0b)" },
  };

  const colors = CATEGORY_COLORS[currentTip.category];

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.accent}20`,
      }}
    >
      <Lightbulb
        size={16}
        weight="fill"
        className="shrink-0"
        style={{ color: colors.accent, marginTop: 1 }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-text-primary font-medium">{currentTip.title}</div>
        <div className="text-text-secondary mt-0.5">{currentTip.body}</div>
        {currentTip.action && (
          <button
            onClick={handleAction}
            className="mt-1.5 flex cursor-pointer items-center gap-1 font-medium"
            style={{ color: colors.accent }}
          >
            {currentTip.action.label}
            <ArrowRight size={12} />
          </button>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="text-text-secondary cursor-pointer rounded p-0.5 hover:bg-[var(--color-bg-elevated)]"
        aria-label="Dismiss tip"
      >
        <X size={14} />
      </button>
    </div>
  );
}
