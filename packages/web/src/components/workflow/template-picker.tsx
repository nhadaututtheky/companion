"use client";

import { useState, useEffect, useCallback } from "react";
import { X, CircleNotch, Play, ListBullets, Lightning } from "@phosphor-icons/react";
import { Z } from "@/lib/z-index";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface Step {
  role: string;
  label: string;
  promptTemplate: string;
  order: number;
  model?: string;
}

interface Template {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: string;
  steps: Step[];
  isBuiltIn: boolean;
  defaultCostCapUsd: number | null;
}

interface TemplatePickerProps {
  onClose: () => void;
  onStarted?: (channelId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  review: "Review",
  build: "Build",
  test: "Test",
  deploy: "Deploy",
  custom: "Custom",
};

export function TemplatePicker({ onClose, onStarted }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [topic, setTopic] = useState("");
  const [costCap, setCostCap] = useState(1.0);
  const [starting, setStarting] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.workflowTemplates.list();
      setTemplates(res.data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleStart = async () => {
    if (!selected || !topic.trim()) return;
    setStarting(true);
    try {
      const res = await api.workflows.start({
        templateId: selected.id,
        topic: topic.trim(),
        costCapUsd: costCap,
      });
      toast.success("Workflow started");
      onStarted?.(res.data.channelId);
      onClose();
    } catch (err) {
      toast.error(`Failed: ${err}`);
    } finally {
      setStarting(false);
    }
  };

  // Group by category
  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const cat = t.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div
      className="flex" style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.overlay,
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-bg-card border border-border overflow-hidden flex" style={{
          borderRadius: 16,
          width: 640,
          maxHeight: "80vh",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <Lightning size={20} weight="bold" />
          <h2 className="text-base font-bold flex-1">
            {selected ? "Configure Workflow" : "Start Workflow"}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted cursor-pointer" style={{
              background: "none",
              border: "none",
              }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <CircleNotch
                size={24}
                className="text-text-muted" style={{ animation: "spin 1s linear infinite" }}
              />
            </div>
          ) : !selected ? (
            /* Template grid */
            <div>
              {Object.entries(grouped).map(([category, tmpls]) => (
                <div key={category} className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2">
                    {CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
                  >
                    {tmpls.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelected(t);
                          setCostCap(t.defaultCostCapUsd ?? 1.0);
                        }}
                        className="flex flex-col text-left p-3 rounded-xl cursor-pointer transition-colors bg-bg-base border border-border"
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "var(--color-accent)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor =
                            "var(--color-border)";
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ fontSize: 18 }}>{t.icon}</span>
                          <span className="text-sm font-semibold">{t.name}</span>
                        </div>
                        <span
                          className="text-xs text-text-muted" style={{ lineHeight: 1.3 }}
                        >
                          {t.description}
                        </span>
                        <div className="flex items-center gap-1 mt-2">
                          <ListBullets size={11} />
                          <span className="text-xs">
                            {t.steps.length} steps: {t.steps.map((s) => s.label).join(" → ")}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Configuration form */
            <div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs mb-4 cursor-pointer text-accent" style={{ background: "none", border: "none" }}
              >
                ← Back to templates
              </button>

              <div className="flex items-center gap-2 mb-4">
                <span style={{ fontSize: 24 }}>{selected.icon}</span>
                <div>
                  <h3 className="text-sm font-bold">{selected.name}</h3>
                  <p className="text-xs">{selected.description}</p>
                </div>
              </div>

              {/* Steps preview */}
              <div className="flex items-center gap-2 mb-4 overflow-x-auto">
                {selected.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span
                      className="text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap text-text-secondary bg-bg-elevated"
                    >
                      {s.label}
                    </span>
                    {i < selected.steps.length - 1 && (
                      <span className="text-text-muted" style={{ fontSize: 12 }}>→</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Topic */}
              <label className="block mb-1 text-xs font-medium">Topic / Description *</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe the task, bug, or feature..."
                rows={3}
                className="text-text-primary bg-bg-base border border-border" style={{
                  width: "100%",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                  marginBottom: 12,
                }}
              />

              {/* Cost cap */}
              <label className="block mb-1 text-xs font-medium">
                Cost Cap: ${costCap.toFixed(2)}
              </label>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={costCap}
                onChange={(e) => setCostCap(parseFloat(e.target.value))}
                style={{ width: "100%", marginBottom: 16 }}
                aria-label="Cost cap"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {selected && (
          <div className="px-5 py-3" style={{ borderTop: "1px solid var(--color-border)" }}>
            <button
              onClick={handleStart}
              disabled={!topic.trim() || starting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              style={{
                background:
                  !topic.trim() || starting ? "var(--color-bg-elevated)" : "var(--color-accent)",
                color: !topic.trim() || starting ? "var(--color-text-muted)" : "#fff",
                border: "none",
              }}
            >
              {starting ? (
                <CircleNotch size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Play size={16} weight="fill" />
              )}
              Start Workflow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
