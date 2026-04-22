"use client";

/**
 * Standalone fullpage route for a single session: `/sessions/[id]`.
 *
 * Thin wrapper — all session rendering delegates to `<SessionView />`.
 * This file owns only PAGE-level chrome: the global Header, the slide
 * animation container (so Preview pane slides in from the right), and
 * the DesignPreviewPanel itself. A future intercepting-route modal will
 * reuse `<SessionView />` with different page chrome, so the session UI
 * is shared across surfaces.
 */

import { use } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { SessionView } from "@/components/session/session-view";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { usePreviewPanelOpen } from "@/lib/stores/preview-store";

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

export function SessionPageClient({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const previewPanelOpen = usePreviewPanelOpen(id);

  return (
    <div className="session-slide-container" data-preview-open={previewPanelOpen || undefined}>
      {/* ── Chat Page (slides left when preview opens) ── */}
      <div className="session-slide-page session-slide-chat">
        <div className="bg-bg-base flex flex-col" style={{ height: "100vh" }}>
          <Header />
          <SessionView sessionId={id} onBack={() => router.back()} />
        </div>
      </div>

      {/* ── Design Preview Page (slides in from right) ── */}
      <div className="session-slide-page session-slide-preview">
        <PanelErrorBoundary name="Design Preview">
          <DesignPreviewPanel sessionId={id} />
        </PanelErrorBoundary>
      </div>
    </div>
  );
}
