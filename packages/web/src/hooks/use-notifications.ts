"use client";
import { useEffect } from "react";

// Request notification permission on first load
export function useNotificationPermission() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Permission denied or error — silently ignore
      });
    }
  }, []);
}

// Send a browser notification only when the tab is not focused
export function notify(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // Some browsers block Notification in certain contexts
  }
}
