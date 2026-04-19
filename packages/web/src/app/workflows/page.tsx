"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lightning,
  CircleNotch,
  Plus,
  ArrowClockwise,
  CheckCircle,
  Clock,
  Spinner,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { fmtDateShort } from "@/lib/formatters";
import { TemplatePicker } from "@/components/workflow/template-picker";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { WorkflowState } from "@companion/shared";

interface WorkflowItem {
  channelId: string;
  topic: string;
  status: string;
  projectSlug: string | null;
  workflowState: WorkflowState | null;
  createdAt: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: (
    <Spinner
      size={14}
      weight="bold"
      style={{ color: "#4285f4", animation: "spin 2s linear infinite" }}
    />
  ),
  concluded: <CheckCircle size={14} weight="fill" style={{ color: "#34a853" }} />,
  concluding: <Clock size={14} weight="bold" style={{ color: "#fbbc04" }} />,
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.workflows.list({ status: filter || undefined });
      setWorkflows(res.data as WorkflowItem[]);
    } catch {
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-bg-base flex flex-col" style={{ height: "100vh" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        {/* Title */}
        <div className="mb-6 flex items-center gap-3">
          <Lightning size={22} weight="bold" />
          <h1 className="flex-1 text-lg font-bold">Workflows</h1>
          <button
            onClick={() => load()}
            className="text-text-muted cursor-pointer rounded-lg p-2"
            style={{ background: "none", border: "none" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={16} />
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: "var(--color-accent)", color: "#fff", border: "none" }}
          >
            <Plus size={14} weight="bold" />
            New Workflow
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex gap-2">
          {["", "active", "concluded"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="cursor-pointer rounded-lg px-3 py-1 text-xs font-medium"
              style={{
                background: filter === f ? "var(--color-accent)" : "var(--color-bg-card)",
                color: filter === f ? "#fff" : "var(--color-text-secondary)",
                border: filter === f ? "none" : "1px solid var(--color-border)",
              }}
            >
              {f === "" ? "All" : f === "active" ? "Active" : "Completed"}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <CircleNotch
              size={24}
              className="text-text-muted"
              style={{ animation: "spin 1s linear infinite" }}
            />
          </div>
        ) : workflows.length === 0 ? (
          <div className="shadow-soft bg-bg-card rounded-xl py-12 text-center">
            <Lightning
              size={32}
              weight="light"
              className="text-text-muted"
              style={{ margin: "0 auto 8px" }}
            />
            <p className="text-sm">No workflows yet. Start one from a template.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workflows.map((w) => {
              const state = w.workflowState;
              const completedSteps =
                state?.steps.filter((s) => s.status === "completed").length ?? 0;
              const totalSteps = state?.steps.length ?? 0;
              const pct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

              return (
                <Link
                  key={w.channelId}
                  href={`/workflows/${w.channelId}`}
                  className="shadow-soft bg-bg-card flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors"
                  style={{
                    textDecoration: "none",
                  }}
                >
                  {STATUS_ICONS[w.status] ?? <Clock size={14} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {state?.templateName ?? "Workflow"}
                    </div>
                    <div className="truncate text-xs">{w.topic}</div>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="bg-bg-elevated overflow-hidden"
                    style={{
                      width: 80,
                      height: 6,
                      borderRadius: "var(--radius-xs)",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: "var(--radius-xs)",
                        background:
                          w.status === "concluded" ? "var(--color-success)" : "var(--color-accent)",
                        transition: "width 300ms ease",
                      }}
                    />
                  </div>

                  <span
                    className="text-text-muted text-right font-mono text-xs"
                    style={{ minWidth: 40 }}
                  >
                    {completedSteps}/{totalSteps}
                  </span>

                  <span className="text-text-muted whitespace-nowrap text-xs">
                    {fmtDateShort(w.createdAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {pickerOpen && (
        <TemplatePicker
          onClose={() => setPickerOpen(false)}
          onStarted={(id) => router.push(`/workflows/${id}`)}
        />
      )}
    </div>
  );
}
