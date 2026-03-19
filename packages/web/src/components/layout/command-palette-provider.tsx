"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/stores/ui-store";
import { CommandPalette } from "./command-palette";

/**
 * Mounts the CommandPalette and registers the global Ctrl+K / Cmd+K shortcut.
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
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setOpen]);

  return <CommandPalette />;
}
