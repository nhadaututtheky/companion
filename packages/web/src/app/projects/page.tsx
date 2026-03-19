"use client";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Plus,
  ArrowClockwise,
  PencilSimple,
  Trash,
  X,
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

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (slug: string) => void;
}) {
  return (
    <div
      className="flex items-start justify-between p-5 rounded-2xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex gap-4 min-w-0">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 44, height: 44, background: "#4285F415" }}
        >
          <FolderOpen size={22} style={{ color: "#4285F4" }} weight="fill" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold mb-0.5 truncate" style={{ color: "var(--color-text-primary)" }}>
            {project.name}
          </h3>
          <p className="text-xs font-mono truncate mb-2" style={{ color: "var(--color-text-muted)" }}>
            {project.dir}
          </p>
          <div className="flex gap-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
            >
              {project.defaultModel}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)" }}
            >
              {project.permissionMode}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 ml-2">
        <button
          onClick={() => onEdit(project)}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Edit project"
        >
          <PencilSimple size={14} weight="bold" />
        </button>
        <button
          onClick={() => onDelete(project.slug)}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Delete project"
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function ProjectDialog({
  project,
  onClose,
  onSave,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => void;
}) {
  const [form, setForm] = useState<Partial<Project>>(
    project ?? { permissionMode: "default", defaultModel: "claude-sonnet-4-6" },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 p-6 rounded-2xl shadow-lg"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          width: 440,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ fontFamily: "Outfit, sans-serif" }}>
            {project ? "Edit Project" : "New Project"}
          </h2>
          <button type="button" onClick={onClose} style={{ color: "var(--color-text-muted)" }} className="cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {[
          { key: "name", label: "Name", placeholder: "My Project" },
          { key: "slug", label: "Slug", placeholder: "my-project" },
          { key: "dir", label: "Directory", placeholder: "/path/to/project" },
          { key: "defaultModel", label: "Default Model", placeholder: "claude-sonnet-4-6" },
        ].map(({ key, label, placeholder }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
            <input
              type="text"
              value={(form as Record<string, string>)[key] ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          </label>
        ))}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: "#34A853", color: "#fff" }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProject, setEditProject] = useState<Project | null | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.projects.list();
      setProjects((res.data as Project[]) ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
    if (!confirm("Delete this project?")) return;
    try {
      await api.projects.delete(slug);
      toast.success("Project deleted");
      load();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh", background: "var(--color-bg-base)" }}>
      <Header />

      <div className="flex-1 px-6 py-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Outfit, sans-serif", color: "var(--color-text-primary)" }}>
            Projects
          </h1>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Refresh"
            >
              <ArrowClockwise size={16} weight="bold" />
            </button>
            <button
              onClick={() => setEditProject(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer"
              style={{ background: "#34A853", color: "#fff" }}
            >
              <Plus size={14} weight="bold" /> New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--color-bg-card)" }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FolderOpen size={40} style={{ color: "var(--color-text-muted)" }} />
            <p style={{ color: "var(--color-text-muted)" }}>No projects yet</p>
            <button
              onClick={() => setEditProject(null)}
              className="text-sm font-medium cursor-pointer"
              style={{ color: "#4285F4" }}
            >
              Add your first project →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} onEdit={setEditProject} onDelete={handleDelete} />
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
    </div>
  );
}
