"use client";

import { useState, useEffect, useRef } from "react";
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
  }, [open, projectSlug]);

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
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer hover:brightness-110"
        style={{
          background: open ? "var(--color-accent)" : "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
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
          className="absolute bottom-full left-0 mb-2 rounded-xl overflow-hidden"
          style={{
            width: 340,
            maxHeight: 420,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Saved Prompts
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="p-1 rounded cursor-pointer hover:brightness-110"
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
              className="px-3 py-2 space-y-2"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Prompt name..."
                className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Prompt content..."
                rows={3}
                className="w-full px-2 py-1.5 rounded-md text-xs outline-none resize-none"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                onClick={handleCreate}
                disabled={loading || !newName.trim() || !newContent.trim()}
                className="w-full py-1.5 rounded-md text-xs font-medium cursor-pointer disabled:opacity-40"
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
            <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <MagnifyingGlass size={12} style={{ color: "var(--color-text-muted)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search prompts..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "var(--color-text-primary)" }}
                />
              </div>
            </div>
          )}

          {/* Prompt list */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {prompts.length === 0 ? "No saved prompts yet" : "No matches"}
                </p>
              </div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors"
                  style={{ borderBottom: "1px solid var(--color-border)" }}
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {p.name}
                      </span>
                      {p.projectSlug && (
                        <span
                          className="text-[10px] px-1 py-0.5 rounded"
                          style={{
                            background: "var(--color-bg-elevated)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {p.projectSlug}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[11px] mt-0.5 line-clamp-2"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {p.content}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ color: "var(--color-text-muted)" }}
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
