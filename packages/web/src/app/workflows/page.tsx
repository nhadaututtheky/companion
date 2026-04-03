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
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <Lightning size={22} weight="bold" />
          <h1 className="text-lg font-bold flex-1">
            Workflows
          </h1>
          <button
            onClick={() => load()}
            className="p-2 rounded-lg cursor-pointer"
            style={{ background: "none", border: "none", color: "var(--color-text-muted)" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={16} />
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer"
            style={{ background: "var(--color-accent)", color: "#fff", border: "none" }}
          >
            <Plus size={14} weight="bold" />
            New Workflow
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {["", "active", "concluded"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
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
              style={{ animation: "spin 1s linear infinite", color: "var(--color-text-muted)" }}
            />
          </div>
        ) : workflows.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
          >
            <Lightning
              size={32}
              weight="light"
              style={{ color: "var(--color-text-muted)", margin: "0 auto 8px" }}
            />
            <p className="text-sm">
              No workflows yet. Start one from a template.
            </p>
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
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer"
                  style={{
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    textDecoration: "none",
                  }}
                >
                  {STATUS_ICONS[w.status] ?? (
                    <Clock size={14} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                     
                    >
                      {state?.templateName ?? "Workflow"}
                    </div>
                    <div className="text-xs truncate">
                      {w.topic}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      width: 80,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--color-bg-elevated)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 3,
                        background:
                          w.status === "concluded" ? "var(--color-success)" : "var(--color-accent)",
                        transition: "width 300ms ease",
                      }}
                    />
                  </div>

                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--color-text-muted)", minWidth: 40, textAlign: "right" }}
                  >
                    {completedSteps}/{totalSteps}
                  </span>

                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}
                  >
                    {new Date(w.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
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
