"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Timer, CalendarBlank, X } from "@phosphor-icons/react";
import { Z } from "@/lib/z-index";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useUiStore } from "@/lib/stores/ui-store";
import { ScheduleList } from "./schedule-list";
import { ScheduleCalendar } from "./schedule-calendar";
import { ScheduleForm } from "./schedule-form";
import { ScheduleRuns } from "./schedule-runs";
import type { Schedule } from "@companion/shared";

export function ScheduleModal() {
  const open = useUiStore((s) => s.schedulesModalOpen);
  const setOpen = useUiStore((s) => s.setSchedulesModalOpen);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [upcoming, setUpcoming] = useState<
    Array<{ scheduleId: string; name: string; nextRunAt: number; triggerType: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [runsSchedule, setRunsSchedule] = useState<Schedule | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [listRes, upcomingRes] = await Promise.all([
        api.schedules.list(),
        api.schedules.upcoming(30),
      ]);
      if (listRes.success) setSchedules(listRes.data);
      if (upcomingRes.success) setUpcoming(upcomingRes.data);
    } catch {
      toast.error("Failed to load schedules");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadData();
    }
  }, [open, loadData]);

  const handleToggle = async (id: string) => {
    try {
      const res = await api.schedules.toggle(id);
      if (res.success) {
        setSchedules((prev) => prev.map((s) => (s.id === id ? (res.data as Schedule) : s)));
        toast.success(res.data.enabled ? "Schedule enabled" : "Schedule disabled");
      }
    } catch {
      toast.error("Failed to toggle schedule");
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const res = await api.schedules.runNow(id);
      if (res.success) {
        toast.success("Session launched");
        loadData();
      } else {
        toast.error((res as { error?: string }).error ?? "Failed to run");
      }
    } catch {
      toast.error("Failed to run schedule");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await api.schedules.delete(id);
      toast.success("Schedule deleted");
      loadData();
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingSchedule(null);
  };

  const handleFormSaved = () => {
    handleFormClose();
    loadData();
  };

  if (!open) return null;

  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--overlay-medium)",
          backdropFilter: "blur(var(--glass-blur-sm))",
          zIndex: Z.overlay,
        }}
      />

      {/* Modal */}
      <div
        className="bg-bg-card shadow-float flex overflow-hidden rounded-xl"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(1100px, 90vw)",
          maxHeight: "85vh",
          zIndex: Z.overlayContent,
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-5 py-3"
          style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
        >
          <div className="flex items-center gap-2">
            <Timer size={18} weight="bold" style={{ color: "#4285F4" }} />
            <h2 className="text-sm font-semibold">Schedules</h2>
            <span className="text-text-muted bg-bg-elevated rounded-full px-2 py-0.5 text-xs">
              {activeCount} active
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingSchedule(null);
                setFormOpen(true);
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "#4285F4", color: "#fff" }}
            >
              <Plus size={12} weight="bold" />
              New
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-text-muted cursor-pointer rounded-lg p-1.5 transition-colors"
              aria-label="Close schedules"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="animate-spin rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  border: "2px solid var(--color-border)",
                  borderTopColor: "#4285F4",
                }}
              />
            </div>
          ) : (
            <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 260px" }}>
              <ScheduleList
                schedules={schedules}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onRunNow={handleRunNow}
                onDelete={handleDelete}
                onViewRuns={setRunsSchedule}
              />

              <div className="flex flex-col gap-4">
                <ScheduleCalendar upcoming={upcoming} />

                {upcoming.length > 0 && (
                  <div className="bg-bg-elevated shadow-soft rounded-xl p-3">
                    <div className="mb-2 flex items-center gap-1.5">
                      <CalendarBlank size={12} style={{ color: "#4285F4" }} />
                      <span className="text-xs font-semibold">Upcoming</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {upcoming.slice(0, 5).map((run, i) => (
                        <div
                          key={`${run.scheduleId}-${i}`}
                          className="flex items-center justify-between"
                        >
                          <span className="max-w-32 truncate text-xs">{run.name}</span>
                          <span
                            className="text-text-muted font-mono text-xs"
                            style={{ fontSize: 10 }}
                          >
                            {new Date(run.nextRunAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sub-modals */}
        {formOpen && (
          <ScheduleForm
            schedule={editingSchedule}
            onClose={handleFormClose}
            onSaved={handleFormSaved}
          />
        )}
        {runsSchedule && (
          <ScheduleRuns
            scheduleId={runsSchedule.id}
            scheduleName={runsSchedule.name}
            onClose={() => setRunsSchedule(null)}
          />
        )}
      </div>
    </>
  );
}
