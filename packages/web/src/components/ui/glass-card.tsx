import { type ReactNode, type ElementType, type CSSProperties } from "react";

type GlassWeight = "light" | "heavy";
type GlassRadius = "sm" | "md" | "lg" | "xl" | "2xl" | "none";
type GlassShadow = "soft" | "float" | "panel" | "modal" | "none";

interface GlassCardProps {
  weight?: GlassWeight;
  radius?: GlassRadius;
  shadow?: GlassShadow;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const BG_MAP: Record<GlassWeight, string> = {
  light: "var(--glass-bg)",
  heavy: "var(--glass-bg-heavy)",
};

const RADIUS_MAP: Record<GlassRadius, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  none: "0",
};

const SHADOW_MAP: Record<GlassShadow, string> = {
  soft: "var(--shadow-soft)",
  float: "var(--shadow-float)",
  panel: "var(--shadow-panel)",
  modal: "var(--shadow-modal)",
  none: "none",
};

/**
 * Glass-morphism card with centralized tokens.
 * Replaces inline glass-bg + backdrop-filter combos.
 */
export function GlassCard({
  weight = "heavy",
  radius = "xl",
  shadow = "float",
  as: Tag = "div",
  className = "",
  style,
  children,
}: GlassCardProps) {
  return (
    <Tag
      className={className}
      style={{
        background: BG_MAP[weight],
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderRadius: RADIUS_MAP[radius],
        boxShadow: SHADOW_MAP[shadow],
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
