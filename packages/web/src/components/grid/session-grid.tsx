"use client";
import { MiniTerminal } from "./mini-terminal";
import { useSessionStore } from "@/lib/stores/session-store";

interface SessionCard {
  id: string;
  projectName: string;
  model: string;
  status: string;
}

interface SessionGridProps {
  sessions: SessionCard[];
  onExpand: (id: string) => void;
  onSelect?: (id: string) => void;
}

function getGridCols(count: number): string {
  if (count <= 1) return "1fr";
  if (count <= 2) return "repeat(2, 1fr)";
  if (count <= 4) return "repeat(2, 1fr)";
  return "repeat(3, 1fr)";
}

function getGridRows(count: number): string {
  if (count <= 2) return "1fr";
  if (count <= 4) return "repeat(2, 1fr)";
  return "repeat(2, 1fr)";
}

export function SessionGrid({ sessions, onExpand }: SessionGridProps) {
  const expandedSessionId = useSessionStore((s) => s.expandedSessionId);

  return (
    // Outer wrapper handles scroll + padding
    <div className="h-full overflow-auto p-4">
      {/*
        Responsive grid:
        - Mobile (<768px): single column
        - md (768-1023px): 2 columns max
        - lg+ (1024px+): count-based (up to 3 columns)
        We apply mobile-first Tailwind classes and only use the inline count-based
        column/row logic at md+ via a CSS custom property approach.
      */}
      <div
        className="session-grid-inner grid gap-4 h-full min-h-0"
        style={
          {
            "--grid-cols-desktop": getGridCols(sessions.length),
            "--grid-rows-desktop": getGridRows(sessions.length),
          } as React.CSSProperties
        }
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            style={{
              opacity: expandedSessionId && expandedSessionId !== s.id ? 0.6 : 1,
              transition: "opacity 250ms ease",
              minHeight: 200,
              overflow: "hidden",
            }}
          >
            <MiniTerminal sessionId={s.id} onExpand={onExpand} />
          </div>
        ))}
      </div>
    </div>
  );
}
