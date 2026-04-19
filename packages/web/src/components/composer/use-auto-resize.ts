"use client";
import { useCallback, type RefObject } from "react";

/**
 * Returns a stable handler that resizes a textarea to fit content, clamped
 * to `maxHeight`. Wire to both `onInput` and any programmatic value changes
 * (call `resize()` after `setText` on suggestion accept, voice transcript, etc).
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  maxHeight: number,
) {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, maxHeight]);

  return resize;
}
