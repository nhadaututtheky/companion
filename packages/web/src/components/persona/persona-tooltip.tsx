"use client";
import { useState, useRef, useCallback, type ReactNode } from "react";
import { Z } from "@/lib/z-index";
import type { Persona } from "@companion/shared";
import { PersonaAvatar } from "./persona-avatar";

interface PersonaTooltipProps {
  persona: Persona;
  children: ReactNode;
  placement?: "top" | "bottom" | "right";
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  leader: { label: "Tech Leader", color: "#4285F4" },
  engineer: { label: "Engineering", color: "#34A853" },
  wildcard: { label: "Wild Card", color: "#9C27B0" },
  custom: { label: "Custom", color: "#FF9800" },
};

/**
 * Hover tooltip showing persona details:
 * avatar, name, title, intro, strengths, best-for tags
 */
export function PersonaTooltip({ persona, children, placement = "bottom" }: PersonaTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(true), 300);
  }, []);

  const hide = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setVisible(false), 100);
  }, []);

  const cat = CATEGORY_LABELS[persona.category] ?? CATEGORY_LABELS.custom!;

  const placementStyles: Record<string, React.CSSProperties> = {
    top: { bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 8 },
    bottom: { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 8 },
    right: { left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 8 },
  };

  return (
    <div
      className="relative"
      style={{ display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}

      {visible && (
        <div
          className="persona-tooltip bg-bg-card border-border absolute border"
          role="tooltip"
          style={{
            ...placementStyles[placement],
            width: 280,
            padding: 12,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: Z.overlay,
            pointerEvents: "auto",
          }}
        >
          {/* Header: avatar + name + category */}
          <div className="mb-2 flex items-center gap-3">
            <PersonaAvatar persona={persona} size={36} showBadge={false} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-text-primary truncate text-sm font-semibold">
                {persona.name}
              </span>
              <span
                className="self-start rounded-full px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: `${cat.color}15`,
                  color: cat.color,
                  fontSize: 10,
                }}
              >
                {cat.label}
              </span>
            </div>
          </div>

          {/* Title */}
          <p className="text-text-primary mb-1.5 text-xs font-medium" style={{ lineHeight: 1.4 }}>
            {persona.title}
          </p>

          {/* Intro */}
          <p className="text-text-secondary mb-2 text-xs" style={{ lineHeight: 1.5 }}>
            {persona.intro}
          </p>

          {/* Strength */}
          <div className="mb-2 flex items-start gap-1.5">
            <span style={{ fontSize: 11, lineHeight: 1 }}>💪</span>
            <span className="text-text-primary text-xs font-medium" style={{ lineHeight: 1.4 }}>
              {persona.strength}
            </span>
          </div>

          {/* Best for tags */}
          <div className="flex flex-wrap gap-1">
            {persona.bestFor.map((tag) => (
              <span
                key={tag}
                className="text-text-muted bg-bg-elevated rounded-full px-1.5 py-0.5 text-xs"
                style={{
                  fontSize: 10,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
