import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutMode = "single" | "side-by-side" | "stacked" | "grid";

interface LayoutState {
  mode: LayoutMode;
  /** Session IDs pinned to each pane (up to 4) */
  panes: (string | null)[];
  setMode: (mode: LayoutMode) => void;
  /** Pin a session to a specific pane index */
  pinToPane: (paneIndex: number, sessionId: string) => void;
  /** Remove a session from its pane */
  unpinFromPane: (paneIndex: number) => void;
  /** Clear all panes */
  clearPanes: () => void;
}

function getPaneCount(mode: LayoutMode): number {
  switch (mode) {
    case "single":
      return 1;
    case "side-by-side":
    case "stacked":
      return 2;
    case "grid":
      return 4;
  }
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      mode: "single",
      panes: [null, null, null, null],

      setMode: (mode) =>
        set((state) => ({
          ...state,
          mode,
          // Keep existing panes, trim to new count
          panes: state.panes
            .slice(0, getPaneCount(mode))
            .concat(Array(Math.max(0, getPaneCount(mode) - state.panes.length)).fill(null)),
        })),

      pinToPane: (paneIndex, sessionId) =>
        set((state) => {
          const panes = [...state.panes];
          panes[paneIndex] = sessionId;
          return { ...state, panes };
        }),

      unpinFromPane: (paneIndex) =>
        set((state) => {
          const panes = [...state.panes];
          panes[paneIndex] = null;
          return { ...state, panes };
        }),

      clearPanes: () =>
        set((state) => ({
          ...state,
          panes: [null, null, null, null],
        })),
    }),
    {
      name: "companion-layout",
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);

export { getPaneCount };
