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
import { BUILT_IN_PERSONAS, type Persona, type PersonaCategory } from "@companion/shared";
import { PersonaAvatar } from "@/components/persona/persona-avatar";
import { PersonaTooltip } from "@/components/persona/persona-tooltip";
import { PersonaBuilder, type PersonaFormData } from "@/components/persona/persona-builder";

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
  onSave: (data: {
    name: string;
    prompt: string;
    icon: string;
    model: string | null;
  }) => Promise<void>;
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
                border:
                  icon === e ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
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
            <h3 className="text-sm font-semibold truncate">{template.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono">{template.slug}</span>
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
                  {template.model.includes("opus")
                    ? "Opus"
                    : template.model.includes("haiku")
                      ? "Haiku"
                      : "Sonnet"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md cursor-pointer transition-colors"
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

      <p className="text-xs mt-2 line-clamp-2">{template.prompt}</p>
    </div>
  );
}

// ── Persona Section ─────────────────────────────────────────────────────────

const CATEGORY_ORDER: PersonaCategory[] = ["leader", "engineer", "wildcard"];
const CATEGORY_META: Record<string, { label: string; description: string }> = {
  leader: { label: "Tech Leaders", description: "Think like industry visionaries" },
  engineer: { label: "Engineering Roles", description: "Specialized technical perspectives" },
  wildcard: { label: "Wild Cards", description: "Unconventional review angles" },
};

function PersonaCard({ persona, onClone }: { persona: Persona; onClone?: (id: string) => void }) {
  return (
    <PersonaTooltip persona={persona} placement="bottom">
      <div
        className="flex items-center gap-3 p-3 rounded-xl persona-card w-full group"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <PersonaAvatar persona={persona} size={40} />
        <div className="flex flex-col flex-1 min-w-0">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {persona.name}
          </span>
          <span className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
            {persona.strength}
          </span>
        </div>
        {onClone && persona.builtIn && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClone(persona.id);
            }}
            className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-all flex-shrink-0"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-secondary)",
            }}
            aria-label={`Clone ${persona.name}`}
          >
            Clone
          </button>
        )}
      </div>
    </PersonaTooltip>
  );
}

