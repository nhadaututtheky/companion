import { create } from "zustand";

export interface PreviewArtifact {
  id: string;
  type: "html" | "svg" | "image";
  content: string;
  label: string;
  timestamp: number;
}

interface PreviewStore {
  /** All collected artifacts for the current session */
  artifacts: PreviewArtifact[];
  /** Currently viewed artifact index (-1 = none / panel closed) */
  activeIndex: number;
  /** Whether the design panel is open (slide active) */
  panelOpen: boolean;

  addArtifact: (artifact: PreviewArtifact) => void;
  removeArtifact: (id: string) => void;
  clearArtifacts: () => void;
  openPanel: (index?: number) => void;
  closePanel: () => void;
  setActiveIndex: (index: number) => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  artifacts: [],
  activeIndex: 0,
  panelOpen: false,

  addArtifact: (artifact) =>
    set((s) => {
      // Deduplicate by content hash (avoid re-adding same artifact)
      const exists = s.artifacts.some((a) => a.content === artifact.content);
      if (exists) return s;
      return { artifacts: [...s.artifacts, artifact] };
    }),

  removeArtifact: (id) =>
    set((s) => {
      const removedIndex = s.artifacts.findIndex((a) => a.id === id);
      const filtered = s.artifacts.filter((a) => a.id !== id);
      const newActive =
        removedIndex !== -1 && removedIndex <= s.activeIndex
          ? Math.max(0, s.activeIndex - 1)
          : Math.min(s.activeIndex, filtered.length - 1);
      return { artifacts: filtered, activeIndex: newActive };
    }),

  clearArtifacts: () => set({ artifacts: [], activeIndex: 0, panelOpen: false }),

  openPanel: (index) =>
    set((s) => ({
      panelOpen: true,
      activeIndex: index ?? Math.max(0, s.artifacts.length - 1),
    })),

  closePanel: () => set({ panelOpen: false }),

  setActiveIndex: (index) => set({ activeIndex: index }),
}));
