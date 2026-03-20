"use client";
import { useState } from "react";
import {
  Plus,
  FolderOpen,
} from "@phosphor-icons/react";

interface SessionItem {
  id: string;
  projectName: string;
  model: string;
  status: string;
  totalCostUsd: number;
  numTurns: number;
  createdAt: number;
}

interface SessionListProps {
  sessions: SessionItem[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function StatusDot({ status }: { status: string }) {
  const configs: Record<string, { color: string; label: string }> = {
    starting: { color: "#FBBC04", label: "Starting" },
    running: { color: "#4285F4", label: "Running" },
    busy: { color: "#4285F4", label: "Busy" },
    waiting: { color: "#FBBC04", label: "Waiting" },
    idle: { color: "#34A853", label: "Idle" },
    ended: { color: "#A0A0A0", label: "Ended" },
    error: { color: "#EA4335", label: "Error" },
  };

  const config = configs[status] ?? configs.idle!;

  return (
    <span
      title={config.label}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: config.color,
        flexShrink: 0,
      }}
    />
  );
}

function formatCost(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTime(ts: number) {
  if (!ts || ts <= 0) return "just now";
  const diff = Date.now() - ts;
  if (diff < 0 || diff > 365 * 86_400_000) return "just now";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function SessionList({ sessions, activeSessionId, onSelect, onNew }: SessionListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "ended">("active");

  const active = sessions.filter((s) => ["starting", "running", "waiting", "idle", "busy"].includes(s.status));
  const ended = sessions.filter((s) => ["ended", "error"].includes(s.status));
  const displayed = filter === "all" ? sessions : filter === "active" ? active : ended;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Sessions
          {active.length > 0 && (
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: "#4285F420", color: "#4285F4" }}
            >
              {active.length}
            </span>
          )}
        </span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          style={{ background: "#34A853", color: "#fff" }}
          aria-label="New session"
        >
          <Plus size={12} weight="bold" /> New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-1.5 mb-1">
        {(["active", "all", "ended"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize"
            style={{
              background: filter === f ? "var(--color-bg-elevated)" : "transparent",
              color: filter === f ? "var(--color-text-primary)" : "var(--color-text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <FolderOpen size={28} style={{ color: "var(--color-text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {filter === "active" ? "No active sessions" : "No sessions"}
            </p>
          </div>
        )}

        {displayed.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="w-full flex flex-col gap-1 px-4 py-2.5 text-left transition-all cursor-pointer rounded-lg mx-2"
            style={{
              background: activeSessionId === s.id ? "var(--color-bg-hover)" : "transparent",
              width: "calc(100% - 16px)",
            }}
          >
            <div className="flex items-center gap-2">
              <StatusDot status={s.status} />
              <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--color-text-primary)" }}>
                {s.projectName}
              </span>
              <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                {formatCost(s.totalCostUsd)}
              </span>
            </div>
            <div className="flex items-center gap-3 pl-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <span>{s.model.split("-").slice(-1)[0]}</span>
              <span>{s.numTurns} turns</span>
              <span className="ml-auto">{formatTime(s.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
