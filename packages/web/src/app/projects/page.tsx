"use client";
import { useEffect, useState } from "react";
import { useFetch } from "@/hooks/use-fetch";
import {
  FolderOpen,
  Plus,
  ArrowClockwise,
  PencilSimple,
  Trash,
  X,
  TelegramLogo,
  Copy,
  Check,
  Warning,
} from "@phosphor-icons/react";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface Project {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
}

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (recommended)" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

const PERMISSION_MODES = [
  { value: "default", label: "Default — ask before risky actions" },
  { value: "plan", label: "Plan — read-only, no writes" },
  { value: "auto-edit", label: "Auto-edit — auto-approve file edits" },
  { value: "full-auto", label: "Full auto — approve everything" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Project Card ─────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyDir = () => {
    navigator.clipboard.writeText(project.dir);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const modelLabel =
    MODELS.find((m) => m.value === project.defaultModel)?.label.split(" (")[0] ??
    project.defaultModel;

  return (
    <div className="shadow-soft bg-bg-card flex items-start justify-between gap-4 rounded-2xl p-4 transition-all">
      <div className="flex min-w-0 gap-4">
        <div
          className="flex flex-shrink-0 items-center justify-center rounded-xl"
          style={{ width: 44, height: 44, background: "#4285F415" }}
        >
          <FolderOpen size={22} style={{ color: "#4285F4" }} weight="fill" />
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 truncate text-sm font-semibold">{project.name}</h3>
          <div className="group mb-2 flex items-center gap-1">
            <p className="truncate font-mono text-xs">{project.dir}</p>
            <button
              onClick={copyDir}
              className="cursor-pointer p-1 opacity-50 transition-opacity hover:opacity-100 group-hover:opacity-100"
              aria-label="Copy directory path"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <div className="flex gap-2">
            <span className="text-text-secondary bg-bg-elevated rounded-full px-2 py-1 text-xs">
              {modelLabel}
            </span>
            <span className="text-text-secondary bg-bg-elevated rounded-full px-2 py-1 text-xs">
              {project.permissionMode}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => onEdit(project)}
          className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-[var(--color-bg-elevated)]"
          aria-label="Edit project"
        >
          <PencilSimple size={14} weight="bold" />
        </button>
        <button
          onClick={onDelete}
          className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-[var(--color-bg-elevated)]"
          aria-label="Delete project"
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

// ── Project Dialog ───────────────────────────────────────────────────────

function ProjectDialog({
  project,
  onClose,
  onSave,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => void;
}) {
  const isEdit = project !== null;
  const [form, setForm] = useState<Partial<Project>>(
    project ?? { permissionMode: "default", defaultModel: "claude-sonnet-4-6" },
  );
  const [autoSlug, setAutoSlug] = useState(!isEdit);

  const updateField = (key: string, value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "name" && autoSlug) {
        next.slug = slugify(value);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.dir?.trim()) {
      toast.error("Name and Directory are required");
      return;
    }
    if (!form.slug?.trim()) {
      toast.error("Slug is required");
      return;
    }
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--overlay-light)" }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-bg-card flex w-full max-w-md flex-col gap-4 rounded-2xl p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ fontFamily: "Outfit, sans-serif" }}>
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
          <button type="button" onClick={onClose} className="cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Name */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">
            Name <span style={{ color: "#ef4444" }}>*</span>
          </span>
          <input
            type="text"
            value={form.name ?? ""}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="My Awesome Project"
            className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
        </label>

        {/* Slug */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">
            Slug
            {autoSlug && <span className="ml-1 text-[10px]">(auto from name)</span>}
          </span>
          <input
            type="text"
            value={form.slug ?? ""}
            onChange={(e) => {
              setAutoSlug(false);
              setForm((f) => ({ ...f, slug: e.target.value }));
            }}
            placeholder="my-awesome-project"
            disabled={isEdit}
            className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm disabled:opacity-50"
          />
        </label>

        {/* Directory */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">
            Project Directory <span style={{ color: "#ef4444" }}>*</span>
          </span>
          <input
            type="text"
            value={form.dir ?? ""}
            onChange={(e) => updateField("dir", e.target.value)}
            placeholder="/home/user/projects/my-project"
            className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm"
          />
          <span className="text-[11px]">Absolute path to the project folder on this machine</span>
        </label>

        {/* Model */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Default Model</span>
          <select
            value={form.defaultModel ?? "claude-sonnet-4-6"}
            onChange={(e) => updateField("defaultModel", e.target.value)}
            className="input-bordered text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-3 py-2 text-sm"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Permission Mode */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Permission Mode</span>
          <select
            value={form.permissionMode ?? "default"}
            onChange={(e) => updateField("permissionMode", e.target.value)}
            className="input-bordered text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-3 py-2 text-sm"
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 cursor-pointer rounded-xl py-2 text-sm font-semibold"
            style={{ background: "#34A853", color: "#fff" }}
          >
            {isEdit ? "Update" : "Create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary bg-bg-elevated border-border flex-1 cursor-pointer rounded-xl border py-2 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────

function DeleteConfirmDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--overlay-light)" }}
      onClick={onCancel}
    >
      <div
        className="bg-bg-card flex w-full max-w-sm flex-col gap-4 rounded-2xl p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-xl"
            style={{ width: 40, height: 40, background: "#ef444415" }}
          >
            <Warning size={20} style={{ color: "#ef4444" }} weight="fill" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Delete project</h3>
            <p className="mt-0.5 text-xs">This will also remove it from Telegram.</p>
          </div>
        </div>

        <p className="text-sm">
          Are you sure you want to delete <strong>{projectName}</strong>?
        </p>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 cursor-pointer rounded-xl py-2 text-sm font-semibold"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="text-text-secondary bg-bg-elevated border-border flex-1 cursor-pointer rounded-xl border py-2 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [editProject, setEditProject] = useState<Project | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const {
    data,
    loading,
    run: load,
  } = useFetch<Project[]>(
    async () => {
      const res = await api.projects.list();
      return (res.data as Project[]) ?? [];
    },
    { initialLoading: true, initialData: [] },
  );
  const projects = data ?? [];

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (data: Partial<Project>) => {
    try {
      const slug = data.slug ?? editProject?.slug ?? "";
      await api.projects.upsert(slug, data);
      toast.success(editProject ? "Project updated" : "Project created");
      setEditProject(undefined);
      load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDelete = async (slug: string) => {
    try {
      await api.projects.delete(slug);
      toast.success("Project deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="bg-bg-base flex flex-col" style={{ minHeight: "100vh" }}>
      <Header />

      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="text-text-primary text-2xl font-bold"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Projects
          </h1>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-[var(--color-bg-elevated)]"
              aria-label="Refresh"
            >
              <ArrowClockwise size={16} weight="bold" />
            </button>
            <button
              onClick={() => setEditProject(null)}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: "#34A853", color: "#fff" }}
            >
              <Plus size={14} weight="bold" /> New Project
            </button>
          </div>
        </div>

        {/* Telegram sync info banner */}
        <div className="bg-bg-elevated mb-4 flex items-start gap-3 rounded-xl p-4 shadow-sm">
          <TelegramLogo
            size={20}
            weight="fill"
            className="shrink-0"
            style={{ color: "#29B6F6", marginTop: 1 }}
          />
          <p className="text-xs leading-relaxed">
            Projects you add here will automatically appear in your Telegram bot&apos;s{" "}
            <code className="bg-bg-card rounded px-1 py-0.5 text-[11px]">/start</code> menu.
            Removing a project here removes it from Telegram too.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-bg-card h-24 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="shadow-soft bg-bg-card flex flex-col items-center justify-center gap-4 rounded-2xl py-16">
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{ width: 64, height: 64, background: "#4285F410" }}
            >
              <FolderOpen size={32} style={{ color: "#4285F4" }} weight="duotone" />
            </div>
            <div className="text-center">
              <p className="mb-1 text-sm font-semibold">No projects yet</p>
              <p className="max-w-xs text-xs">
                Add your project folders to start Claude Code sessions from both the web UI and
                Telegram.
              </p>
            </div>
            <button
              onClick={() => setEditProject(null)}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ background: "#4285F4", color: "#fff" }}
            >
              <Plus size={14} weight="bold" /> Add First Project
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.slug}
                project={p}
                onEdit={setEditProject}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}
          </div>
        )}
      </div>

      {editProject !== undefined && (
        <ProjectDialog
          project={editProject}
          onClose={() => setEditProject(undefined)}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          projectName={deleteTarget.name}
          onConfirm={() => handleDelete(deleteTarget.slug)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
