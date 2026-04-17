"use client";

import { useState } from "react";
import { Brain, BookOpen, ChartBar, GridFour, Check } from "@phosphor-icons/react";
import { useUiStore } from "@/lib/stores/ui-store";
import { NavPill, DetailCard, type NavItem } from "./nav-primitives";

type AiPanelMode = "ai-context" | "wiki" | "stats";

const AI_ITEMS: NavItem[] = [
  {
    id: "workspace",
    label: "Workspace",
    icon: GridFour,
    description: "Multi-CLI workspace dashboard — agents, costs, and activity",
  },
  {
    id: "ai-context",
    label: "AI Context",
    icon: Brain,
    description: "Code intelligence, web docs, and context graph for AI agents",
  },
  {
    id: "wiki",
    label: "Wiki KB",
    icon: BookOpen,
    description: "Domain knowledge base — feeds context to AI agents automatically",
  },
  {
    id: "stats",
    label: "Stats",
    icon: ChartBar,
    description: "Activity statistics, session metrics, and cost tracking",
  },
];

export function AIContent() {
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const statsBarOpen = useUiStore((s) => s.statsBarOpen);
  const setStatsBarOpen = useUiStore((s) => s.setStatsBarOpen);
  const [hovered, setHovered] = useState<string | null>(null);

  const isItemActive = (id: string) => (id === "stats" ? statsBarOpen : rightPanelMode === id);

  const handleClick = (id: string) => {
    if (id === "stats") {
      setStatsBarOpen(!statsBarOpen);
    } else {
      setRightPanelMode(rightPanelMode === id ? "none" : (id as AiPanelMode));
    }
  };

  const active = AI_ITEMS.find((p) => p.id === hovered) ?? AI_ITEMS.find((p) => isItemActive(p.id));

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-col gap-1.5">
        {AI_ITEMS.map((item, i) => (
          <NavPill
            key={item.id}
            icon={<item.icon size={14} weight={isItemActive(item.id) ? "fill" : "regular"} />}
            label={item.label}
            isActive={isItemActive(item.id)}
            index={i}
            onClick={() => handleClick(item.id)}
            onHover={() => setHovered(item.id)}
            onLeave={() => setHovered(null)}
          />
        ))}
      </div>
      {active && (
        <DetailCard index={AI_ITEMS.length}>
          <div className="mb-3 flex items-center gap-2">
            <active.icon
              size={16}
              weight={isItemActive(active.id) ? "fill" : "regular"}
              className="text-accent"
            />
            <span className="text-text-primary text-sm font-semibold">{active.label}</span>
            {isItemActive(active.id) && (
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
        </DetailCard>
      )}
    </div>
  );
}
