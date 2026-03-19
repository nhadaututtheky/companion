import { create } from "zustand";

export type ActivityLogType =
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "result"
  | "error"
  | "permission"
  | "cost";

export interface ActivityLog {
  id: string;
  sessionId: string;
  sessionName: string;
  timestamp: number;
  type: ActivityLogType;
  content: string;
  meta?: Record<string, unknown>;
}

const MAX_LOGS = 500;

interface ActivityStore {
  logs: ActivityLog[];
  filterSession: string | null;
  filterType: string | null;
  addLog: (log: Omit<ActivityLog, "id">) => void;
  clearLogs: () => void;
  setFilter: (session: string | null, type: string | null) => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  logs: [],
  filterSession: null,
  filterType: null,

  addLog: (log) =>
    set((s) => {
      const entry: ActivityLog = {
        ...log,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      const updated = [entry, ...s.logs];
      return { logs: updated.length > MAX_LOGS ? updated.slice(0, MAX_LOGS) : updated };
    }),

  clearLogs: () => set({ logs: [] }),

  setFilter: (filterSession, filterType) => set({ filterSession, filterType }),
}));