function PersonaSection({ onClone }: { onClone?: (id: string) => void }) {
  return (
    <div className="space-y-5">
      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat]!;
        const personas = BUILT_IN_PERSONAS.filter((p) => p.category === cat);
        if (personas.length === 0) return null;

        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2.5">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {meta.label}
              </h2>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {meta.description}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {personas.map((p) => (
                <PersonaCard key={p.id} persona={p} onClone={onClone} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom Persona Cards ───────────────────────────────────────────────────

function CustomPersonaCard({
  persona,
  onEdit,
  onDelete,
}: {
  persona: Persona;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${persona.name}"?`)) return;
    setDeleting(true);
    onDelete();
    setDeleting(false);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl group"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      <PersonaAvatar persona={persona} size={40} />
      <div className="flex flex-col flex-1 min-w-0">
        <span
          className="text-sm font-semibold truncate"
          style={{ color: "var(--color-text-primary)" }}
        >
          {persona.name} {persona.icon}
        </span>
        <span className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
          {persona.title}
        </span>
      </div>
      <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: "var(--color-text-muted)" }}
          aria-label={`Edit ${persona.name}`}
        >
          <PencilSimple size={14} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-md cursor-pointer transition-colors"
          style={{ color: "var(--color-danger, #ef4444)" }}
          aria-label={`Delete ${persona.name}`}
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | undefined>();

  // Custom personas state
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | undefined>();
  const [savingPersona, setSavingPersona] = useState(false);

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

  const fetchCustomPersonas = useCallback(async () => {
    try {
      const res = await api.customPersonas.list();
      setCustomPersonas(res.data);
    } catch {
      // Silently fail — custom personas are optional
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchCustomPersonas();
  }, [fetchTemplates, fetchCustomPersonas]);

  const handleSavePersona = useCallback(
    async (data: PersonaFormData) => {
      setSavingPersona(true);
      try {
        if (editingPersona) {
          await api.customPersonas.update(editingPersona.id, data);
          toast.success("Persona updated");
        } else {
          await api.customPersonas.create(data);
          toast.success("Persona created");
        }
        setShowBuilder(false);
        setEditingPersona(undefined);
        fetchCustomPersonas();
      } catch (err) {
        toast.error(String(err));
      } finally {
        setSavingPersona(false);
      }
    },
    [editingPersona, fetchCustomPersonas],
  );

  const handleDeletePersona = useCallback(
    async (id: string) => {
      try {
        await api.customPersonas.delete(id);
        toast.success("Persona deleted");
        fetchCustomPersonas();
      } catch {
        toast.error("Failed to delete persona");
      }
    },
    [fetchCustomPersonas],
  );

  const handleCloneBuiltIn = useCallback(
    async (builtInId: string) => {
      try {
        const res = await api.customPersonas.clone(builtInId);
        toast.success(`Cloned as "${res.data.name}"`);
        fetchCustomPersonas();
        // Open editor for the cloned persona
        setEditingPersona(res.data);
        setShowBuilder(true);
      } catch (err) {
        toast.error(String(err));
      }
    },
    [fetchCustomPersonas],
  );

  const handleCreate = async (data: {
    name: string;
    prompt: string;
    icon: string;
    model: string | null;
  }) => {
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

  const handleUpdate = async (data: {
    name: string;
    prompt: string;
    icon: string;
    model: string | null;
  }) => {
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
    <div className="min-h-screen">
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
        style={{
          background: "var(--color-bg-base)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg transition-colors" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">
              <Lightning size={20} className="inline mr-1" weight="fill" />
              Expert Modes
            </h1>
            <p className="text-xs">Personas that change how Claude thinks, not just what it does</p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingPersona(undefined);
            setShowBuilder(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
          style={{
            background: "var(--color-accent)",
            color: "#fff",
          }}
        >
          <Plus size={14} weight="bold" />
          Create Persona
        </button>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {/* Persona Builder (modal-like inline) */}
        {showBuilder && (
          <PersonaBuilder
            initial={
              editingPersona
                ? {
                    name: editingPersona.name,
                    icon: editingPersona.icon,
                    title: editingPersona.title,
                    intro: editingPersona.intro,
                    systemPrompt: editingPersona.systemPrompt,
                    mentalModels: editingPersona.mentalModels,
                    decisionFramework: editingPersona.decisionFramework,
                    redFlags: editingPersona.redFlags,
                    communicationStyle: editingPersona.communicationStyle,
                    blindSpots: editingPersona.blindSpots,
                    bestFor: editingPersona.bestFor,
                    strength: editingPersona.strength,
                    avatarGradient: editingPersona.avatarGradient,
                    avatarInitials: editingPersona.avatarInitials,
                  }
                : undefined
            }
            editing={!!editingPersona}
            onSave={handleSavePersona}
            onCancel={() => {
              setShowBuilder(false);
              setEditingPersona(undefined);
            }}
            saving={savingPersona}
          />
        )}

        {/* Custom Personas */}
        {customPersonas.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Your Custom Personas
              </h2>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {customPersonas.length}/50
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {customPersonas.map((p) => (
                <CustomPersonaCard
                  key={p.id}
                  persona={p}
                  onEdit={() => {
                    setEditingPersona(p);
                    setShowBuilder(true);
                  }}
                  onDelete={() => handleDeletePersona(p.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Built-in Expert Modes */}
        <PersonaSection onClone={handleCloneBuiltIn} />

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
            Custom Prompts
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
        </div>

        {/* Create/Edit Template Form */}
        {(showForm || editingTemplate) && (
          <div
            className="p-5 rounded-xl"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-accent)",
            }}
          >
            <h2 className="text-sm font-semibold mb-3">
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
          <div className="text-center py-12">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
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
