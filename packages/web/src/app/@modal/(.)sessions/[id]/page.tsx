"use client";

/**
 * Intercepting route: when the user navigates to `/sessions/[id]` from
 * within the app (e.g. clicking expand on a session card from `/`), render
 * the SessionView inside a modal overlay INSTEAD of leaving the current page.
 *
 * A direct URL visit to `/sessions/[id]` (bookmark, share link, new tab) is
 * NOT intercepted — the standalone page at `app/sessions/[id]/page.tsx`
 * renders the full page. Same SessionView component, different chrome.
 *
 * Convention: `(.)sessions/[id]` tells Next.js to intercept the
 * `/sessions/[id]` route at the SAME segment level as this `@modal` slot.
 * Both `@modal` and `sessions/` live under the root `app/` directory, so
 * `(.)` is the correct marker — `(..)` would be invalid at the root level
 * (Next.js throws "Cannot use (..) marker at the root level").
 */

import { use, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SessionModalPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const previewPanelOpen = usePreviewPanelOpen(id);
  const setExpandedSession = useSessionStore((s) => s.setExpandedSession);

  // Sync grid dim state — SessionGrid looks at `expandedSessionId` to fade
  // other cards while the modal is open.
  useEffect(() => {
    setExpandedSession(id);
    return () => setExpandedSession(null);
  }, [id, setExpandedSession]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Close on Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: Z.modal }}
      role="dialog"
      aria-modal="true"
      aria-label="Session details"
    >
      {/* Backdrop */}
      <button
        className="absolute inset-0 cursor-default"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
        aria-label="Close session modal"
        onClick={handleClose}
        tabIndex={-1}
      />

      {/* Modal frame — reuses the slide-container so DesignPreviewPanel
          still slides in from the right when the Preview button fires. */}
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
        {/* Chat page (slides left when preview opens) */}
        <div className="session-slide-page session-slide-chat">
          <div className="flex h-full flex-col">
            {/* Modal chrome — title bar with close (no global Header) */}
            <div
              className="bg-bg-card flex flex-shrink-0 items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-xs font-semibold">Session</span>
              <span className="text-text-muted font-mono text-xs">#{id.slice(0, 8)}</span>
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
            {/* No `onBack` — modal uses the X button in the chrome above instead. */}
            <SessionView sessionId={id} />
          </div>
        </div>

        {/* Design Preview page (slides in from right) */}
        <div className="session-slide-page session-slide-preview">
          <PanelErrorBoundary name="Design Preview">
            <DesignPreviewPanel sessionId={id} />
          </PanelErrorBoundary>
        </div>
      </div>
    </div>
  );
}
