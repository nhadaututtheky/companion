"use client";
import { useState, useEffect, useCallback } from "react";
import { ArrowSquareUpRight, X, Rocket } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { Z } from "@/lib/z-index";

// ── Types ──────────────────────────────────────────────────────────────────

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

// ── Tauri global API types ─────────────────────────────────────────────────

interface TauriEvent<T> {
  payload: T;
}

interface TauriUpdatePayload {
  current: string;
  version: string;
  body: string;
}

/**
 * Access Tauri's global event listener (available when withGlobalTauri: true).
 * Returns undefined in browser / Docker mode.
 */
function getTauriListen():
  | ((event: string, handler: (e: TauriEvent<TauriUpdatePayload>) => void) => Promise<() => void>)
  | undefined {
  const w = globalThis as unknown as Record<string, unknown>;
  const tauri = w.__TAURI__ as Record<string, unknown> | undefined;
  const eventModule = tauri?.event as Record<string, unknown> | undefined;
  return eventModule?.listen as
    | ((event: string, handler: (e: TauriEvent<TauriUpdatePayload>) => void) => Promise<() => void>)
    | undefined;
}

// ── Hook ───────────────────────────────────────────────────────────────────

const DISMISS_KEY = "companion_update_dismissed";
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const RELEASE_BASE_URL = "https://github.com/nhadaututtheky/companion-release/releases";

function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const applyUpdate = useCallback((info: UpdateInfo) => {
    if (info.available) {
      const dismissedVersion = localStorage.getItem(DISMISS_KEY);
      if (dismissedVersion === info.latestVersion) {
        setDismissed(true);
      } else {
        setDismissed(false);
      }
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

  return { update, dismissed, dismiss, checkNow };
}

// ── Component ──────────────────────────────────────────────────────────────

export function UpdateBanner() {
  const { update, dismissed, dismiss } = useUpdateCheck();

  if (!update?.available || dismissed) return null;

  const relativeTime = update.publishedAt ? formatRelativeDate(update.publishedAt) : "";

  return (
    <div
      className="bg-bg-card fixed bottom-4 right-4 flex max-w-sm items-start gap-3 rounded-xl px-4 py-3"
      style={{
        zIndex: Z.overlay,
        border: "1px solid var(--color-accent)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)",
        animation: "slideUp 300ms ease",
      }}
      role="alert"
    >
      <div
        className="mt-0.5 flex-shrink-0 rounded-lg p-1.5"
        style={{ background: "var(--color-accent)15" }}
      >
        <Rocket size={18} weight="fill" className="text-accent" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-text-primary text-xs font-bold">Update Available</span>
          <span
            className="text-accent rounded-full px-1.5 py-0.5 font-mono text-xs"
            style={{
              background: "var(--color-accent)20",
              fontSize: 10,
            }}
          >
            v{update.latestVersion}
          </span>
        </div>

        <p className="text-text-muted text-xs">
          You&apos;re on v{update.currentVersion}.{relativeTime ? ` Released ${relativeTime}.` : ""}
        </p>

        <div className="mt-1 flex items-center gap-2">
          <a
            href={update.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <ArrowSquareUpRight size={12} weight="bold" />
            View Release
          </a>
          <button
            onClick={() => dismiss(update.latestVersion)}
            className="text-text-muted cursor-pointer rounded-lg px-2 py-1 text-xs transition-all"
            aria-label="Dismiss update notification"
          >
            Later
          </button>
        </div>
      </div>

      <button
        onClick={() => dismiss(update.latestVersion)}
        className="text-text-muted flex-shrink-0 cursor-pointer rounded p-0.5 transition-all"
        aria-label="Close"
      >
        <X size={14} />
      </button>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
