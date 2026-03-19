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
    <div
      className="session-grid-inner"
      style={{
        display: "grid",
        gridTemplateColumns: getGridCols(sessions.length),
        gridTemplateRows: getGridRows(sessions.length),
        gap: 12,
        padding: 12,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      {sessions.map((s) => (
        <div
          key={s.id}
          style={{
            opacity: expandedSessionId && expandedSessionId !== s.id ? 0.6 : 1,
            transition: "opacity 250ms ease",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <MiniTerminal
            sessionId={s.id}
            onExpand={onExpand}
          />
        </div>
      ))}
    </div>
  );
}
