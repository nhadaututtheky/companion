"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

interface TauriEvent<T> {
  payload: T;
}

interface TauriUpdatePayload {
  current: string;
  version: string;
  body: string;
}

function getTauriListen():
  | ((event: string, handler: (e: TauriEvent<TauriUpdatePayload>) => void) => Promise<() => void>)
  | undefined {
  const w = globalThis as unknown as Record<string, unknown>;
  const tauri = w.__TAURI__ as Record<string, unknown> | undefined;
  const eventModule = tauri?.event as Record<string, unknown> | undefined;
  return eventModule?.listen as
    | ((
        event: string,
        handler: (e: TauriEvent<TauriUpdatePayload>) => void,
      ) => Promise<() => void>)
    | undefined;
}

const DISMISS_KEY = "companion_update_dismissed";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const RELEASE_BASE_URL = "https://github.com/nhadaututtheky/companion-release/releases";

/**
 * Shared update-check hook. Consumed by `UpdateBanner` (rich modal) and the
 * Activity Terminal version badge (always-visible footer). Exposing this as a
 * standalone hook avoids duplicate HTTP polling + duplicate Tauri event
 * listeners — both consumers subscribe to one source.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const applyUpdate = useCallback((info: UpdateInfo) => {
    if (info.available) {
      const dismissedVersion = localStorage.getItem(DISMISS_KEY);
      setDismissed(dismissedVersion === info.latestVersion);
    }
    setUpdate(info);
  }, []);

  const checkNow = useCallback(
    async (force = false) => {
      try {
        const info = await api.updateCheck.check(force);
        applyUpdate(info);
      } catch {
        // Silently fail — update check is non-critical
      }
    },
    [applyUpdate],
  );

  const dismiss = useCallback((version: string) => {
    localStorage.setItem(DISMISS_KEY, version);
    setDismissed(true);
  }, []);

  const undismiss = useCallback(() => {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  }, []);

  // Listen for Tauri's native update-available event (emitted by Rust updater)
  useEffect(() => {
    const listen = getTauriListen();
    if (!listen) return;

    let unlisten: (() => void) | undefined;
    listen("update-available", (event: TauriEvent<TauriUpdatePayload>) => {
      const { current, version, body } = event.payload;
      applyUpdate({
        available: true,
        currentVersion: current,
        latestVersion: version,
        releaseUrl: `${RELEASE_BASE_URL}/tag/v${version}`,
        releaseNotes: body,
        publishedAt: "",
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [applyUpdate]);

  // Server-side check on mount + interval (works for both Docker and Tauri)
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void checkNow();
    }, 5000);

    const interval = setInterval(() => {
      void checkNow();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [checkNow]);

  return { update, dismissed, dismiss, undismiss, checkNow };
}
