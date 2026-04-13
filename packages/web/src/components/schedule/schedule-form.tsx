"use client";

import { useState, useEffect, useCallback } from "react";
import { X, FloppyDisk, ArrowsClockwise } from "@phosphor-icons/react";
import { Z } from "@/lib/z-index";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { Schedule, CreateScheduleInput, UpdateScheduleInput } from "@companion/shared";

interface ScheduleFormProps {
  schedule: Schedule | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

interface ProjectOption {
  slug: string;
  name: string;
}

export function ScheduleForm({ schedule, onClose, onSaved }: ScheduleFormProps) {
  const isEdit = !!schedule;

  const [name, setName] = useState(schedule?.name ?? "");
  const [projectSlug, setProjectSlug] = useState(schedule?.projectSlug ?? "");
  const [prompt, setPrompt] = useState(schedule?.prompt ?? "");
  const [model, setModel] = useState(schedule?.model ?? "claude-sonnet-4-6");
  const [triggerType, setTriggerType] = useState<"once" | "cron">(schedule?.triggerType ?? "once");
  const [cronExpression, setCronExpression] = useState(schedule?.cronExpression ?? "");
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (schedule?.scheduledAt) {
      return new Date(Number(schedule.scheduledAt)).toISOString().slice(0, 16);
    }
    // Default: 1 hour from now
    return new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
  });
  const [timezone, setTimezone] = useState(
    schedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [maxCostUsd, setMaxCostUsd] = useState(
    schedule?.autoStopRules?.maxCostUsd?.toString() ?? "",
  );
  const [maxTurns, setMaxTurns] = useState(schedule?.autoStopRules?.maxTurns?.toString() ?? "");
  const [enabled] = useState(schedule?.enabled ?? true);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);

  // Load projects
  useEffect(() => {
    api.projects
      .list()
      .then((res) => {
        if (Array.isArray(res.data)) {
          setProjects(
            (res.data as Array<{ slug: string; name: string }>).map((p) => ({
              slug: p.slug,
              name: p.name,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!projectSlug) {
      toast.error("Project is required");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Prompt is required");
      return;
    }
    if (triggerType === "cron" && !cronExpression.trim()) {
      toast.error("Cron expression is required");
      return;
    }

    setSaving(true);

    const autoStopRules: Record<string, number> = {};
    if (maxCostUsd) autoStopRules.maxCostUsd = parseFloat(maxCostUsd);
    if (maxTurns) autoStopRules.maxTurns = parseInt(maxTurns);

    try {
      if (isEdit && schedule) {
        const input: UpdateScheduleInput = {
          name: name.trim(),
          prompt: prompt.trim(),
          model,
          cronExpression: triggerType === "cron" ? cronExpression.trim() : undefined,
          scheduledAt: triggerType === "once" ? new Date(scheduledAt).getTime() : undefined,
          timezone,
          autoStopRules: Object.keys(autoStopRules).length > 0 ? autoStopRules : undefined,
          enabled,
        };
        const res = await api.schedules.update(schedule.id, input);
        if (res.success) {
          toast.success("Schedule updated");
          onSaved();
        } else {
          toast.error((res as { error?: string }).error ?? "Failed to update");
        }
      } else {
        const input: CreateScheduleInput = {
          name: name.trim(),
          projectSlug,
          prompt: prompt.trim(),
          model,
          triggerType,
          cronExpression: triggerType === "cron" ? cronExpression.trim() : undefined,
          scheduledAt: triggerType === "once" ? new Date(scheduledAt).getTime() : undefined,
          timezone,
          autoStopRules: Object.keys(autoStopRules).length > 0 ? autoStopRules : undefined,
          enabled,
        };
        const res = await api.schedules.create(input);
        if (res.success) {
          toast.success("Schedule created");
          onSaved();
        } else {
          toast.error((res as { error?: string }).error ?? "Failed to create");
        }
      }
    } catch {
      toast.error("Failed to save schedule");
    }

    setSaving(false);
  }, [
    name,
    projectSlug,
    prompt,
    model,
    triggerType,
    cronExpression,
    scheduledAt,
    timezone,
    maxCostUsd,
    maxTurns,
    enabled,
    isEdit,
    schedule,
    onSaved,
  ]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", zIndex: Z.overlay }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="shadow-float bg-bg-card flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl"
        style={{
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h2 className="text-sm font-semibold">{isEdit ? "Edit Schedule" : "New Schedule"}</h2>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Form body */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {/* Name */}
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily code review"
              className="input-bordered w-full rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            />
          </Field>

          {/* Project */}
          <Field label="Project">
            <select
              value={projectSlug}
              onChange={(e) => setProjectSlug(e.target.value)}
              className="input-bordered w-full cursor-pointer rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
              disabled={isEdit}
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Prompt */}
          <Field label="Prompt">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Review all recent changes and create a summary..."
              rows={4}
              className="input-bordered w-full resize-none rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            />
          </Field>

          {/* Model */}
          <Field label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="input-bordered w-full cursor-pointer rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            >
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>
          </Field>

          {/* Trigger type */}
          <Field label="Trigger">
            <div className="flex gap-2">
              {(["once", "cron"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTriggerType(t)}
                  className="flex-1 cursor-pointer rounded-lg px-3 py-2 text-center text-xs transition-colors"
                  style={{
                    background: triggerType === t ? "#4285F415" : "var(--color-bg-elevated)",
                    border: `1px solid ${triggerType === t ? "#4285F4" : "var(--color-border)"}`,
                    color: triggerType === t ? "#4285F4" : "var(--color-text-secondary)",
                    fontWeight: triggerType === t ? 600 : 400,
                  }}
                >
                  {t === "once" ? "One-time" : "Recurring (cron)"}
                </button>
              ))}
            </div>
          </Field>

          {/* Trigger config */}
          {triggerType === "once" ? (
            <Field label="Run at">
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input-bordered w-full rounded-lg px-3 py-2 text-xs"
                style={inputStyle}
              />
            </Field>
          ) : (
            <Field label="Cron Expression">
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5 (weekdays at 9am)"
                className="input-bordered w-full rounded-lg px-3 py-2 font-mono text-xs"
                style={inputStyle}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { label: "Every hour", value: "0 * * * *" },
                  { label: "Daily 9am", value: "0 9 * * *" },
                  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
                  { label: "Weekly Mon", value: "0 9 * * 1" },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setCronExpression(preset.value)}
                    className="text-text-muted bg-bg-elevated border-border cursor-pointer rounded border px-2 py-0.5 text-xs transition-colors"
                    style={{
                      fontSize: 10,
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Timezone */}
          <Field label="Timezone">
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="input-bordered w-full rounded-lg px-3 py-2 text-xs"
              style={inputStyle}
            />
          </Field>

          {/* Auto-stop rules */}
          <div className="flex gap-3">
            <Field label="Max cost ($)">
              <input
                type="number"
                value={maxCostUsd}
                onChange={(e) => setMaxCostUsd(e.target.value)}
                placeholder="1.00"
                step="0.1"
                min="0"
                className="input-bordered w-full rounded-lg px-3 py-2 text-xs"
                style={inputStyle}
              />
            </Field>
            <Field label="Max turns">
              <input
                type="number"
                value={maxTurns}
                onChange={(e) => setMaxTurns(e.target.value)}
                placeholder="50"
                min="1"
                className="input-bordered w-full rounded-lg px-3 py-2 text-xs"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button onClick={onClose} className="cursor-pointer rounded-lg px-4 py-1.5 text-xs">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: saving ? "var(--color-bg-elevated)" : "#4285F4",
              color: saving ? "var(--color-text-muted)" : "#fff",
            }}
          >
            {saving ? (
              <ArrowsClockwise size={12} className="animate-spin" />
            ) : (
              <FloppyDisk size={12} />
            )}
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────

const inputStyle = {
  background: "var(--color-bg-elevated)",
  color: "var(--color-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
