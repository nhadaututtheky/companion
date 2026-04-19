"use client";
import { useState, useCallback } from "react";

/**
 * Detects `/command` patterns in composer input and exposes open/close state
 * for the SlashCommandMenu overlay.
 *
 * Behavior contract (locked by `composer-logic.test.ts`):
 *   - opens on bare slash, stays open while typing the command name
 *   - closes on whitespace (command + arg starts) or multiline input
 *   - closes when text doesn't start with slash
 */
export function useSlashMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /** Call inside textarea onChange with the new value. */
  const onChangeText = useCallback((value: string) => {
    const match = value.match(/^\/(\S*)$/);
    if (match) {
      setOpen(true);
      setQuery("/" + match[1]);
    } else {
      setOpen(false);
    }
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, query, onChangeText, close };
}
