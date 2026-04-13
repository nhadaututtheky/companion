"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Z } from "@/lib/z-index";
import { getPersonaById, type Persona } from "@companion/shared";
import { PersonaAvatar } from "./persona-avatar";
import { PersonaTooltip } from "./persona-tooltip";
import { usePersonas } from "@/hooks/use-personas";

interface PersonaChipProps {
  personaId: string;
  onSwitch: (personaId: string | null) => void;
  disabled?: boolean;
}

/**
 * Small chip showing active persona in session header.
 * Click to open inline switcher popover.
 */
export function PersonaChip({ personaId, onSwitch, disabled }: PersonaChipProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { all: allPersonas } = usePersonas();
  const persona = allPersonas.find((p) => p.id === personaId) ?? getPersonaById(personaId);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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

  const handleSelect = useCallback(
    (id: string | null) => {
      setOpen(false);
      onSwitch(id);
    },
    [onSwitch],
  );

  if (!persona) return null;

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 disabled:cursor-not-allowed max-w-[140px]"
        style={{
          color: open ? "#4285F4" : "var(--color-text-secondary)",
          border: open ? "1px solid #4285F440" : "1px solid var(--color-border)",
          background: open ? "#4285F408" : "transparent",
        }}
        aria-label={`Active persona: ${persona.name}. Click to switch.`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <PersonaAvatar persona={persona} size={18} showBadge={false} />
        <span className="truncate">{persona.name}</span>
      </button>

      {open && (
        <div
          className="shadow-soft absolute left-0 mt-1 rounded-lg overflow-hidden bg-bg-card" style={{
            top: "100%",
            width: 260,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: Z.popover,
            maxHeight: 320,
            overflowY: "auto",
          }}
          role="menu"
        >
          {/* None / Default option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-left cursor-pointer template-picker-item"
            role="menuitem"
            aria-label="Default Claude (no persona)"
          >
            <div
              className="shadow-soft flex items-center justify-center rounded-full flex-shrink-0 text-text-muted bg-bg-elevated" style={{
                width: 24,
                height: 24,
                fontSize: 10,
                }}
            >
              —
            </div>
            <span className="text-xs font-medium text-text-secondary">
              Default Claude (no persona)
            </span>
          </button>

          <div style={{ height: 1, background: "var(--color-border)" }} />

          {allPersonas.map((p) => (
            <PersonaOption
              key={p.id}
              persona={p}
              isActive={p.id === personaId}
              onSelect={() => handleSelect(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaOption({
  persona,
  isActive,
  onSelect,
}: {
  persona: Persona;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <PersonaTooltip persona={persona} placement="right">
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-left cursor-pointer template-picker-item"
        role="menuitem"
        style={{
          background: isActive ? "#4285F408" : undefined,
        }}
      >
        <PersonaAvatar persona={persona} size={24} showBadge={false} />
        <div className="flex flex-col flex-1 min-w-0">
          <span
            className="text-xs font-medium truncate"
            style={{ color: isActive ? "#4285F4" : "var(--color-text-primary)" }}
          >
            {persona.icon} {persona.name}
          </span>
          <span
            className="text-xs truncate text-text-muted" style={{ fontSize: 10 }}
          >
            {persona.strength}
          </span>
        </div>
        {isActive && (
          <span className="text-xs" style={{ color: "#4285F4" }}>
            ●
          </span>
        )}
      </button>
    </PersonaTooltip>
  );
}
