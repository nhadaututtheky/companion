"use client";
import { useState } from "react";
import { X, Rocket, Lightning } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { WORKSPACE_TEMPLATES } from "@companion/shared";

const ROLES = [
  { id: "specialist", label: "Specialist", icon: "🔧", desc: "Execute specific tasks" },
  { id: "researcher", label: "Researcher", icon: "🔍", desc: "Research & analyze" },
  { id: "reviewer", label: "Reviewer", icon: "🧪", desc: "Review & verify" },
] as const;

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", desc: "Deep reasoning" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", desc: "Fast & capable" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", desc: "Quick tasks" },
] as const;

interface SpawnAgentModalProps {
  parentSessionId: string;
  parentModel: string;
  open: boolean;
  onClose: () => void;
  onSpawned: (childSessionId: string, childShortId: string, name: string, role: string) => void;
}

export function SpawnAgentModal({
  parentSessionId,
  parentModel,
  open,
  onClose,
  onSpawned,
}: SpawnAgentModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("specialist");
  const [model, setModel] = useState<string>(parentModel);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [spawningTemplate, setSpawningTemplate] = useState<string | null>(null);

  if (!open || typeof document === "undefined") return null;

  const handleSpawnTemplate = async (templateId: string) => {
    const template = WORKSPACE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    setSpawningTemplate(templateId);
    try {
      for (const agent of template.agents) {
        const res = await api.post<{
          success: boolean;
          data: { sessionId: string; shortId: string };
        }>(`/api/sessions/${parentSessionId}/spawn`, {
          name: agent.name,
          role: agent.role,
          model: agent.model,
        });
        onSpawned(res.data.sessionId, res.data.shortId, agent.name, agent.role);
      }
      toast.success(`${template.name} — ${template.agents.length} agents spawned`);
      onClose();
    } catch (err) {
      toast.error(`Template spawn failed: ${String(err)}`);
    } finally {
      setSpawningTemplate(null);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Agent name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { sessionId: string; shortId: string };
      }>(`/api/sessions/${parentSessionId}/spawn`, {
        name: trimmedName,
        role,
        model: model !== parentModel ? model : undefined,
        prompt: prompt.trim() || undefined,
      });

      const { sessionId, shortId } = res.data;
      onSpawned(sessionId, shortId, trimmedName, role);
      toast.success(`Agent @${shortId} spawned`);

      // Reset form
      setName("");
      setPrompt("");
      onClose();
    } catch (err) {
      toast.error(`Spawn failed: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 50, background: "rgba(0,0,0,0.4)", borderRadius: "inherit" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex flex-col gap-4 p-5 overflow-y-auto"
        style={{
          background: "var(--glass-bg-heavy)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-float)",
          width: 400,
          maxWidth: "calc(100% - 24px)",
          maxHeight: "calc(100% - 24px)",
          animation: "slideUpFade 200ms ease forwards",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Rocket size={16} weight="bold" style={{ color: "var(--color-accent)" }} />
            Spawn Agent
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        {/* Quick Templates */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Lightning size={12} weight="bold" /> Quick Templates
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {WORKSPACE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSpawnTemplate(t.id)}
                disabled={!!spawningTemplate}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors text-left disabled:opacity-50"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <span className="text-base">{t.icon}</span>
                <div className="flex flex-col min-w-0">
                  <span
                    className="font-medium truncate"
                    style={{
                      color:
                        spawningTemplate === t.id
                          ? "var(--color-accent)"
                          : "var(--color-text-primary)",
                    }}
                  >
                    {spawningTemplate === t.id ? "Spawning..." : t.name}
                  </span>
                  <span className="truncate" style={{ fontSize: 10 }}>
                    {t.agents.length} agents
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ color: "var(--color-text-muted)" }}>
          <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
          <span className="text-xs">or manual</span>
          <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Agent Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Backend Engineer"
            maxLength={100}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
              color: "var(--color-text-primary)",
            }}
            autoFocus
          />
        </div>

        {/* Role */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Role
          </label>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs cursor-pointer transition-colors"
                style={{
                  background:
                    role === r.id
                      ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                      : "var(--color-bg-elevated)",
                  border:
                    role === r.id
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--glass-border)",
                  color: role === r.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                }}
              >
                <span>{r.icon}</span>
                <span className="font-medium">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Model
          </label>
          <div className="flex gap-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                style={{
                  background:
                    model === m.id
                      ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                      : "var(--color-bg-elevated)",
                  border:
                    model === m.id
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--glass-border)",
                  color: model === m.id ? "var(--color-accent)" : "var(--color-text-secondary)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Initial instructions */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Instructions <span style={{ color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Implement the payment API with Stripe integration"
            rows={3}
            maxLength={10000}
            className="px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--glass-border)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || loading}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <Rocket size={14} weight="bold" />
          {loading ? "Spawning..." : "Spawn Agent"}
        </button>
      </div>
    </div>
  );
}
