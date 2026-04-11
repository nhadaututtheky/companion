"use client";
import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, FolderSimple, CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAnimatePresence } from "@/lib/animation";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { api } from "@/lib/api-client";
import type { CLIPlatform, ProjectProfile } from "@companion/shared";

const CLI_OPTIONS: Array<{ id: CLIPlatform; label: string }> = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "opencode", label: "OpenCode" },
];

interface WorkspaceCreateModalProps {
  open: boolean;
  onClose: () => void;
}

export function WorkspaceCreateModal({ open, onClose }: WorkspaceCreateModalProps) {
  const { shouldRender, animationState } = useAnimatePresence(open);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  const [name, setName] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [cliSlots, setCliSlots] = useState<CLIPlatform[]>(["claude"]);
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setProjectSlug("");
    setCliSlots(["claude"]);
    setLoadingProjects(true);
    api.projects
      .list()
      .then((res) => {
        const items = (res.data ?? []) as ProjectProfile[];
        setProjects(items);
        if (items.length > 0) setProjectSlug(items[0]!.slug);
      })
      .catch(() => toast.error("Failed to load projects"))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  const toggleCli = useCallback((cli: CLIPlatform) => {
    setCliSlots((prev) =>
      prev.includes(cli) ? prev.filter((c) => c !== cli) : [...prev, cli],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !projectSlug || cliSlots.length === 0) return;
    setCreating(true);
    try {
      const ws = await createWorkspace({
        name: name.trim(),
        projectSlug,
        cliSlots,
      });
      if (ws) {
        toast.success(`Workspace "${ws.name}" created`);
        setActiveWorkspace(ws.id);
        onClose();
      }
    } catch {
      toast.error("Failed to create workspace");
    } finally {
      setCreating(false);
    }
  }, [name, projectSlug, cliSlots, createWorkspace, setActiveWorkspace, onClose]);

  if (!shouldRender) return null;

  const canCreate = name.trim().length > 0 && projectSlug && cliSlots.length > 0;
  const selectedProject = projects.find((p) => p.slug === projectSlug);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        opacity: animationState === "entering" || animationState === "entered" ? 1 : 0,
        transition: "opacity 250ms ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create Workspace"
    >
      <div
        className="flex flex-col w-full max-w-md max-h-[85vh] rounded-2xl overflow-hidden"
        style={{
          background: "var(--color-bg-base)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h2 className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
            Create Workspace
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close dialog"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="ws-name"
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Workspace Name
            </label>
            <input
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Companion Dev"
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              autoFocus
            />
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="ws-project"
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Project
            </label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 py-2">
                <CircleNotch size={14} className="animate-spin" style={{ color: "var(--color-text-muted)" }} />
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  Loading projects...
                </span>
              </div>
            ) : projects.length === 0 ? (
              <p className="text-xs py-2" style={{ color: "var(--color-text-muted)" }}>
                No projects configured. Create a session first.
              </p>
            ) : (
              <select
                id="ws-project"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm cursor-pointer"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            )}
            {selectedProject && (
              <span className="flex items-center gap-1 text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                <FolderSimple size={10} weight="bold" />
                {selectedProject.dir}
              </span>
            )}
          </div>

          {/* CLI Slots */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-secondary)" }}
            >
              CLI Agents
            </label>
            <div className="flex flex-wrap gap-2">
              {CLI_OPTIONS.map((cli) => {
                const selected = cliSlots.includes(cli.id);
                return (
                  <button
                    key={cli.id}
                    onClick={() => toggleCli(cli.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                    style={{
                      background: selected
                        ? "var(--color-primary, #6366f1)"
                        : "var(--color-bg-card)",
                      color: selected ? "#fff" : "var(--color-text-secondary)",
                      border: `1px solid ${selected ? "transparent" : "var(--color-border)"}`,
                    }}
                    type="button"
                  >
                    {cli.label}
                  </button>
                );
              })}
            </div>
            {cliSlots.length === 0 && (
              <span className="text-[10px]" style={{ color: "var(--color-danger, #ef4444)" }}>
                Select at least one CLI agent
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
            style={{
              color: "var(--color-text-secondary)",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
            style={{
              background: canCreate && !creating ? "var(--color-primary, #6366f1)" : "var(--color-bg-elevated)",
              color: canCreate && !creating ? "#fff" : "var(--color-text-muted)",
              opacity: canCreate && !creating ? 1 : 0.5,
            }}
          >
            {creating ? (
              <CircleNotch size={14} className="animate-spin" />
            ) : (
              <Plus size={14} weight="bold" />
            )}
            Create Workspace
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
