"use client";

import { Clock, ArrowsClockwise, Play, Trash, Pencil, Timer } from "@phosphor-icons/react";
import type { Schedule } from "@companion/shared";

interface ScheduleListProps {
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
  onToggle: (id: string) => void;
  onRunNow: (id: string) => void;
  onDelete: (id: string) => void;
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
}: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Timer size={32} style={{ color: "var(--color-text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No schedules yet
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Create a schedule to run sessions automatically
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            {["Name", "Trigger", "Next Run", "Runs", "Status", "Actions"].map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2"
                style={{ color: "var(--color-text-muted)", fontSize: 10, fontWeight: 600 }}
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
                style={{ borderBottom: "1px solid var(--color-border)" }}
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
                      className="text-xs font-medium truncate max-w-48"
                      style={{
                        color: s.enabled ? "var(--color-text-primary)" : "var(--color-text-muted)",
                      }}
                    >
                      {s.name}
                    </span>
                    {s.projectSlug && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                      >
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
                    <span
                      className="text-xs font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {s.triggerType === "cron" ? (s.cronExpression ?? "—") : "once"}
                    </span>
                  </div>
                </td>

                {/* Next run */}
                <td className="px-3 py-2.5">
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {s.enabled ? formatNextRun(nextRunTs) : "Disabled"}
                  </span>
                </td>

                {/* Run count */}
                <td className="px-3 py-2.5">
                  <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                    {s.runCount}
                  </span>
                </td>

                {/* Status toggle */}
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onToggle(s.id)}
                    className="relative cursor-pointer"
                    style={{
                      width: 32,
                      height: 18,
                      borderRadius: 9,
                      background: s.enabled ? "#34A853" : "var(--color-bg-elevated)",
                      border: `1px solid ${s.enabled ? "#34A853" : "var(--color-border)"}`,
                      transition: "background 150ms ease",
                    }}
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: s.enabled ? 15 : 2,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left 150ms ease",
                      }}
                    />
                  </button>
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onRunNow(s.id)}
                      className="p-1 rounded cursor-pointer"
                      style={{ color: "#34A853" }}
                      aria-label="Run now"
                      title="Run now"
                    >
                      <Play size={12} weight="fill" />
                    </button>
                    <button
                      onClick={() => onEdit(s)}
                      className="p-1 rounded cursor-pointer"
                      style={{ color: "var(--color-text-muted)" }}
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="p-1 rounded cursor-pointer"
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
