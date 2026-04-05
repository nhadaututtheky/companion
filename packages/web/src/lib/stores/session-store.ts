import { create } from "zustand";
import type { SessionState } from "@companion/shared";

interface Session {
  id: string;
  shortId?: string;
  projectSlug: string;
  projectName: string;
  model: string;
  status: string;
  state: SessionState;
  createdAt: number;
  /** Session tags for filtering/organization */
  tags?: string[];
  /** Real-time context window usage from CLI polling */
  contextUsedPercent?: number;
  contextTokens?: number;
  contextMaxTokens?: number;
  /** Expert Mode persona ID (e.g. "tim-cook", "staff-sre") */
  personaId?: string;
}

interface SessionStore {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  expandedSessionId: string | null;
  gridOrder: string[];
  /** Sessions the user explicitly closed — won't re-appear in grid */
  closedIds: Set<string>;
  setSession: (id: string, data: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  setExpandedSession: (id: string | null) => void;
  addToGrid: (id: string) => void;
  removeFromGrid: (id: string) => void;
  reorderGrid: (ids: string[]) => void;
  getSession: (id: string) => Session | undefined;
  getActiveSessions: () => Session[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  expandedSessionId: null,
  gridOrder: [],
  closedIds: new Set(),

  setSession: (id, data) =>
    set((s) => ({
      sessions: {
        ...s.sessions,
        [id]: { ...s.sessions[id], ...data } as Session,
      },
    })),

  removeSession: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.sessions;
      const newClosed = new Set(s.closedIds);
      newClosed.add(id);
      return {
        sessions: rest,
        gridOrder: s.gridOrder.filter((gid) => gid !== id),
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        expandedSessionId: s.expandedSessionId === id ? null : s.expandedSessionId,
        closedIds: newClosed,
      };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  setExpandedSession: (id) => set({ expandedSessionId: id }),

  addToGrid: (id) =>
    set((s) => {
      // Remove from closedIds if user explicitly re-opens
      const newClosed = new Set(s.closedIds);
      newClosed.delete(id);
      return {
        gridOrder: s.gridOrder.includes(id) ? s.gridOrder : [...s.gridOrder, id],
        closedIds: newClosed,
      };
    }),

  removeFromGrid: (id) =>
    set((s) => {
      const newClosed = new Set(s.closedIds);
      newClosed.add(id);
      return {
        gridOrder: s.gridOrder.filter((gid) => gid !== id),
        closedIds: newClosed,
      };
    }),

  reorderGrid: (ids) => set({ gridOrder: ids }),

  getSession: (id) => get().sessions[id],

  getActiveSessions: () =>
    Object.values(get().sessions).filter((s) => ["running", "waiting", "idle"].includes(s.status)),
}));
