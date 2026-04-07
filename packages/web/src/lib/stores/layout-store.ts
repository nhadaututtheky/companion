import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutMode = "single" | "side-by-side" | "stacked" | "grid";

type RightPanel = "none" | "files" | "browser" | "search" | "terminal" | "stats" | "ai-context" | "wiki";

export interface LayoutPreset {
  id: string;
  name: string;
  mode: LayoutMode;
  rightPanel: RightPanel;
  activityTerminal: boolean;
  builtIn: boolean;
}

export const BUILT_IN_PRESETS: LayoutPreset[] = [
  {
    id: "default",
    name: "Default",
    mode: "single",
    rightPanel: "none",
    activityTerminal: false,
    builtIn: true,
  },
  {
    id: "focus",
    name: "Focus",
    mode: "single",
    rightPanel: "none",
    activityTerminal: false,
    builtIn: true,
  },
  {
    id: "web-dev",
    name: "Web Dev",
    mode: "single",
    rightPanel: "browser",
    activityTerminal: true,
    builtIn: true,
  },
  {
    id: "terminal",
    name: "Terminal",
    mode: "single",
    rightPanel: "terminal",
    activityTerminal: true,
    builtIn: true,
  },
  {
    id: "explorer",
    name: "Explorer",
    mode: "single",
    rightPanel: "files",
    activityTerminal: false,
    builtIn: true,
  },
  {
    id: "ai-collab",
    name: "AI Collab",
    mode: "side-by-side",
    rightPanel: "ai-context",
    activityTerminal: false,
    builtIn: true,
  },
];

interface LayoutState {
  mode: LayoutMode;
  /** Session IDs pinned to each pane (up to 4) */
  panes: (string | null)[];
  /** Active preset ID (null = custom / no preset) */
  activePresetId: string | null;
  /** User-saved custom presets */
  customPresets: LayoutPreset[];
  setMode: (mode: LayoutMode) => void;
  pinToPane: (paneIndex: number, sessionId: string) => void;
  unpinFromPane: (paneIndex: number) => void;
  clearPanes: () => void;
  /** Apply a preset by ID */
  applyPreset: (presetId: string) => void;
  /** Save current layout as a custom preset */
  saveCustomPreset: (name: string, currentRightPanel: RightPanel, currentTerminal: boolean) => void;
  /** Delete a custom preset */
  deleteCustomPreset: (presetId: string) => void;
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
    (set, get) => ({
      mode: "single",
      panes: [null, null, null, null],
      activePresetId: "default",
      customPresets: [],

      setMode: (mode) =>
        set((state) => ({
          ...state,
          mode,
          activePresetId: null,
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

      applyPreset: (presetId) => {
        const allPresets = [...BUILT_IN_PRESETS, ...get().customPresets];
        const preset = allPresets.find((p) => p.id === presetId);
        if (!preset) return;

        const count = getPaneCount(preset.mode);
        set((state) => ({
          ...state,
          mode: preset.mode,
          activePresetId: preset.id,
          panes: state.panes
            .slice(0, count)
            .concat(Array(Math.max(0, count - state.panes.length)).fill(null)),
        }));

        // Apply right panel + terminal via ui-store (side-effect)
        // This is called from the component which has access to ui-store
      },

      saveCustomPreset: (name, currentRightPanel, currentTerminal) =>
        set((state) => {
          const id = `custom-${Date.now()}`;
          const preset: LayoutPreset = {
            id,
            name,
            mode: state.mode,
            rightPanel: currentRightPanel,
            activityTerminal: currentTerminal,
            builtIn: false,
          };
          return {
            ...state,
            activePresetId: id,
            customPresets: [...state.customPresets, preset],
          };
        }),

      deleteCustomPreset: (presetId) =>
        set((state) => ({
          ...state,
          customPresets: state.customPresets.filter((p) => p.id !== presetId),
          activePresetId: state.activePresetId === presetId ? null : state.activePresetId,
        })),
    }),
    {
      name: "companion-layout",
      partialize: (state) => ({
        mode: state.mode,
        activePresetId: state.activePresetId,
        customPresets: state.customPresets,
      }),
    },
  ),
);

export { getPaneCount };
