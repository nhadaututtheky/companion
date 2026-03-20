"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Plus,
  Trash,
  PencilSimple,
  Lightning,
  FloppyDisk,
  X,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  slug: string;
  projectSlug: string | null;
  prompt: string;
  model: string | null;
  permissionMode: string | null;
  icon: string;
  sortOrder: number;
}

// ── Emoji Picker (simple) ───────────────────────────────────────────────────

const EMOJI_OPTIONS = ["⚡", "🔍", "🔄", "🧪", "📖", "🚀", "🏗️", "🐛", "🔒", "📊", "🎯", "💡"];

// ── Template Form ───────────────────────────────────────────────────────────

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Template;
  onSave: (data: { name: string; prompt: string; icon: string; model: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⚡");
  const [model, setModel] = useState(initial?.model ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) {
      toast.error("Name and prompt are required");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), prompt: prompt.trim(), icon, model: model || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        {/* Icon picker */}
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className="w-8 h-8 rounded-md flex items-center justify-center text-base cursor-pointer transition-all"
              style={{
                background: icon === e ? "var(--color-accent)" : "var(--color-bg-elevated)",
                border: icon === e ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                opacity: icon === e ? 1 : 0.7,
              }}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3">
          {/* Name */}
          <input
            type="text"
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />

          {/* Model override */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          >
            <option value="">Model: project default</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-6">Opus 4.6</option>
            <option value="claude-haiku-4-5">Haiku 4.5</option>
          </select>
        </div>
      </div>

      {/* Prompt */}
      <textarea
        placeholder="Template prompt — this is sent to Claude when you use this template"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={10000}
        rows={4}
        className="w-full px-3 py-2 rounded-lg text-sm resize-y"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
          minHeight: "80px",
        }}
      />

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <X size={14} className="inline mr-1" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || !prompt.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <FloppyDisk size={14} className="inline mr-1" />
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

// ── Template Card ───────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: Template;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${template.name}"?`)) return;
    setDeleting(true);
    try {
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="p-4 rounded-xl transition-all hover:scale-[1.01]"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{template.icon}</span>
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {template.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-text-muted)" }}
              >
                {template.slug}
              </span>
              {template.projectSlug && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {template.projectSlug}
                </span>
              )}
              {template.model && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-accent)",
                  }}
                >
                  {template.model.includes("opus") ? "Opus" : template.model.includes("haiku") ? "Haiku" : "Sonnet"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label={`Edit ${template.name}`}
          >
            <PencilSimple size={14} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
            style={{ color: "var(--color-danger, #ef4444)" }}
            aria-label={`Delete ${template.name}`}
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      <p
        className="text-xs mt-2 line-clamp-2"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {template.prompt}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>();

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.templates.list();
      setTemplates(res.data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async (data: { name: string; prompt: string; icon: string; model: string | null }) => {
    try {
      await api.templates.create({
        name: data.name,
        prompt: data.prompt,
        icon: data.icon,
        model: data.model,
      });
      toast.success("Template created");
      setShowForm(false);
      fetchTemplates();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleUpdate = async (data: { name: string; prompt: string; icon: string; model: string | null }) => {
    if (!editingTemplate) return;
    try {
      await api.templates.update(editingTemplate.id, {
        name: data.name,
        prompt: data.prompt,
        icon: data.icon,
        model: data.model,
      });
      toast.success("Template updated");
      setEditingTemplate(undefined);
      fetchTemplates();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.templates.delete(id);
      toast.success("Template deleted");
      fetchTemplates();
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg-base)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
        style={{
          background: "var(--color-bg-base)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              <Lightning size={20} className="inline mr-1" weight="fill" />
              Templates
            </h1>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              Saved prompts for quick session starts
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingTemplate(undefined);
            setShowForm(!showForm);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <Plus size={14} weight="bold" />
          New Template
        </button>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {/* Create/Edit Form */}
        {(showForm || editingTemplate) && (
          <div
            className="p-5 rounded-xl"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-accent)",
            }}
          >
            <h2
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--color-text-primary)" }}
            >
              {editingTemplate ? "Edit Template" : "New Template"}
            </h2>
            <TemplateForm
              initial={editingTemplate}
              onSave={editingTemplate ? handleUpdate : handleCreate}
              onCancel={() => {
                setShowForm(false);
                setEditingTemplate(undefined);
              }}
            />
          </div>
        )}

        {/* Template List */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--color-text-muted)" }}>
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--color-text-muted)" }}>
            <Lightning size={32} className="mx-auto mb-3 opacity-50" />
            <p>No templates yet</p>
            <p className="text-xs mt-1">Create one above or use /template save in Telegram</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onEdit={() => {
                  setShowForm(false);
                  setEditingTemplate(tpl);
                }}
                onDelete={() => handleDelete(tpl.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
