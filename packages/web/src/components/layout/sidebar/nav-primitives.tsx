"use client";

import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

export interface NavItem {
  id: string;
  label: string;
  icon: Icon;
  description: string;
  shortcut?: string;
}

export function NavPill({
  icon,
  label,
  isActive,
  index,
  onClick,
  onHover,
  onLeave,
}: {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  index: number;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-4 py-2.5 text-xs font-medium transition-all"
      style={{
        background: isActive ? "var(--color-text-primary)" : "var(--glass-bg)",
        backdropFilter: isActive ? "none" : "blur(var(--glass-blur))",
        WebkitBackdropFilter: isActive ? "none" : "blur(var(--glass-blur))",
        border: isActive ? "1px solid var(--color-text-primary)" : "1px solid var(--glass-border)",
        color: isActive ? "var(--color-bg-base)" : "var(--color-text-secondary)",
        boxShadow: isActive ? "var(--shadow-float)" : "var(--shadow-soft)",
        fontWeight: isActive ? 600 : 400,
        minWidth: 140,
        animation: `navPillStaggerIn 250ms ease-out ${index * 60}ms both`,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function DetailCard({ children, index }: { children: ReactNode; index: number }) {
  return (
    <div
      className="shadow-soft shrink-0 rounded-xl"
      style={{
        width: 240,
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--shadow-float)",
        padding: 16,
        animation: `navPillStaggerIn 250ms ease-out ${index * 60}ms both`,
      }}
    >
      {children}
    </div>
  );
}
