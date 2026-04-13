"use client";
import { useId } from "react";
import type { Persona } from "@companion/shared";

interface PersonaAvatarProps {
  persona: Persona;
  size?: number;
  showBadge?: boolean;
  className?: string;
}

/**
 * Stylized avatar for a persona/expert mode.
 * Renders a gradient circle with initials and category badge.
 */
export function PersonaAvatar({
  persona,
  size = 40,
  showBadge = true,
  className,
}: PersonaAvatarProps) {
  const gradId = useId();
  const [color1, color2] = persona.avatarGradient;
  const fontSize = Math.round(size * 0.38);
  const badgeSize = Math.max(14, Math.round(size * 0.35));

  return (
    <div
      className={`persona-avatar ${className ?? ""} shrink-0 relative`}
       style={{
        width: size,
        height: size,
        }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={persona.name}
        role="img"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="100%" stopColor={color2} />
          </linearGradient>
        </defs>

        {/* Background circle */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill={`url(#${gradId})`} />

        {/* Subtle inner ring for depth */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 2}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={0.5}
        />

        {/* Initials */}
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fill="#fff"
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="var(--font-mono, 'JetBrains Mono', monospace)"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
        >
          {persona.avatarInitials}
        </text>
      </svg>

      {/* Icon badge */}
      {showBadge && (
        <span
          className="bg-bg-card rounded-full absolute flex" style={{
            bottom: -2,
            right: -2,
            width: badgeSize,
            height: badgeSize,
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.round(badgeSize * 0.7),
            lineHeight: 1,
            border: "1.5px solid var(--color-border)",
          }}
          aria-hidden="true"
        >
          {persona.icon}
        </span>
      )}
    </div>
  );
}
