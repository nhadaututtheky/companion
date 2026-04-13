"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, ArrowLeft, Timer, CalendarBlank } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ScheduleList } from "@/components/schedule/schedule-list";
import { ScheduleCalendar } from "@/components/schedule/schedule-calendar";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { ScheduleRuns } from "@/components/schedule/schedule-runs";
import type { Schedule } from "@companion/shared";

export default function SchedulesPage() {
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
    loadData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadData]);

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

  const activeCount = schedules.filter((s) => s.enabled).length;

  return (
    <div
      className="min-h-screen text-text-primary" style={{ background: "var(--color-bg-base)" }}
    >
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between bg-bg-card" style={{
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <a href="/" className="p-1.5 rounded-lg transition-colors" aria-label="Back to dashboard">
            <ArrowLeft size={16} weight="bold" />
          </a>
          <div className="flex items-center gap-2">
            <Timer size={18} weight="bold" style={{ color: "#4285F4" }} />
            <h1 className="text-base font-semibold">Schedules</h1>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full text-text-muted bg-bg-elevated"
          >
            {activeCount} active
          </span>
        </div>
        <button
          onClick={() => {
            setEditingSchedule(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors"
          style={{ background: "#4285F4", color: "#fff" }}
        >
          <Plus size={12} weight="bold" />
          New Schedule
        </button>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
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
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 280px" }}>
            {/* Left: Schedule list */}
            <ScheduleList
              schedules={schedules}
              onEdit={handleEdit}
              onToggle={handleToggle}
              onRunNow={handleRunNow}
              onDelete={handleDelete}
              onViewRuns={setRunsSchedule}
            />

            {/* Right: Calendar */}
            <div className="flex flex-col gap-4">
              <ScheduleCalendar upcoming={upcoming} />

              {/* Upcoming runs */}
              {upcoming.length > 0 && (
                <div
                  className="shadow-soft rounded-xl p-3 bg-bg-card"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <CalendarBlank size={12} style={{ color: "#4285F4" }} />
                    <span className="text-xs font-semibold">Upcoming</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {upcoming.slice(0, 5).map((run, i) => (
                      <div
                        key={`${run.scheduleId}-${i}`}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs truncate max-w-32">{run.name}</span>
                        <span
                          className="text-xs font-mono text-text-muted" style={{ fontSize: 10 }}
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

      {/* Form modal */}
      {formOpen && (
        <ScheduleForm
          schedule={editingSchedule}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}

      {/* Runs history modal */}
      {runsSchedule && (
        <ScheduleRuns
          scheduleId={runsSchedule.id}
          scheduleName={runsSchedule.name}
          onClose={() => setRunsSchedule(null)}
        />
      )}
    </div>
  );
}
