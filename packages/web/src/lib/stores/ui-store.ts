import { create } from "zustand";

interface UiStore {
  theme: "light" | "dark";
  commandPaletteOpen: boolean;
  newSessionModalOpen: boolean;
  activityTerminalOpen: boolean;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setNewSessionModalOpen: (open: boolean) => void;
  setActivityTerminalOpen: (open: boolean) => void;
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

export const useUiStore = create<UiStore>((set) => ({
  theme: getInitialTheme(),
  commandPaletteOpen: false,
  newSessionModalOpen: false,
  activityTerminalOpen: false,

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

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setNewSessionModalOpen: (open) => set({ newSessionModalOpen: open }),

  setActivityTerminalOpen: (open) => set({ activityTerminalOpen: open }),
}));
