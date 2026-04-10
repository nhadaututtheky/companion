"use client";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Rocket, X, PencilSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { BUILT_IN_PERSONAS, type Persona } from "@companion/shared";
import { PersonaAvatar } from "@/components/persona/persona-avatar";
import { api } from "@/lib/api-client";
import { useUiStore } from "@/lib/stores/ui-store";

interface TemplateItem {
  id: string;
  name: string;
  slug: string;
  icon: string;
  prompt: string;
  model: string | null;
  projectSlug: string | null;
}

export function TemplateQuickPicker() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const setNewSessionModalOpen = useUiStore((s) => s.setNewSessionModalOpen);
  const router = useRouter();

  // Lazy-load custom templates on first open
  useEffect(() => {
    if (!open || loaded) return;
    setLoading(true);
    api.templates
      .list()
      .then((res) => {
        setTemplates((res.data ?? []) as TemplateItem[]);
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, loaded]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleSelectPersona = useCallback(
    (persona: Persona) => {
      setOpen(false);
      setNewSessionModalOpen(true, persona.id);
    },
    [setNewSessionModalOpen],
  );

  const handleSelectTemplate = useCallback(
    (_tpl: TemplateItem) => {
      setOpen(false);
      setNewSessionModalOpen(true);
    },
    [setNewSessionModalOpen],
  );

  return (
    <>
      {/* Header button */}
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-medium transition-all cursor-pointer min-h-[44px] flex items-center gap-1"
        style={{
          borderRadius: "var(--radius-md)",
          background: "transparent",
          color: "var(--color-text-secondary)",
          border: "1px solid transparent",
        }}
        aria-label="Expert Modes"
        title="Expert Modes & Quick Start"
      >
        Expert
      </button>

      {/* Modal — portal to body to escape header's backdrop-filter containing block */}
      {open && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              zIndex: 100,
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(640px, 90vw)",
              maxHeight: "80vh",
              zIndex: 101,
              borderRadius: "var(--radius-xl)",
              background: "var(--color-bg-card)",
              border: "1px solid var(--glass-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              className="px-5 py-3 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: "1px solid var(--glass-border)" }}
            >
              <div className="flex items-center gap-2">
                <Rocket size={18} weight="bold" style={{ color: "#4285F4" }} />
                <h2 className="text-sm font-semibold">Expert Modes</h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {BUILT_IN_PERSONAS.length} experts
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    router.push("/templates");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--glass-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <PencilSimple size={12} weight="bold" aria-hidden="true" />
                  Manage
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg cursor-pointer transition-colors"
                  style={{ color: "var(--color-text-muted)" }}
                  aria-label="Close expert modes"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Built-in personas */}
              <div className="grid grid-cols-2 gap-2">
                {BUILT_IN_PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    onClick={() => handleSelectPersona(persona)}
                    className="flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all"
                    style={{
                      background: "var(--color-bg-elevated)",
                      border: "1px solid var(--glass-border)",
                    }}
                    title={persona.strength}
                  >
                    <PersonaAvatar persona={persona} size={36} showBadge={false} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {persona.icon} {persona.name}
                      </span>
                      <span
                        className="text-xs truncate"
                        style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                      >
                        {persona.strength}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom templates */}
              {(loading || templates.length > 0) && (
                <div className="mt-4">
                  <span
                    className="text-xs font-semibold mb-2 block"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Custom Prompts
                  </span>

                  {loading && (
                    <div className="py-4 text-center">
                      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                        Loading...
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => handleSelectTemplate(tpl)}
                        className="flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all"
                        style={{
                          background: "var(--color-bg-elevated)",
                          border: "1px solid var(--glass-border)",
                        }}
                      >
                        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                          {tpl.icon || "\uD83D\uDCDD"}
                        </span>
                        <span
                          className="text-xs font-medium truncate"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {tpl.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
