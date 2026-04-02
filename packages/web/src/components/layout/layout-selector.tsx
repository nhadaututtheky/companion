"use client";

import { useLayoutStore, type LayoutMode } from "@/lib/stores/layout-store";
import { useEffect, useCallback } from "react";
import { Square, Columns, Rows, GridFour } from "@phosphor-icons/react";

const LAYOUTS: { mode: LayoutMode; icon: typeof Square; label: string; shortcut: string }[] = [
  { mode: "single", icon: Square, label: "Single", shortcut: "Ctrl+1" },
  { mode: "side-by-side", icon: Columns, label: "Side by side", shortcut: "Ctrl+2" },
  { mode: "stacked", icon: Rows, label: "Stacked", shortcut: "Ctrl+3" },
  { mode: "grid", icon: GridFour, label: "Grid (2×2)", shortcut: "Ctrl+4" },
];

export function LayoutSelector() {
  const mode = useLayoutStore((s) => s.mode);
  const setMode = useLayoutStore((s) => s.setMode);

  const handleKeyboard = useCallback(
    (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const map: Record<string, LayoutMode> = {
        "1": "single",
        "2": "side-by-side",
        "3": "stacked",
        "4": "grid",
      };
      const target = map[e.key];
      if (target) {
        e.preventDefault();
        setMode(target);
      }
    },
    [setMode],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: "var(--color-bg-elevated)" }}
      role="radiogroup"
      aria-label="Session layout"
    >
      {LAYOUTS.map(({ mode: m, icon: Icon, label, shortcut }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className="p-1.5 rounded-md cursor-pointer transition-all"
          style={{
            color: mode === m ? "#4285F4" : "var(--color-text-muted)",
            background: mode === m ? "#4285F415" : "transparent",
          }}
          role="radio"
          aria-checked={mode === m}
          aria-label={`${label} (${shortcut})`}
          title={`${label} (${shortcut})`}
        >
          <Icon size={14} weight={mode === m ? "fill" : "regular"} />
        </button>
      ))}
    </div>
  );
}
