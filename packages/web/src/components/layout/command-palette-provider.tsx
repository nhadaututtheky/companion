"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/stores/ui-store";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("./command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);

/**
 * Mounts the CommandPalette and registers the global Ctrl+K / Cmd+K shortcut.
 * Also registers Ctrl+Shift+F for the file search panel.
 * Rendered once in the root layout so it is available on every page.
 */
export function CommandPaletteProvider() {
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }

      // Ctrl+, / Cmd+, — toggle settings modal
      if (modifier && e.key === ",") {
        e.preventDefault();
        const store = useUiStore.getState();
        store.setSettingsModalOpen(!store.settingsModalOpen);
      }

      // Ctrl+Shift+F / Cmd+Shift+F — toggle file search panel
      if (modifier && e.shiftKey && e.key === "F") {
        e.preventDefault();
        const uiStore = useUiStore.getState();
        uiStore.setRightPanelMode(uiStore.rightPanelMode === "search" ? "none" : "search");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setOpen]);

  return <CommandPalette />;
}
