"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  SkipForward,
  ArrowsClockwise,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface ScheduleRun {
  id: number;
  scheduleId: string;
  sessionId: string | null;
  status: string;
  reason: string | null;
  startedAt: number;
}

interface ScheduleRunsProps {
  scheduleId: string;
  onClose: () => void;
  scheduleName: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  success: { icon: CheckCircle, color: "#34A853", label: "Success" },
  failed: { icon: XCircle, color: "#EA4335", label: "Failed" },
  skipped: { icon: SkipForward, color: "#FBBC04", label: "Skipped" },
};

export function ScheduleRuns({ scheduleId, onClose, scheduleName }: ScheduleRunsProps) {
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRuns = useCallback(async () => {
    try {
      const res = await api.schedules.runs(scheduleId);
      if (res.success) setRuns(res.data);
    } catch {
      // silent
    }
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => {
    loadRuns(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadRuns]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: 100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="shadow-float bg-bg-card flex max-h-[70vh] w-full max-w-md flex-col rounded-xl"
        style={{
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={14} style={{ color: "#4285F4" }} />
            <span className="text-sm font-semibold">Run History</span>
            <span className="text-text-muted bg-bg-elevated rounded px-1.5 py-0.5 text-xs">
              {scheduleName}
            </span>
          </div>
          <button
            onClick={loadRuns}
            className="cursor-pointer rounded p-1"
            aria-label="Refresh"
            title="Refresh"
          >
            <ArrowsClockwise size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="animate-spin rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  border: "2px solid var(--color-border)",
                  borderTopColor: "#4285F4",
                }}
              />
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-8">
              <ClockCounterClockwise size={24} />
              <p className="text-xs">No runs yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {runs.map((run) => {
                const cfg = statusConfig[run.status] ?? statusConfig.failed;
                const Icon = cfg.icon;

                return (
                  <div
                    key={run.id}
                    className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    {/* Status icon */}
                    <Icon
                      size={16}
                      weight="fill"
                      className="shrink-0"
                      style={{ color: cfg.color }}
                    />

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{cfg.label}</span>
                        {run.sessionId && (
                          <span
                            className="text-text-muted max-w-24 truncate font-mono text-xs"
                            style={{ fontSize: 10 }}
                          >
                            {run.sessionId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      {run.reason && (
                        <p
                          className="text-text-muted truncate text-xs"
                          style={{ fontSize: 10 }}
                          title={run.reason}
                        >
                          {run.reason}
                        </p>
                      )}
                    </div>

                    {/* Time */}
                    <div className="flex flex-shrink-0 flex-col items-end">
                      <span className="text-text-secondary text-xs" style={{ fontSize: 10 }}>
                        {formatRelative(run.startedAt)}
                      </span>
                      <span className="text-text-muted font-mono text-xs" style={{ fontSize: 9 }}>
                        {formatTime(run.startedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end px-4 py-2"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button onClick={onClose} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
