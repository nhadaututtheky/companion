"use client";

import { useEffect } from "react";
import { Sparkle } from "@phosphor-icons/react";
import type { Suggestion } from "@/lib/suggest/types.js";

interface SuggestionStripProps {
  suggestions: Suggestion[];
  onAccept: (suggestion: Suggestion) => void;
  onDismiss: () => void;
}

export function SuggestionStrip({ suggestions, onAccept, onDismiss }: SuggestionStripProps) {
  // ESC key dismisses the strip
  useEffect(() => {
    if (suggestions.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [suggestions.length, onDismiss]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="list"
      aria-label="Inline suggestions"
    >
      {suggestions.map((suggestion) => (
        <button
          key={`${suggestion.source}:${suggestion.id}`}
          role="listitem"
          onClick={() => onAccept(suggestion)}
          title={suggestion.description}
          className="text-text-secondary bg-bg-elevated border-border inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all hover:brightness-110"
          aria-label={`Use suggestion: ${suggestion.label}`}
        >
          <Sparkle size={12} weight="bold" aria-hidden="true" />
          {suggestion.label}
        </button>
      ))}
      <button
        onClick={onDismiss}
        className="text-text-secondary bg-bg-elevated border-border inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all hover:brightness-110"
        aria-label="Dismiss suggestions"
      >
        ✕
      </button>
    </div>
  );
}
