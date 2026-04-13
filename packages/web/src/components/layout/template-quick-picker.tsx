"use client";
import { useState, useEffect, useCallback } from "react";
import { Z } from "@/lib/z-index";
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
        className="text-text-secondary flex min-h-[44px] cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
        style={{
          background: "transparent",
          border: "1px solid transparent",
        }}
        aria-label="Expert Modes"
        title="Expert Modes & Quick Start"
      >
        Expert
      </button>

      {/* Modal — portal to body to escape header's backdrop-filter containing block */}
      {open &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "var(--overlay-medium)",
                backdropFilter: "blur(var(--glass-blur-sm))",
                zIndex: Z.overlay,
              }}
            />

            {/* Panel */}
            <div
              className="bg-bg-card shadow-soft flex overflow-hidden rounded-xl"
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "min(640px, 90vw)",
                maxHeight: "80vh",
                zIndex: Z.overlayContent,
                boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div
                className="flex flex-shrink-0 items-center justify-between px-5 py-3"
                style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
              >
                <div className="flex items-center gap-2">
                  <Rocket size={18} weight="bold" style={{ color: "#4285F4" }} />
                  <h2 className="text-sm font-semibold">Expert Modes</h2>
                  <span className="text-text-muted bg-bg-elevated rounded-full px-2 py-0.5 text-xs">
                    {BUILT_IN_PERSONAS.length} experts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/templates");
                    }}
                    className="text-text-secondary bg-bg-elevated shadow-soft flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    <PencilSimple size={12} weight="bold" aria-hidden="true" />
                    Manage
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-text-muted cursor-pointer rounded-lg p-1.5 transition-colors"
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
                      className="bg-bg-elevated shadow-soft flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-all"
                      title={persona.strength}
                    >
                      <PersonaAvatar persona={persona} size={36} showBadge={false} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="text-text-primary truncate text-xs font-semibold">
                          {persona.icon} {persona.name}
                        </span>
                        <span className="text-text-muted truncate text-xs" style={{ fontSize: 10 }}>
                          {persona.strength}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Custom templates */}
                {(loading || templates.length > 0) && (
                  <div className="mt-4">
                    <span className="text-text-muted mb-2 block text-xs font-semibold">
                      Custom Prompts
                    </span>

                    {loading && (
                      <div className="py-4 text-center">
                        <span className="text-text-muted text-xs">Loading...</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => handleSelectTemplate(tpl)}
                          className="bg-bg-elevated shadow-soft flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-all"
                        >
                          <span className="shrink-0" style={{ fontSize: 20, lineHeight: 1 }}>
                            {tpl.icon || "\uD83D\uDCDD"}
                          </span>
                          <span className="text-text-primary truncate text-xs font-medium">
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
