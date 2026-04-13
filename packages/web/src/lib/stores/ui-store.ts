import { create } from "zustand";
import type { SettingsTab } from "@/types/settings";
import { reapplyCurrentTheme } from "@/lib/theme-provider";

interface UiStore {
  theme: "light" | "dark";
  monochrome: boolean;
  commandPaletteOpen: boolean;
  newSessionModalOpen: boolean;
  newSessionDefaultPersonaId: string | null;
  settingsModalOpen: boolean;
  settingsActiveTab: SettingsTab;
  activityTerminalOpen: boolean;
  rightPanelMode:
    | "none"
    | "files"
    | "browser"
    | "search"
    | "terminal"
    | "stats"
    | "ai-context"
    | "wiki"
    | "workspace";
  rightPanelPath: string | null;
  browserPreviewUrl: string | null;
  featureGuideOpen: boolean;
  sidebarExpanded: boolean;
  sidebarActiveProject: string | null;
  activeNavMenu: "panels" | "ai" | "layout" | null;
  statsBarOpen: boolean;
  schedulesModalOpen: boolean;
  workspaceCreateModalOpen: boolean;
  resumeSessionsModalOpen: boolean;
  setStatsBarOpen: (open: boolean) => void;
  setSchedulesModalOpen: (open: boolean) => void;
  setWorkspaceCreateModalOpen: (open: boolean) => void;
  setResumeSessionsModalOpen: (open: boolean) => void;
  setFeatureGuideOpen: (open: boolean) => void;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  setMonochrome: (on: boolean) => void;
  toggleMonochrome: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNewSessionModalOpen: (open: boolean, defaultPersonaId?: string | null) => void;
  setSettingsModalOpen: (open: boolean) => void;
  setSettingsActiveTab: (tab: SettingsTab) => void;
  setActivityTerminalOpen: (open: boolean) => void;
  setRightPanelMode: (
    mode:
      | "none"
      | "files"
      | "browser"
      | "search"
      | "terminal"
      | "stats"
      | "ai-context"
      | "wiki"
      | "workspace",
  ) => void;
  setRightPanelPath: (path: string | null) => void;
  setBrowserPreviewUrl: (url: string | null) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarActiveProject: (slug: string | null) => void;
  toggleSidebarProject: (slug: string) => void;
  setActiveNavMenu: (menu: "panels" | "ai" | "layout" | null) => void;
  toggleNavMenu: (menu: "panels" | "ai" | "layout") => void;
}

// Read persisted theme on store creation (runs once)
const getInitialTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const getInitialMonochrome = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("companion_mono") === "1";
  } catch {
    return false;
  }
};

export const useUiStore = create<UiStore>((set) => ({
  theme: getInitialTheme(),
  monochrome: getInitialMonochrome(),
  commandPaletteOpen: false,
  newSessionModalOpen: false,
  newSessionDefaultPersonaId: null,
  settingsModalOpen: false,
  settingsActiveTab: "general",
  activityTerminalOpen: false,
  featureGuideOpen: false,
  rightPanelMode: "none",
  rightPanelPath: null,
  browserPreviewUrl: null,
  sidebarExpanded: false,
  sidebarActiveProject: null,
  activeNavMenu: null,
  statsBarOpen: false,
  schedulesModalOpen: false,
  workspaceCreateModalOpen: false,
  resumeSessionsModalOpen: false,

  setStatsBarOpen: (open) => set({ statsBarOpen: open }),

  setSchedulesModalOpen: (open) => set({ schedulesModalOpen: open }),

  setWorkspaceCreateModalOpen: (open) => set({ workspaceCreateModalOpen: open }),

  setResumeSessionsModalOpen: (open) => set({ resumeSessionsModalOpen: open }),

  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
      localStorage.setItem("theme", theme);
    }
  },

  toggleTheme: () =>
    set((s) => {
      const next = s.theme === "light" ? "dark" : "light";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next === "dark");
        localStorage.setItem("theme", next);
      }
      return { theme: next };
    }),

  setMonochrome: (on) => {
    set({ monochrome: on });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("mono", on);
      localStorage.setItem("companion_mono", on ? "1" : "0");
      reapplyCurrentTheme();
    }
  },

  toggleMonochrome: () =>
    set((s) => {
      const next = !s.monochrome;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("mono", next);
        localStorage.setItem("companion_mono", next ? "1" : "0");
        reapplyCurrentTheme();
      }
      return { monochrome: next };
    }),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setNewSessionModalOpen: (open, defaultPersonaId) =>
    set({ newSessionModalOpen: open, newSessionDefaultPersonaId: defaultPersonaId ?? null }),

  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),

  setSettingsActiveTab: (tab) => set({ settingsActiveTab: tab }),

  setActivityTerminalOpen: (open) => set({ activityTerminalOpen: open }),

  setFeatureGuideOpen: (open) => set({ featureGuideOpen: open }),

  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),

  setRightPanelPath: (path) => set({ rightPanelPath: path }),

  setBrowserPreviewUrl: (url) => set({ browserPreviewUrl: url }),

  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

  setSidebarActiveProject: (slug) =>
    set({ sidebarActiveProject: slug, sidebarExpanded: slug !== null }),

  toggleSidebarProject: (slug) =>
    set((s) => {
      if (s.sidebarActiveProject === slug) {
        return { sidebarActiveProject: null, sidebarExpanded: false };
      }
      return { sidebarActiveProject: slug, sidebarExpanded: true };
    }),

  setActiveNavMenu: (menu) => set({ activeNavMenu: menu }),

  toggleNavMenu: (menu) => set((s) => ({ activeNavMenu: s.activeNavMenu === menu ? null : menu })),
}));
