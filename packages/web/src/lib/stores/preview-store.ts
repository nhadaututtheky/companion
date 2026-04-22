import { create } from "zustand";

export interface PreviewArtifact {
  id: string;
  type: "html" | "svg" | "image";
  content: string;
  label: string;
  timestamp: number;
}

interface SessionPreviewState {
  artifacts: PreviewArtifact[];
  activeIndex: number;
  panelOpen: boolean;
}

const EMPTY_ARTIFACTS: PreviewArtifact[] = [];
const DEFAULT_STATE: SessionPreviewState = Object.freeze({
  artifacts: EMPTY_ARTIFACTS,
  activeIndex: 0,
  panelOpen: false,
});

interface PreviewStore {
  /**
   * Artifacts + panel state keyed by sessionId. Each session owns its own
   * preview surface — opening a session's preview never leaks artifacts
   * from a different session.
   */
  bySession: Record<string, SessionPreviewState>;

  addArtifact: (sessionId: string, artifact: PreviewArtifact) => void;
  removeArtifact: (sessionId: string, id: string) => void;
  clearArtifacts: (sessionId: string) => void;
  openPanel: (sessionId: string, index?: number) => void;
  closePanel: (sessionId: string) => void;
  setActiveIndex: (sessionId: string, index: number) => void;
}

function updateSession(
  state: PreviewStore,
  sessionId: string,
  update: (cur: SessionPreviewState) => SessionPreviewState,
): PreviewStore {
  const cur = state.bySession[sessionId] ?? DEFAULT_STATE;
  const next = update(cur);
  if (next === cur) return state;
  return { ...state, bySession: { ...state.bySession, [sessionId]: next } };
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  bySession: {},

  addArtifact: (sessionId, artifact) =>
    set((s) =>
      updateSession(s, sessionId, (cur) => {
        if (cur.artifacts.some((a) => a.content === artifact.content)) return cur;
        return { ...cur, artifacts: [...cur.artifacts, artifact] };
      }),
    ),

  removeArtifact: (sessionId, id) =>
    set((s) =>
      updateSession(s, sessionId, (cur) => {
        const removedIndex = cur.artifacts.findIndex((a) => a.id === id);
        if (removedIndex === -1) return cur;
        const filtered = cur.artifacts.filter((a) => a.id !== id);
        const newActive =
          removedIndex <= cur.activeIndex
            ? Math.max(0, cur.activeIndex - 1)
            : Math.min(cur.activeIndex, Math.max(0, filtered.length - 1));
        return { ...cur, artifacts: filtered, activeIndex: newActive };
      }),
    ),

  clearArtifacts: (sessionId) =>
    set((s) => {
      if (!(sessionId in s.bySession)) return s;
      const rest = { ...s.bySession };
      delete rest[sessionId];
      return { ...s, bySession: rest };
    }),

  openPanel: (sessionId, index) =>
    set((s) =>
      updateSession(s, sessionId, (cur) => ({
        ...cur,
        panelOpen: true,
        activeIndex: index ?? Math.max(0, cur.artifacts.length - 1),
      })),
    ),

  closePanel: (sessionId) =>
    set((s) =>
      updateSession(s, sessionId, (cur) => (cur.panelOpen ? { ...cur, panelOpen: false } : cur)),
    ),

  setActiveIndex: (sessionId, index) =>
    set((s) => updateSession(s, sessionId, (cur) => ({ ...cur, activeIndex: index }))),
}));

// ── Helper selectors — use these instead of raw usePreviewStore where possible ──

export const usePreviewArtifacts = (sessionId: string): PreviewArtifact[] =>
  usePreviewStore((s) => s.bySession[sessionId]?.artifacts ?? EMPTY_ARTIFACTS);

export const usePreviewArtifactCount = (sessionId: string): number =>
  usePreviewStore((s) => s.bySession[sessionId]?.artifacts.length ?? 0);

export const usePreviewActiveIndex = (sessionId: string): number =>
  usePreviewStore((s) => s.bySession[sessionId]?.activeIndex ?? 0);

export const usePreviewPanelOpen = (sessionId: string): boolean =>
  usePreviewStore((s) => s.bySession[sessionId]?.panelOpen ?? false);
