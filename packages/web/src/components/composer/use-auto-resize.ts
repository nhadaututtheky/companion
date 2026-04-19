"use client";
import { useCallback, type RefObject } from "react";

/** Pure DOM resize: clamp `el.scrollHeight` to `maxHeight`. Safe on null. */
export function resizeTextarea(el: HTMLTextAreaElement | null, maxHeight: number) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
}

/**
 * Returns a stable handler that resizes a textarea to fit content, clamped
 * to `maxHeight`. Wire to both `onInput` and any programmatic value changes
 * (call `resize()` after `setText` on suggestion accept, voice transcript, etc).
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  maxHeight: number,
) {
  return useCallback(() => resizeTextarea(ref.current, maxHeight), [ref, maxHeight]);
}
