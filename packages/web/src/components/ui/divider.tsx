interface DividerProps {
  /** Color variant */
  variant?: "default" | "glass" | "strong";
  /** Direction */
  orientation?: "horizontal" | "vertical";
  /** Extra className */
  className?: string;
}

/**
 * Semantic section separator.
 * Uses box-shadow trick (not border) to avoid border-box sizing issues in flex/glass containers.
 */
export function Divider({
  variant = "default",
  orientation = "horizontal",
  className = "",
}: DividerProps) {
  const isH = orientation === "horizontal";

  const shadowMap = {
    default: isH ? "0 1px 0 var(--color-border)" : "1px 0 0 var(--color-border)",
    glass: isH ? "0 1px 0 var(--glass-border)" : "1px 0 0 var(--glass-border)",
    strong: isH ? "0 1px 0 var(--color-border-strong)" : "1px 0 0 var(--color-border-strong)",
  };

  return (
    <hr
      role="separator"
      aria-orientation={orientation}
      className={className}
      style={{
        border: "none",
        margin: 0,
        flexShrink: 0,
        boxShadow: shadowMap[variant],
        ...(isH ? { height: 1, width: "100%" } : { width: 1, alignSelf: "stretch" }),
      }}
    />
  );
}
