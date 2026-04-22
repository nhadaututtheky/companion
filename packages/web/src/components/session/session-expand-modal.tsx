"use client";

/**
 * Global state-driven session modal. Reads `expandedSessionId` from the
 * session store and renders `<SessionView />` in a centered overlay when
 * set. Closes via Esc, backdrop click, or the X button in the chrome.
 *
 * Why state-driven instead of a Next.js intercepting route: the Tauri
 * desktop build uses `output: "export"`, which forbids intercepting
 * routes. Store state gives us the same "modal opens in place, fullpage
 * route still works for direct URL visits" UX without the build-time
 * constraint.
 *
 * URL sync: when the modal opens, we `pushState` the matching
 * `/sessions/{id}` URL so (a) the address bar reflects what the user is
 * looking at and the URL is shareable, and (b) the browser Back button
 * closes the modal instead of leaving the app. A popstate listener
 * mirrors the browser nav into the store. On close we pop our pushed
 * entry so the prior URL is restored cleanly.
 *
 * Rendered from `app/page.tsx` so the layout.tsx has no @modal slot.
 */

import { useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { X } from "@phosphor-icons/react";
import { SessionView } from "@/components/session/session-view";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { Z } from "@/lib/z-index";
import { usePreviewPanelOpen } from "@/lib/stores/preview-store";
import { useSessionStore } from "@/lib/stores/session-store";

const DesignPreviewPanel = dynamic(
  () =>
    import("@/components/panels/design-preview-panel").then((m) => ({
      default: m.DesignPreviewPanel,
    })),
  { ssr: false },
);

export function SessionExpandModal() {
  const sessionId = useSessionStore((s) => s.expandedSessionId);
  const setExpandedSession = useSessionStore((s) => s.setExpandedSession);
  // Hooks must run in the same order every render — always call the preview
  // selector with a stable string. Empty string = no active session; the
  // selector maps that to `false` via its `?? false` fallback.
  const previewPanelOpen = usePreviewPanelOpen(sessionId ?? "");

  const handleClose = useCallback(() => {
    setExpandedSession(null);
  }, [setExpandedSession]);

  useEffect(() => {
    if (!sessionId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionId, handleClose]);

  // URL sync: push /sessions/{id} when the modal opens; pop it on close;
  // listen for browser Back/Forward and mirror into the store.
  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === "undefined") return;

    const target = `/sessions/${sessionId}`;
    const entryPath = window.location.pathname;
    let pushed = false;

    if (entryPath !== target) {
      window.history.pushState({ sessionModal: sessionId }, "", target);
      pushed = true;
    }

    const onPopState = () => {
      // Back/Forward navigated away from our pushed entry — close the modal.
      setExpandedSession(null);
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      // Pop our pushed entry so the previous URL is restored when the modal
      // closes via Esc / X / backdrop. Guarded so we never pop someone
      // else's history if the user has navigated elsewhere in between.
      if (pushed && window.location.pathname === target) {
        window.history.back();
      }
    };
  }, [sessionId, setExpandedSession]);

  if (!sessionId) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: Z.modal }}
      role="dialog"
      aria-modal="true"
      aria-label="Session details"
    >
      <button
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        aria-label="Close session modal"
        onClick={handleClose}
        tabIndex={-1}
      />
      <div
        className="session-slide-container relative flex overflow-hidden rounded-xl"
        data-preview-open={previewPanelOpen || undefined}
        style={{
          width: "min(1400px, 94vw)",
          height: "min(920px, 92vh)",
          background: "var(--color-bg-base)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="session-slide-page session-slide-chat">
          <div className="flex h-full flex-col">
            <div
              className="bg-bg-card flex flex-shrink-0 items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-xs font-semibold">Session</span>
              <span className="text-text-muted font-mono text-xs">#{sessionId.slice(0, 8)}</span>
              <div className="flex-1" />
              <button
                onClick={handleClose}
                className="text-text-muted hover:bg-bg-elevated cursor-pointer rounded p-1 transition-colors"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <SessionView sessionId={sessionId} />
          </div>
        </div>

        <div className="session-slide-page session-slide-preview">
          <PanelErrorBoundary name="Design Preview">
            <DesignPreviewPanel sessionId={sessionId} />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
