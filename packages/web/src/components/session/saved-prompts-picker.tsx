"use client";

import { useState, useEffect, useRef } from "react";
import { Z } from "@/lib/z-index";
import { BookmarkSimple, Plus, X, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface SavedPrompt {
  id: string;
  name: string;
  content: string;
  projectSlug: string | null;
  tags: string[];
}

interface SavedPromptsPickerProps {
  onSelect: (content: string) => void;
  projectSlug?: string;
}

export function SavedPromptsPicker({ onSelect, projectSlug }: SavedPromptsPickerProps) {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    loadPrompts();
  }, [open, projectSlug]); // eslint-disable-line react-hooks/exhaustive-deps -- loadPrompts is stable, depends on projectSlug

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const loadPrompts = async () => {
    try {
      const res = await api.savedPrompts.list(projectSlug);
      setPrompts(res.data);
    } catch {
      /* ignore */
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return;
    setLoading(true);
    try {
      await api.savedPrompts.create({
        name: newName.trim(),
        content: newContent.trim(),
        projectSlug: projectSlug ?? null,
      });
      setNewName("");
      setNewContent("");
      setShowCreate(false);
      await loadPrompts();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.savedPrompts.delete(id);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      /* ignore */
    }
  };

  const filtered = prompts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.content.toLowerCase().includes(q);
  });

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="border-border flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all hover:brightness-110"
        style={{
          background: open ? "var(--color-accent)" : "var(--color-bg-elevated)",
          color: open ? "#fff" : "var(--color-text-secondary)",
        }}
        aria-label="Saved prompts"
        title="Saved prompts"
      >
        <BookmarkSimple size={12} weight={open ? "fill" : "bold"} />
        Prompts
      </button>

      {open && (
        <div
          className="bg-bg-card absolute bottom-full left-0 mb-2 flex overflow-hidden rounded-xl shadow-lg"
          style={{
            width: 340,
            maxHeight: 420,
            boxShadow: "var(--shadow-lg)",
            zIndex: Z.popover,
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ boxShadow: "0 1px 0 var(--color-border)" }}
          >
            <span className="text-text-primary text-xs font-semibold">Saved Prompts</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="cursor-pointer rounded p-1 hover:brightness-110"
                style={{
                  background: showCreate ? "var(--color-accent)" : "transparent",
                  color: showCreate ? "#fff" : "var(--color-text-muted)",
                }}
                aria-label="New prompt"
              >
                {showCreate ? <X size={14} /> : <Plus size={14} weight="bold" />}
              </button>
            </div>
          </div>

          {/* Create form */}
          {showCreate && (
            <div
              className="space-y-2 px-3 py-2"
              style={{ boxShadow: "0 1px 0 var(--color-border)" }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Prompt name..."
                className="text-text-primary bg-bg-elevated border-border w-full rounded-md px-2 py-1.5 text-xs outline-none"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Prompt content..."
                rows={3}
                className="text-text-primary bg-bg-elevated border-border w-full resize-none rounded-md px-2 py-1.5 text-xs outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim() || !newContent.trim()}
                className="w-full cursor-pointer rounded-md py-1.5 text-xs font-medium disabled:opacity-40"
                style={{
                  background: "var(--color-accent)",
                  color: "#fff",
                }}
              >
                {loading ? "Saving..." : "Save Prompt"}
              </button>
            </div>
          )}

          {/* Search */}
          {prompts.length > 3 && (
            <div className="px-3 py-2" style={{ boxShadow: "0 1px 0 var(--color-border)" }}>
              <div className="shadow-soft bg-bg-elevated flex items-center gap-1.5 rounded-md px-2 py-1">
                <MagnifyingGlass size={12} className="text-text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prompts..."
                  className="text-text-primary flex-1 bg-transparent text-xs outline-none"
                />
              </div>
            </div>
          )}

          {/* Prompt list */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-text-muted text-xs">
                  {prompts.length === 0 ? "No saved prompts yet" : "No matches"}
                </p>
              </div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  className="group flex cursor-pointer items-start gap-2 px-3 py-2 transition-colors"
                  style={{ boxShadow: "0 1px 0 var(--color-border)" }}
                  onClick={() => {
                    onSelect(p.content);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-primary truncate text-xs font-medium">
                        {p.name}
                      </span>
                      {p.projectSlug && (
                        <span className="text-text-muted bg-bg-elevated rounded px-1 py-0.5 text-[10px]">
                          {p.projectSlug}
                        </span>
                      )}
                    </div>
                    <p className="text-text-muted mt-0.5 line-clamp-2 text-[11px]">{p.content}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="text-text-muted cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
