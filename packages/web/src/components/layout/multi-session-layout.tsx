"use client";

import { useCallback } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useLayoutStore, getPaneCount, type LayoutMode } from "@/lib/stores/layout-store";
import { SessionGrid } from "@/components/grid/session-grid";
import { SessionPane } from "./session-pane";

interface MultiSessionLayoutProps {
  /** All active session cards for the grid */
  gridSessions: Array<{
    id: string;
    projectName: string;
    model: string;
    status: string;
  }>;
  /** Callback when a session is expanded (single mode fallback) */
  onExpand: (id: string) => void;
  /** Empty state component */
  emptyState: React.ReactNode;
}

function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const isHorizontal = orientation === "horizontal";
  return (
    <Separator
      className="group"
      style={{
        display: "flex",
        alignItems: isHorizontal ? "center" : "stretch",
        justifyContent: "center",
        flexShrink: 0,
        ...(isHorizontal
          ? { width: 6, cursor: "col-resize" }
          : { height: 6, cursor: "row-resize" }),
      }}
    >
      <div
        style={{
          background: "var(--color-border)",
          borderRadius: 3,
          transition: "background 150ms ease, opacity 150ms ease",
          ...(isHorizontal
            ? { width: 3, height: 32, margin: "auto 0" }
            : { width: 32, height: 3, margin: "0 auto" }),
        }}
        className="group-hover:!bg-[#4285F4] group-active:!bg-[#4285F4]"
      />
    </Separator>
  );
}

function EmptyPane({
  paneIndex,
  sessions,
}: {
  paneIndex: number;
  sessions: Array<{ id: string; projectName: string }>;
}) {
  const pinToPane = useLayoutStore((s) => s.pinToPane);

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3 px-4"
     
    >
      <p className="text-xs text-center">
        Click a session to pin it here
      </p>
      {sessions.length > 0 && (
        <div className="flex flex-col gap-1 w-full max-w-48">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => pinToPane(paneIndex, s.id)}
              className="text-xs font-mono px-3 py-2 rounded-lg cursor-pointer transition-colors text-left truncate"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#4285F4";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
              }}
            >
              {s.projectName || s.id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function renderPanes(
  mode: LayoutMode,
  panes: (string | null)[],
  sessions: Array<{ id: string; projectName: string; model: string; status: string }>,
  onClose: (paneIndex: number) => void,
) {
  const count = getPaneCount(mode);
  const paneElements = Array.from({ length: count }, (_, i) => {
    const sessionId = panes[i];
    return (
      <Panel key={i} defaultSize={100 / count} minSize={20}>
        {sessionId ? (
          <SessionPane sessionId={sessionId} onClose={() => onClose(i)} />
        ) : (
          <EmptyPane paneIndex={i} sessions={sessions} />
        )}
      </Panel>
    );
  });

  if (mode === "grid") {
    // 2x2 grid: top row (panels 0,1) | handle | bottom row (panels 2,3)
    return (
      <Group orientation="vertical" className="h-full">
        <Panel defaultSize={50} minSize={20}>
          <Group orientation="horizontal" className="h-full">
            {paneElements[0]}
            <ResizeHandle orientation="horizontal" />
            {paneElements[1]}
          </Group>
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel defaultSize={50} minSize={20}>
          <Group orientation="horizontal" className="h-full">
            {paneElements[2]}
            <ResizeHandle orientation="horizontal" />
            {paneElements[3]}
          </Group>
        </Panel>
      </Group>
    );
  }

  const orientation = mode === "stacked" ? "vertical" : "horizontal";
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < paneElements.length; i++) {
    elements.push(paneElements[i]);
    if (i < paneElements.length - 1) {
      elements.push(<ResizeHandle key={`handle-${i}`} orientation={orientation} />);
    }
  }

  return (
    <Group orientation={orientation} className="h-full">
      {elements}
    </Group>
  );
}

export function MultiSessionLayout({
  gridSessions,
  onExpand,
  emptyState,
}: MultiSessionLayoutProps) {
  const mode = useLayoutStore((s) => s.mode);
  const panes = useLayoutStore((s) => s.panes);
  const unpinFromPane = useLayoutStore((s) => s.unpinFromPane);

  const handleClosePane = useCallback(
    (paneIndex: number) => {
      unpinFromPane(paneIndex);
    },
    [unpinFromPane],
  );

  // Single mode: show the original grid
  if (mode === "single") {
    return gridSessions.length === 0 ? (
      <>{emptyState}</>
    ) : (
      <SessionGrid sessions={gridSessions} onExpand={onExpand} />
    );
  }

  // Multi-pane mode
  return <div className="h-full">{renderPanes(mode, panes, gridSessions, handleClosePane)}</div>;
}
