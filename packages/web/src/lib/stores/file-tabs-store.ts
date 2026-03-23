import { create } from "zustand";

export interface FileTab {
  id: string;
  path: string;
  name: string;
  ext: string;
  content: string | null;
  dirty: boolean;
}

interface FileTabsStore {
  tabs: FileTab[];
  activeTabId: string | null;

  openFile: (path: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  switchTab: (id: string) => void;
  setTabContent: (id: string, content: string) => void;
}

function parsePath(path: string): { name: string; ext: string } {
  const name = path.split(/[/\\]/).pop() ?? path;
  const dotIndex = name.lastIndexOf(".");
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
  return { name, ext };
}

export const useFileTabsStore = create<FileTabsStore>((set) => ({
  tabs: [],
  activeTabId: null,

  openFile: (path) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.path === path);
      if (existing) {
        return { activeTabId: existing.id };
      }
      const { name, ext } = parsePath(path);
      const newTab: FileTab = {
        id: path,
        path,
        name,
        ext,
        content: null,
        dirty: false,
      };
      return {
        tabs: [...s.tabs, newTab],
        activeTabId: newTab.id,
      };
    }),

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return s;
      const nextTabs = s.tabs.filter((t) => t.id !== id);
      let nextActiveId = s.activeTabId;
      if (s.activeTabId === id) {
        if (nextTabs.length === 0) {
          nextActiveId = null;
        } else {
          // prefer tab to the right, fallback to left
          const nextTab = nextTabs[idx] ?? nextTabs[idx - 1];
          nextActiveId = nextTab?.id ?? null;
        }
      }
      return { tabs: nextTabs, activeTabId: nextActiveId };
    }),

  closeOtherTabs: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (!tab) return s;
      return { tabs: [tab], activeTabId: id };
    }),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  switchTab: (id) => set({ activeTabId: id }),

  setTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),
}));
