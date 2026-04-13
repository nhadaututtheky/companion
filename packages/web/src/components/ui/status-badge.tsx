import type { ReactNode } from "react";

/** Canonical session status → color mapping. Single source of truth. */
export const STATUS_COLORS: Record<string, string> = {
  running: "var(--color-accent)",
  waiting: "var(--color-warning)",
  starting: "var(--color-google-green)",
  error: "var(--color-danger)",
  stopped: "var(--color-text-muted)",
  completed: "var(--color-text-muted)",
  idle: "var(--color-text-muted)",
};

/** Canonical debate role → color mapping */
export const ROLE_COLORS: Record<string, string> = {
  advocate: "var(--color-accent)",
  challenger: "var(--color-danger)",
  judge: "var(--color-warning)",
  reviewer: "var(--color-success)",
  human: "var(--color-text-muted)",
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? "var(--color-text-muted)";
}

export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] ?? "var(--color-text-muted)";
}

interface StatusBadgeProps {
  status: string;
  children?: ReactNode;
  className?: string;
}

/** Pill badge for session status (running, waiting, error, etc.) */
export function StatusBadge({ status, children, className = "" }: StatusBadgeProps) {
  const color = getStatusColor(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${className}`}
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {children ?? status}
    </span>
  );
}

interface StatusDotProps {
  status: string;
  size?: number;
  className?: string;
}

/** Standalone status dot indicator */
export function StatusDot({ status, size = 6, className = "" }: StatusDotProps) {
  const color = getStatusColor(status);
  return (
    <span
      className={`inline-block flex-shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, background: color }}
      aria-label={`Status: ${status}`}
    />
  );
}
