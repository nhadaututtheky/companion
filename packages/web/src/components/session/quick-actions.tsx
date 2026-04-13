"use client";
import { Lightning, BookOpen, MagnifyingGlass } from "@phosphor-icons/react";
import type { QuickAction } from "@/lib/stores/composer-store";
import { QUICK_ACTION_PROMPTS } from "@/lib/stores/composer-store";

const ACTIONS: { key: QuickAction; icon: typeof Lightning; label: string }[] = [
  { key: "fix", icon: Lightning, label: "Fix this" },
  { key: "explain", icon: BookOpen, label: "Explain" },
  { key: "review", icon: MagnifyingGlass, label: "Review" },
];

interface QuickActionsProps {
  onAction: (action: QuickAction) => void;
}

export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {ACTIONS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => onAction(key)}
          className="text-text-secondary bg-bg-elevated border-border inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all hover:brightness-110"
          title={QUICK_ACTION_PROMPTS[key]}
        >
          <Icon size={12} weight="bold" />
          {label}
        </button>
      ))}
    </div>
  );
}
