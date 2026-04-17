"use client";

import { useState } from "react";
import {
  MagnifyingGlass,
  FolderOpen,
  Globe,
  TerminalWindow,
  Check,
} from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { NavPill, DetailCard, type NavItem } from "./nav-primitives";

type PanelMode = "search" | "files" | "browser" | "terminal";

const PANEL_ITEMS: NavItem[] = [
  {
    id: "search",
    label: "Search",
    icon: MagnifyingGlass,
    description: "Search across files in the current project",
    shortcut: "Ctrl+Shift+F",
  },
  {
    id: "files",
    label: "Files",
    icon: FolderOpen,
    description: "Browse and navigate project file tree",
  },
  {
    id: "browser",
    label: "Browser",
    icon: Globe,
    description: "Preview web pages and browser output",
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: TerminalWindow,
    description: "Interactive terminal for command execution",
  },
];

export function PanelsContent() {
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const [hovered, setHovered] = useState<string | null>(null);

  const active =
    PANEL_ITEMS.find((p) => p.id === hovered) ?? PANEL_ITEMS.find((p) => p.id === rightPanelMode);

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-col gap-1.5">
        {PANEL_ITEMS.map((item, i) => (
          <NavPill
            key={item.id}
            icon={<item.icon size={14} weight={rightPanelMode === item.id ? "fill" : "regular"} />}
            label={item.label}
            isActive={rightPanelMode === item.id}
            index={i}
            onClick={() =>
              setRightPanelMode(rightPanelMode === item.id ? "none" : (item.id as PanelMode))
            }
            onHover={() => setHovered(item.id)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
      {active && (
        <DetailCard index={PANEL_ITEMS.length}>
          <div className="mb-3 flex items-center gap-2">
            <active.icon
              size={16}
              weight={rightPanelMode === active.id ? "fill" : "regular"}
              style={{
                color:
                  rightPanelMode === active.id
                    ? "var(--color-accent)"
                    : "var(--color-text-secondary)",
              }}
            />
            <span className="text-text-primary text-sm font-semibold">{active.label}</span>
            {rightPanelMode === active.id && (
              <span
                className="text-success flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                }}
              >
                <Check size={10} weight="bold" /> Active
              </span>
            )}
          </div>
          <p className="text-text-muted text-xs leading-relaxed">{active.description}</p>
          {active.shortcut && (
            <span className="text-text-muted bg-bg-elevated mt-3 inline-block rounded-sm px-2 py-1 font-mono text-xs">
              {active.shortcut}
            </span>
          )}
        </DetailCard>
      )}
    </div>
  );
}
