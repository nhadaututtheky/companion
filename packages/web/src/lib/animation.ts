"use client";
import { useState, useEffect } from "react";

type AnimationState = "entering" | "entered" | "exiting" | "exited";

interface UseAnimatePresenceReturn {
  shouldRender: boolean;
  animationState: AnimationState;
}

/**
 * Manages mount/unmount with animation lifecycle.
 * Respects prefers-reduced-motion — when motion is reduced, transitions
 * are instant (no delay between states).
 */
export function useAnimatePresence(
  isVisible: boolean,
  enterDuration = 250,
  exitDuration = 200,
): UseAnimatePresenceReturn {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [animationState, setAnimationState] = useState<AnimationState>(
    isVisible ? "entered" : "exited",
  );

  const prefersReduced =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true); // eslint-disable-line react-hooks/set-state-in-effect -- animation state machine
      // Trigger enter on next frame so CSS transition fires
      const rafId = requestAnimationFrame(() => {
        setAnimationState("entering");
        if (prefersReduced) {
          setAnimationState("entered");
          return;
        }
        const timerId = setTimeout(() => {
          setAnimationState("entered");
        }, enterDuration);
        return () => clearTimeout(timerId);
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      setAnimationState("exiting");
      if (prefersReduced) {
        setAnimationState("exited");
        setShouldRender(false);
        return;
      }
      const timerId = setTimeout(() => {
        setAnimationState("exited");
        setShouldRender(false);
      }, exitDuration);
      return () => clearTimeout(timerId);
    }
  }, [isVisible, enterDuration, exitDuration, prefersReduced]);

  return { shouldRender, animationState };
}
