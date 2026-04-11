/**
 * Workspace Store — client-side state for multi-CLI workspaces.
 */

import { create } from "zustand";
import type {
  Workspace,
  WorkspaceWithStatus,
  WorkspaceCreateBody,
  WorkspaceUpdateBody,
} from "@companion/shared";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface WorkspaceStore {
  /** All workspaces */
  workspaces: Workspace[];
  /** Currently active workspace (expanded in sidebar) */
  activeWorkspaceId: string | null;
  /** Detailed workspace with CLI status (fetched on demand) */
  activeWorkspaceDetail: WorkspaceWithStatus | null;
  /** Loading state */
  loading: boolean;
  /** Detail loading state */
  detailLoading: boolean;

  /** Fetch all workspaces from server */
  fetchWorkspaces: () => Promise<void>;
  /** Fetch detailed workspace with CLI status */
  fetchWorkspaceDetail: (id: string) => Promise<void>;
  /** Set active workspace */
  setActiveWorkspace: (id: string | null) => void;
  /** Create a new workspace */
  createWorkspace: (body: WorkspaceCreateBody) => Promise<Workspace | null>;
  /** Update workspace config */
  updateWorkspace: (id: string, body: WorkspaceUpdateBody) => Promise<void>;
  /** Delete workspace */
  deleteWorkspace: (id: string) => Promise<void>;
}

const getPersistedWorkspace = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("companion:active_workspace");
  } catch {
    return null;
  }
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: getPersistedWorkspace(),
  activeWorkspaceDetail: null,
  loading: false,
  detailLoading: false,

  fetchWorkspaces: async () => {
    set({ loading: true });
    try {
      const res = await api.workspaces.list();
      const items = res.data ?? [];
      set({ workspaces: items, loading: false });
      const activeId = get().activeWorkspaceId;
      if (activeId && items.some((w) => w.id === activeId)) {
        get().fetchWorkspaceDetail(activeId);
      }
    } catch {
      set({ loading: false });
      toast.error("Failed to load workspaces");
    }
  },

  fetchWorkspaceDetail: async (id: string) => {
    set({ detailLoading: true });
    try {
      const res = await api.workspaces.get(id);
      set({
        activeWorkspaceDetail: res.data ?? null,
        detailLoading: false,
      });
    } catch {
      set({ activeWorkspaceDetail: null, detailLoading: false });
      toast.error("Failed to load workspace details");
    }
  },

  setActiveWorkspace: (id: string | null) => {
    if (id) {
      set({ activeWorkspaceId: id, detailLoading: true });
      get().fetchWorkspaceDetail(id);
    } else {
      set({ activeWorkspaceId: null, activeWorkspaceDetail: null });
    }
    try {
      if (id) {
        localStorage.setItem("companion:active_workspace", id);
      } else {
        localStorage.removeItem("companion:active_workspace");
      }
    } catch {
      // localStorage unavailable
    }
  },

  createWorkspace: async (body: WorkspaceCreateBody) => {
    try {
      const res = await api.workspaces.create(body);
      const ws = res.data;
      if (ws) {
        set((s) => ({ workspaces: [...s.workspaces, ws] }));
        return ws;
      }
      return null;
    } catch (err) {
      toast.error("Failed to create workspace");
      return null;
    }
  },

  updateWorkspace: async (id: string, body: WorkspaceUpdateBody) => {
    try {
      const res = await api.workspaces.update(id, body);
      const updated = res.data;
      if (updated) {
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === id ? updated : w)),
        }));
      }
    } catch {
      toast.error("Failed to update workspace");
    }
  },

  deleteWorkspace: async (id: string) => {
    try {
      await api.workspaces.delete(id);
      set((s) => ({
        workspaces: s.workspaces.filter((w) => w.id !== id),
        activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
        activeWorkspaceDetail:
          s.activeWorkspaceDetail?.id === id ? null : s.activeWorkspaceDetail,
      }));
    } catch {
      toast.error("Failed to delete workspace");
    }
  },
}));
