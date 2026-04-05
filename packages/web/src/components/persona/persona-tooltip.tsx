"use client";
import { useState, useRef, useCallback, type ReactNode } from "react";
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
export function PersonaTooltip({
  persona,
  children,
  placement = "bottom",
}: PersonaTooltipProps) {
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
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}

      {visible && (
        <div
          className="persona-tooltip"
          role="tooltip"
          style={{
            position: "absolute",
            ...placementStyles[placement],
            width: 280,
            padding: 12,
            borderRadius: 12,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 100,
            pointerEvents: "auto",
          }}
        >
          {/* Header: avatar + name + category */}
          <div className="flex items-center gap-3 mb-2">
            <PersonaAvatar persona={persona} size={36} showBadge={false} />
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {persona.name}
              </span>
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded-full self-start"
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
          <p
            className="text-xs font-medium mb-1.5"
            style={{ color: "var(--color-text-primary)", lineHeight: 1.4 }}
          >
            {persona.title}
          </p>

          {/* Intro */}
          <p
            className="text-xs mb-2"
            style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}
          >
            {persona.intro}
          </p>

          {/* Strength */}
          <div className="flex items-start gap-1.5 mb-2">
            <span style={{ fontSize: 11, lineHeight: 1 }}>💪</span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--color-text-primary)", lineHeight: 1.4 }}
            >
              {persona.strength}
            </span>
          </div>

          {/* Best for tags */}
          <div className="flex flex-wrap gap-1">
            {persona.bestFor.map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-muted)",
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
