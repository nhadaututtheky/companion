"use client";

import { useEffect, useMemo } from "react";
import {
  X,
  SquaresFour,
  Plugs,
  PlugsConnected,
  ArrowsClockwise,
  CircleNotch,
  Lightning,
} from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import type { CLIPlatform, WorkspaceCliStatus } from "@companion/shared";

interface WorkspaceDashboardProps {
  onClose: () => void;
  sessions: Array<{
    id: string;
    projectSlug?: string;
    model: string;
    status: string;
    totalCostUsd: number;
    numTurns: number;
    createdAt: number;
    projectName: string;
  }>;
}

const CLI_LABELS: Record<CLIPlatform, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

const CLI_COLORS: Record<CLIPlatform, string> = {
  claude: "#4285F4",
  codex: "#10b981",
  gemini: "#f59e0b",
  opencode: "#8b5cf6",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Running",
  running: "Running",
  idle: "Idle",
  error: "Error",
  disconnected: "Offline",
};

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtUptime(createdAt: number): string {
  const mins = Math.floor((Date.now() - createdAt) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function CliCard({
  cli,
  session,
}: {
  cli: WorkspaceCliStatus;
  session?: WorkspaceDashboardProps["sessions"][number];
}) {
  const color = CLI_COLORS[cli.platform];
  const isActive = cli.status === "connected" || cli.status === "running";
  const dotColor =
    cli.status === "connected" || cli.status === "running"
      ? color
      : cli.status === "idle"
        ? "#f59e0b"
        : cli.status === "error"
          ? "#ef4444"
          : "var(--color-text-muted)";

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{
        background: isActive
          ? `color-mix(in srgb, ${color} 6%, var(--color-bg-elevated))`
          : "var(--color-bg-elevated)",
        border: `1px solid ${isActive ? `color-mix(in srgb, ${color} 20%, transparent)` : "var(--glass-border)"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded-full"
          style={{
            width: 8,
            height: 8,
            background: dotColor,
          }}
        />
        <span className="flex-1 truncate text-xs font-bold" style={{ color }}>
          {CLI_LABELS[cli.platform]}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: isActive
              ? `color-mix(in srgb, ${color} 15%, transparent)`
              : "var(--color-bg-card)",
            color: isActive ? color : "var(--color-text-muted)",
          }}
        >
          {STATUS_LABELS[cli.status] ?? cli.status}
        </span>
      </div>

      {session && isActive ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <div>
            <span className="text-text-muted">Cost</span>
            <div className="text-text-primary font-mono font-bold">
              {fmtCost(session.totalCostUsd)}
            </div>
          </div>
          <div>
            <span className="text-text-muted">Turns</span>
            <div className="text-text-primary font-mono font-bold">{session.numTurns}</div>
          </div>
          <div>
            <span className="text-text-muted">Uptime</span>
            <div className="text-text-primary font-mono font-bold">
              {fmtUptime(session.createdAt)}
            </div>
          </div>
          <div>
            <span className="text-text-muted">Model</span>
            <div className="text-text-primary truncate font-bold">
              {session.model.replace("claude-", "").replace("-latest", "")}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 py-1">
          <Plugs size={10} weight="regular" className="text-text-muted opacity-50" />
          <span className="text-text-muted text-[10px]">Not connected</span>
        </div>
      )}
    </div>
  );
}

export function WorkspaceDashboard({ onClose, sessions }: WorkspaceDashboardProps) {
  const { activeWorkspaceId, detail, detailLoading, fetchWorkspaceDetail } = useWorkspaceStore(
    useShallow((s) => ({
      activeWorkspaceId: s.activeWorkspaceId,
      detail: s.activeWorkspaceDetail,
      detailLoading: s.detailLoading,
      fetchWorkspaceDetail: s.fetchWorkspaceDetail,
    })),
  );

  useEffect(() => {
    if (activeWorkspaceId) fetchWorkspaceDetail(activeWorkspaceId);
  }, [activeWorkspaceId, fetchWorkspaceDetail]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, WorkspaceDashboardProps["sessions"][number]>();
    for (const s of sessions) {
      map.set(s.id, s);
    }
    return map;
  }, [sessions]);

  const totalCost = useMemo(() => {
    if (!detail?.clis) return 0;
    let sum = 0;
    for (const cli of detail.clis) {
      if (cli.sessionId) {
        const s = sessionMap.get(cli.sessionId);
        if (s) sum += s.totalCostUsd;
      }
    }
    return sum;
  }, [detail, sessionMap]);

  const recentActivity = useMemo(() => {
    if (!detail?.clis) return [];
    const connectedIds = new Set(detail.clis.filter((c) => c.sessionId).map((c) => c.sessionId!));
    if (connectedIds.size === 0) {
      const wsSlug = detail.projectSlug;
      return sessions
        .filter((s) => (s.projectSlug ?? s.projectName) === wsSlug)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8);
    }
    return sessions
      .filter((s) => connectedIds.has(s.id) || ACTIVE_STATUSES.has(s.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8);
  }, [detail, sessions]);

  if (!activeWorkspaceId) {
    return (
      <div
        className="text-text-muted flex h-full flex-col items-center justify-center gap-3"
        style={{ background: "var(--color-bg-card)" }}
      >
        <SquaresFour size={32} weight="duotone" />
        <span className="text-sm">Select a workspace</span>
      </div>
    );
  }

  return (
    <div
      className="text-text-primary flex h-full flex-col"
      style={{ background: "var(--color-bg-card)" }}
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
      >
        <div className="flex items-center gap-2">
          <SquaresFour size={16} weight="bold" style={{ color: "#6366f1" }} aria-hidden="true" />
          <span className="text-sm font-semibold">{detail?.name ?? "Workspace"}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => activeWorkspaceId && fetchWorkspaceDetail(activeWorkspaceId)}
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
            aria-label="Refresh workspace"
          >
            <ArrowsClockwise size={14} weight="bold" className="text-text-muted" />
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-[var(--color-bg-elevated)]"
            aria-label="Close workspace panel"
          >
            <X size={14} weight="bold" className="text-text-muted" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        {detailLoading && !detail ? (
          <div className="flex items-center justify-center py-8">
            <CircleNotch size={20} className="text-text-muted animate-spin" />
          </div>
        ) : detail ? (
          <>
            {/* Cost summary */}
            <div className="bg-bg-elevated flex items-center gap-3 rounded-lg px-3 py-2">
              <Lightning size={14} weight="bold" style={{ color: "#f59e0b" }} />
              <span className="text-text-secondary text-xs">Total workspace cost</span>
              <span className="ml-auto font-mono text-sm font-bold">{fmtCost(totalCost)}</span>
            </div>

            {/* CLI Cards */}
            <div>
              <span className="text-text-muted mb-2 block text-[10px] font-semibold uppercase tracking-wider">
                CLI Agents
              </span>
              <div className="grid grid-cols-2 gap-2">
                {detail.clis.map((cli) => (
                  <CliCard
                    key={cli.platform}
                    cli={cli}
                    session={cli.sessionId ? sessionMap.get(cli.sessionId) : undefined}
                  />
                ))}
              </div>
            </div>

            {/* Recent sessions */}
            {recentActivity.length > 0 && (
              <div>
                <span className="text-text-muted mb-2 block text-[10px] font-semibold uppercase tracking-wider">
                  Active Sessions
                </span>
                <div className="flex flex-col gap-1">
                  {recentActivity.map((s) => (
                    <div
                      key={s.id}
                      className="bg-bg-elevated flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                    >
                      <PlugsConnected
                        size={10}
                        weight="bold"
                        className="text-text-muted shrink-0"
                      />
                      <span className="flex-1 truncate">{s.model.replace("claude-", "")}</span>
                      <span className="text-text-muted font-mono text-[10px]">
                        {s.numTurns}t · {fmtCost(s.totalCostUsd)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-text-muted py-8 text-center text-xs">Workspace not found</div>
        )}
      </div>
    </div>
  );
}
