"use client";

import {
  Clock,
  ArrowsClockwise,
  Play,
  Trash,
  Pencil,
  Timer,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import type { Schedule } from "@companion/shared";

interface ScheduleListProps {
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
  onToggle: (id: string) => void;
  onRunNow: (id: string) => void;
  onDelete: (id: string) => void;
  onViewRuns: (schedule: Schedule) => void;
}

function formatNextRun(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();

  if (diffMs < 0) return "Overdue";
  if (diffMs < 60_000) return "< 1 min";
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} min`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduleList({
  schedules,
  onEdit,
  onToggle,
  onRunNow,
  onDelete,
  onViewRuns,
}: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <Timer size={32} />
        <p className="text-sm">No schedules yet</p>
        <p className="text-xs">Create a schedule to run sessions automatically</p>
      </div>
    );
  }

  return (
    <div className="shadow-soft bg-bg-card overflow-hidden rounded-xl">
      <table className="w-full">
        <thead>
          <tr style={{ boxShadow: "0 1px 0 var(--color-border)" }}>
            {["Name", "Trigger", "Next Run", "Runs", "Status", "Actions"].map((h) => (
              <th
                key={h}
                className="text-text-muted px-3 py-2 text-left font-semibold"
                style={{ fontSize: 10 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const nextRunTs = s.nextRunAt ? Number(s.nextRunAt) : null;

            return (
              <tr
                key={s.id}
                className="group transition-colors"
                style={{ boxShadow: "0 1px 0 var(--color-border)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-bg-elevated)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Name */}
                <td className="px-3 py-2.5">
                  <div className="flex flex-col">
                    <span
                      className="max-w-48 truncate text-xs font-medium"
                      style={{
                        color: s.enabled ? "var(--color-text-primary)" : "var(--color-text-muted)",
                      }}
                    >
                      {s.name}
                    </span>
                    {s.projectSlug && (
                      <span className="text-text-muted text-xs" style={{ fontSize: 10 }}>
                        {s.projectSlug}
                      </span>
                    )}
                  </div>
                </td>

                {/* Trigger */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {s.triggerType === "cron" ? (
                      <ArrowsClockwise size={12} style={{ color: "#4285F4" }} />
                    ) : (
                      <Clock size={12} style={{ color: "#FBBC04" }} />
                    )}
                    <span className="font-mono text-xs">
                      {s.triggerType === "cron" ? (s.cronExpression ?? "—") : "once"}
                    </span>
                  </div>
                </td>

                {/* Next run */}
                <td className="px-3 py-2.5">
                  <span className="text-xs">
                    {s.enabled ? formatNextRun(nextRunTs) : "Disabled"}
                  </span>
                </td>

                {/* Run count */}
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs">{s.runCount}</span>
                </td>

                {/* Status toggle */}
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onToggle(s.id)}
                    className="relative cursor-pointer"
                    style={{
                      width: 32,
                      height: 18,
                      borderRadius: "var(--radius-lg)",
                      background: s.enabled ? "#34A853" : "var(--color-bg-elevated)",
                      border: `1px solid ${s.enabled ? "#34A853" : "var(--color-border)"}`,
                      transition: "background 150ms ease",
                    }}
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                  >
                    <span
                      className="absolute rounded-full"
                      style={{
                        top: 2,
                        left: s.enabled ? 15 : 2,
                        width: 12,
                        height: 12,
                        background: "#fff",
                        transition: "left 150ms ease",
                      }}
                    />
                  </button>
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => onRunNow(s.id)}
                      className="cursor-pointer rounded p-1"
                      style={{ color: "#34A853" }}
                      aria-label="Run now"
                      title="Run now"
                    >
                      <Play size={12} weight="fill" />
                    </button>
                    <button
                      onClick={() => onViewRuns(s)}
                      className="cursor-pointer rounded p-1"
                      style={{ color: "#4285F4" }}
                      aria-label="Run history"
                      title="Run history"
                    >
                      <ClockCounterClockwise size={12} />
                    </button>
                    <button
                      onClick={() => onEdit(s)}
                      className="cursor-pointer rounded p-1"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="cursor-pointer rounded p-1"
                      style={{ color: "#EA4335" }}
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
