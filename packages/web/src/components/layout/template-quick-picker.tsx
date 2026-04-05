"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Rocket, CaretDown, Lightning } from "@phosphor-icons/react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setNewSessionModalOpen = useUiStore((s) => s.setNewSessionModalOpen);

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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
    (_persona: Persona) => {
      setOpen(false);
      // TODO: Phase 2 — open NewSessionModal with persona pre-selected
      setNewSessionModalOpen(true);
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

  // Show top 6 personas (2 per category)
  const quickPersonas = BUILT_IN_PERSONAS.filter(
    (p) => ["tim-cook", "elon-musk", "staff-sre", "security-auditor", "devils-advocate", "junior-dev"].includes(p.id),
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="hidden md:flex items-center gap-1 p-2 rounded-lg transition-colors cursor-pointer"
        style={{
          color: open ? "var(--color-accent)" : "var(--color-text-muted)",
          background: open ? "rgba(66,133,244,0.08)" : "transparent",
        }}
        aria-label="Expert Modes"
        title="Expert Modes & Quick Start"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Rocket size={16} weight={open ? "fill" : "bold"} />
        <CaretDown
          size={10}
          weight="bold"
          style={{
            transition: "transform 150ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 rounded-lg overflow-hidden"
          style={{
            top: "100%",
            width: 300,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
          role="menu"
        >
          {/* Expert Modes section */}
          <div
            className="px-3 py-2"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Expert Modes
            </span>
          </div>

          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            {quickPersonas.map((persona) => (
              <button
                key={persona.id}
                onClick={() => handleSelectPersona(persona)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left cursor-pointer template-picker-item"
                role="menuitem"
                title={persona.strength}
              >
                <PersonaAvatar persona={persona} size={28} showBadge={false} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span
                    className="text-xs font-medium truncate"
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

            {/* View all link */}
            <a
              href="/templates"
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs cursor-pointer template-picker-footer"
              style={{ color: "var(--color-text-muted)" }}
            >
              View all 12 experts →
            </a>

            {/* Custom templates section */}
            {(loading || templates.length > 0) && (
              <>
                <div
                  className="px-3 py-1.5"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Custom Prompts
                  </span>
                </div>

                {loading && (
                  <div className="px-3 py-3 text-center">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Loading...
                    </span>
                  </div>
                )}

                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleSelectTemplate(tpl)}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left cursor-pointer template-picker-item"
                    role="menuitem"
                  >
                    <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                      {tpl.icon || "📝"}
                    </span>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {tpl.name}
                      </span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
