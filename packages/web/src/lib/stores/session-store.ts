import { create } from "zustand";
import type { SessionState } from "@companion/shared";

type NotifyMode = "visual" | "toast" | "off";
type FlashType = "success" | "error" | "info" | null;

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
  /** Notification mode: visual (card flash), toast (Sonner), off */
  notifyMode?: NotifyMode;
  /** Transient flash state for visual notifications */
  flashType?: FlashType;
  /** Parent session ID (multi-brain workspace) */
  parentSessionId?: string;
  /** Child session IDs spawned from this session */
  childSessionIds?: string[];
  /** Agent role in multi-brain workspace */
  brainRole?: "coordinator" | "specialist" | "researcher" | "reviewer";
  /** Agent display name (e.g. "Backend Engineer") */
  agentName?: string;
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
  /** Cycle notification mode: visual → toast → off → visual */
  cycleNotifyMode: (id: string) => void;
  /** Trigger a card flash (auto-clears after 600ms) */
  triggerFlash: (id: string, type: "success" | "error" | "info") => void;
  /** Add a child session to a parent's tracking */
  addChildSession: (parentId: string, childId: string) => void;
  /** Remove a child session from parent's tracking */
  removeChildSession: (parentId: string, childId: string) => void;
  /** Get all child sessions of a parent */
  getChildSessions: (parentId: string) => Session[];
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

  cycleNotifyMode: (id) =>
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      const order: NotifyMode[] = ["visual", "toast", "off"];
      const current = session.notifyMode ?? "visual";
      const next = order[(order.indexOf(current) + 1) % order.length]!;
      return {
        sessions: {
          ...s.sessions,
          [id]: { ...session, notifyMode: next },
        },
      };
    }),

  triggerFlash: (id, type) => {
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [id]: { ...session, flashType: type },
        },
      };
    });
    // Auto-clear after animation
    setTimeout(() => {
      set((s) => {
        const session = s.sessions[id];
        if (!session) return s;
        return {
          sessions: {
            ...s.sessions,
            [id]: { ...session, flashType: null },
          },
        };
      });
    }, 600);
  },

  addChildSession: (parentId, childId) =>
    set((s) => {
      const parent = s.sessions[parentId];
      if (!parent) return s;
      const existing = parent.childSessionIds ?? [];
      if (existing.includes(childId)) return s;
      return {
        sessions: {
          ...s.sessions,
          [parentId]: { ...parent, childSessionIds: [...existing, childId] },
        },
      };
    }),

  removeChildSession: (parentId, childId) =>
    set((s) => {
      const parent = s.sessions[parentId];
      if (!parent) return s;
      return {
        sessions: {
          ...s.sessions,
          [parentId]: {
            ...parent,
            childSessionIds: (parent.childSessionIds ?? []).filter((id) => id !== childId),
          },
        },
      };
    }),

  getChildSessions: (parentId) => {
    const state = get();
    const parent = state.sessions[parentId];
    if (!parent?.childSessionIds) return [];
    return parent.childSessionIds
      .map((id) => state.sessions[id])
      .filter((s): s is Session => !!s);
  },
}));
