"use client";

import { use, useState, useEffect, useCallback } from "react";
import {
  Lightning,
  ArrowLeft,
  CircleNotch,
  XCircle,
  CheckCircle,
  Clock,
  Spinner,
  Stop,
  ArrowClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import type { WorkflowState } from "@companion/shared";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STEP_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock size={16} weight="bold" />,
  running: (
    <Spinner
      size={16}
      weight="bold"
      style={{ color: "#4285f4", animation: "spin 2s linear infinite" }}
    />
  ),
  completed: <CheckCircle size={16} weight="fill" style={{ color: "#34a853" }} />,
  failed: <XCircle size={16} weight="fill" style={{ color: "#ea4335" }} />,
  skipped: (
    <Clock size={16} weight="light" style={{ color: "var(--color-text-muted)", opacity: 0.4 }} />
  ),
};

const STEP_STATUS_COLOR: Record<string, string> = {
  pending: "var(--color-border)",
  running: "#4285f4",
  completed: "#34a853",
  failed: "#ea4335",
  skipped: "var(--color-border)",
};

export function WorkflowPageClient({ params }: PageProps) {
  const { id } = use(params);
  const [workflow, setWorkflow] = useState<{
    channelId: string;
    topic: string;
    status: string;
    workflowState: WorkflowState | null;
    createdAt: string;
    concludedAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.workflows.get(id);
      setWorkflow(res.data as typeof workflow);
    } catch {
      toast.error("Workflow not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    // Auto-refresh while active
    const interval = setInterval(() => {
      load();
    }, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleCancel = async () => {
    if (!confirm("Cancel this workflow?")) return;
    try {
      await api.workflows.cancel(id);
      toast.success("Workflow cancelled");
      load();
    } catch {
      toast.error("Failed to cancel");
    }
  };

  if (loading) {
    return (
      <div
        className="flex flex-col"
        style={{ height: "100vh", background: "var(--color-bg-base)" }}
      >
        <Header />
        <div className="flex justify-center items-center flex-1">
          <CircleNotch
            size={28}
            style={{ animation: "spin 1s linear infinite", color: "var(--color-text-muted)" }}
          />
        </div>
      </div>
    );
  }

  if (!workflow || !workflow.workflowState) {
    return (
      <div
        className="flex flex-col"
        style={{ height: "100vh", background: "var(--color-bg-base)" }}
      >
        <Header />
        <div
          className="flex flex-col items-center justify-center flex-1 gap-3"
         
        >
          <XCircle size={32} weight="light" />
          <p>Workflow not found</p>
          <Link href="/workflows" className="text-sm">
            Back to workflows
          </Link>
        </div>
      </div>
    );
  }

  const state = workflow.workflowState;
  const isActive = workflow.status === "active";

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 800, margin: "0 auto", width: "100%" }}
      >
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/workflows"
            className="p-1.5 rounded-lg cursor-pointer"
           
            aria-label="Back"
          >
            <ArrowLeft size={18} weight="bold" />
          </Link>
          <Lightning size={20} weight="bold" />
          <div className="flex-1">
            <h1 className="text-base font-bold">
              {state.templateName}
            </h1>
            <p className="text-xs">
              {state.topic.length > 100 ? state.topic.slice(0, 100) + "..." : state.topic}
            </p>
          </div>

          {isActive && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
              style={{ background: "#ea433520", color: "#ea4335", border: "1px solid #ea433540" }}
            >
              <Stop size={14} weight="fill" />
              Cancel
            </button>
          )}
          <button
            onClick={load}
            className="p-2 rounded-lg cursor-pointer"
            style={{ background: "none", border: "none", color: "var(--color-text-muted)" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={16} />
          </button>
        </div>

        {/* Pipeline visualization */}
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-0">
            {state.steps.map((step, i) => (
              <div key={i} className="flex items-center" style={{ flex: 1 }}>
                {/* Step node */}
                <div
                  className="flex flex-col items-center"
                  style={{ flex: 1, position: "relative" }}
                >
                  {/* Circle */}
                  <div
                    className="flex items-center justify-center rounded-full mb-2"
                    style={{
                      width: 40,
                      height: 40,
                      border: `2px solid ${STEP_STATUS_COLOR[step.status] ?? "var(--color-border)"}`,
                      background:
                        step.status === "running"
                          ? `${STEP_STATUS_COLOR.running}15`
                          : "var(--color-bg-base)",
                    }}
                  >
                    {STEP_STATUS_ICON[step.status]}
                  </div>
                  <span
                    className="text-xs font-semibold"
                   
                  >
                    {step.role}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                  >
                    {step.status}
                  </span>
                </div>
                {/* Arrow */}
                {i < state.steps.length - 1 && (
                  <div
                    style={{
                      width: 32,
                      height: 2,
                      background:
                        step.status === "completed"
                          ? STEP_STATUS_COLOR.completed
                          : "var(--color-border)",
                      flexShrink: 0,
                      marginBottom: 24,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step details */}
        <div className="flex flex-col gap-3">
          {state.steps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl px-4 py-3"
              style={{
                background: "var(--color-bg-card)",
                border: `1px solid ${step.status === "running" ? STEP_STATUS_COLOR.running + "60" : "var(--color-border)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                {STEP_STATUS_ICON[step.status]}
                <span
                  className="text-sm font-semibold"
                 
                >
                  Step {i + 1}: {step.role}
                </span>
                {step.sessionId && (
                  <Link
                    href={`/sessions/${step.sessionId}`}
                    className="text-xs font-mono"
                    style={{ color: "var(--color-accent)", marginLeft: "auto" }}
                  >
                    View session →
                  </Link>
                )}
              </div>
              {step.startedAt && (
                <div className="text-xs">
                  Started: {new Date(step.startedAt).toLocaleTimeString()}
                  {step.completedAt &&
                    ` — Completed: ${new Date(step.completedAt).toLocaleTimeString()}`}
                </div>
              )}
              {step.output && (
                <div
                  className="mt-2 text-xs rounded-lg p-3"
                  style={{
                    background: "var(--color-bg-base)",
                    color: "var(--color-text-secondary)",
                    maxHeight: 120,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {step.output.length > 500 ? step.output.slice(0, 500) + "..." : step.output}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Summary card */}
        <div
          className="rounded-xl px-4 py-3 mt-4"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
        >
          <div
            className="flex items-center gap-4 text-xs"
           
          >
            <span>
              Cost: <strong className="font-mono">${state.totalCostUsd.toFixed(3)}</strong> / $
              {state.costCapUsd.toFixed(2)}
            </span>
            <span>
              Steps: {state.steps.filter((s) => s.status === "completed").length}/
              {state.steps.length}
            </span>
            <span>Started: {new Date(state.startedAt).toLocaleString()}</span>
            {state.completedAt && (
              <span>Completed: {new Date(state.completedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
