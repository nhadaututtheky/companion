import { create } from "zustand";
import type {
  TaskClassification,
  OrchestrationPattern,
} from "@companion/shared/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DispatchSuggestion {
  /** Classification from server */
  classification: TaskClassification;
  /** Session this suggestion is for */
  sessionId: string;
  /** Timestamp when received */
  receivedAt: number;
  /** Whether user has interacted with this suggestion */
  dismissed: boolean;
}

export type DispatchAction = "accept" | "reject" | "override" | "dismiss";

interface DispatchState {
  /** Current pending suggestion (null = no active suggestion) */
  suggestion: DispatchSuggestion | null;

  /** Set a new suggestion from WS event */
  setSuggestion: (sessionId: string, classification: TaskClassification) => void;

  /** Clear suggestion (after action or timeout) */
  clearSuggestion: () => void;

  /** Override the pattern before confirming */
  overridePattern: (pattern: OrchestrationPattern) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useDispatchStore = create<DispatchState>((set) => ({
  suggestion: null,

  setSuggestion: (sessionId, classification) => {
    // Skip low-confidence or single-pattern (single needs no UI intervention)
    if (classification.confidence < 0.5) return;
    if (classification.pattern === "single") return;
    set({
      suggestion: {
        classification,
        sessionId,
        receivedAt: Date.now(),
        dismissed: false,
      },
    });
  },

  clearSuggestion: () => set({ suggestion: null }),

  overridePattern: (pattern) =>
    set((state) => {
      if (!state.suggestion) return state;
      return {
        suggestion: {
          ...state.suggestion,
          classification: {
            ...state.suggestion.classification,
            pattern,
          },
        },
      };
    }),
}));
