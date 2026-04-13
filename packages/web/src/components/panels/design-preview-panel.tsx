"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Monitor,
  DeviceTablet,
  DeviceMobile,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowSquareOut,
  CaretLeft,
  CaretRight,
  Trash,
  Code,
  Eye,
  ShieldCheck,
  ShieldSlash,
} from "@phosphor-icons/react";
import { usePreviewStore, type PreviewArtifact } from "@/lib/stores/preview-store";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { id: "tablet", label: "Tablet", icon: DeviceTablet, width: "768px" },
  { id: "mobile", label: "Mobile", icon: DeviceMobile, width: "375px" },
] as const;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function ArtifactRenderer({
  artifact,
  zoom,
  safeMode,
}: {
  artifact: PreviewArtifact;
  zoom: number;
  safeMode: boolean;
}) {
  if (artifact.type === "image") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <img
          src={artifact.content}
          alt={artifact.label}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
            transition: "transform 200ms ease",
          }}
        />
      </div>
    );
  }

  // HTML or SVG — render in sandboxed iframe via srcdoc
  const htmlDoc =
    artifact.type === "svg"
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}</style></head><body>${artifact.content}</body></html>`
      : artifact.content.trim().startsWith("<!") || artifact.content.trim().startsWith("<html")
        ? artifact.content
        : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;}</style></head><body>${artifact.content}</body></html>`;

  return (
    <iframe
      srcDoc={htmlDoc}
      className="h-full w-full"
      style={{
        border: "none",
        background: "#fff",
        transform: `scale(${zoom})`,
        transformOrigin: "top center",
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        transition: "transform 200ms ease, width 200ms ease, height 200ms ease",
      }}
      sandbox={safeMode ? "" : "allow-scripts allow-forms"}
      title={artifact.label}
    />
  );
}

function SourceViewer({ artifact }: { artifact: PreviewArtifact }) {
  return (
    <div
      className="bg-bg-elevated h-full overflow-auto p-4"
      role="region"
      aria-label="Artifact source code"
    >
      <pre className="text-text-primary whitespace-pre-wrap font-mono text-xs leading-relaxed">
        {artifact.content}
      </pre>
    </div>
  );
}

export function DesignPreviewPanel() {
  const artifacts = usePreviewStore((s) => s.artifacts);
  const activeIndex = usePreviewStore((s) => s.activeIndex);
  const closePanel = usePreviewStore((s) => s.closePanel);
  const setActiveIndex = usePreviewStore((s) => s.setActiveIndex);
  const removeArtifact = usePreviewStore((s) => s.removeArtifact);

  const panelRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [zoomIndex, setZoomIndex] = useState(2); // default 1x
  const [showSource, setShowSource] = useState(false);
  const [safeMode, setSafeMode] = useState(true); // Safe Mode: no scripts by default

  // Auto-focus panel on mount so keyboard shortcuts work immediately
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const zoom = ZOOM_LEVELS[zoomIndex] ?? 1;
  const artifact = artifacts[activeIndex] as PreviewArtifact | undefined;
  const currentViewport = VIEWPORTS.find((v) => v.id === viewport)!;

  const zoomIn = useCallback(
    () => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1)),
    [],
  );
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(i - 1, 0)), []);

  const goPrev = useCallback(
    () => setActiveIndex(Math.max(0, activeIndex - 1)),
    [activeIndex, setActiveIndex],
  );
  const goNext = useCallback(
    () => setActiveIndex(Math.min(artifacts.length - 1, activeIndex + 1)),
    [activeIndex, artifacts.length, setActiveIndex],
  );

  const handleOpenExternal = useCallback(() => {
    if (!artifact) return;

    // Images are already data: URIs — open directly
    if (artifact.type === "image") {
      window.open(artifact.content, "_blank", "noopener,noreferrer");
      return;
    }

    const mime = artifact.type === "svg" ? "image/svg+xml" : "text/html";
    const blob = new Blob([artifact.content], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [artifact]);

  const handleDelete = useCallback(() => {
    if (!artifact) return;
    removeArtifact(artifact.id);
    if (artifacts.length <= 1) closePanel();
  }, [artifact, artifacts.length, removeArtifact, closePanel]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    },
    [closePanel, goPrev, goNext],
  );

  const artifactCounter = useMemo(
    () => (artifacts.length > 1 ? `${activeIndex + 1} / ${artifacts.length}` : null),
    [activeIndex, artifacts.length],
  );

  if (!artifact) {
    return (
      <div className="bg-bg-base flex h-full flex-col items-center justify-center gap-4">
        <Eye size={48} className="text-text-muted" />
        <p className="text-text-muted text-sm">No preview artifacts yet</p>
        <button
          onClick={closePanel}
          className="shadow-soft text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          Back to Chat
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="bg-bg-base flex h-full flex-col"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top bar */}
      <div
        className="bg-bg-card flex shrink-0 items-center gap-3 px-4 py-2.5"
        style={{
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {/* Back button */}
        <button
          onClick={closePanel}
          className="shadow-soft text-text-primary bg-bg-elevated flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          aria-label="Back to chat"
        >
          <ArrowLeft size={14} weight="bold" />
          Chat
        </button>

        {/* Artifact label + counter */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold">{artifact.label}</span>
          {artifactCounter && (
            <span
              className="text-text-muted rounded-full px-2 py-0.5 font-mono text-xs"
              style={{ background: "var(--color-bg-elevated)" }}
            >
              {artifactCounter}
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 font-mono text-xs uppercase"
            style={{
              background:
                artifact.type === "html"
                  ? "#4285F415"
                  : artifact.type === "svg"
                    ? "#34A85315"
                    : "#FBBC0415",
              color:
                artifact.type === "html"
                  ? "#4285F4"
                  : artifact.type === "svg"
                    ? "#34A853"
                    : "#FBBC04",
            }}
          >
            {artifact.type}
          </span>
        </div>

        {/* Navigation arrows */}
        {artifacts.length > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={goPrev}
              disabled={activeIndex <= 0}
              className="text-text-secondary cursor-pointer rounded p-1.5 transition-colors disabled:opacity-30"
              aria-label="Previous artifact"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <button
              onClick={goNext}
              disabled={activeIndex >= artifacts.length - 1}
              className="text-text-secondary cursor-pointer rounded p-1.5 transition-colors disabled:opacity-30"
              aria-label="Next artifact"
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />

        {/* Viewport switcher */}
        <div className="flex items-center gap-0.5">
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              onClick={() => setViewport(vp.id as typeof viewport)}
              className="cursor-pointer rounded p-1.5 transition-colors"
              style={{
                color: viewport === vp.id ? "var(--color-accent)" : "var(--color-text-muted)",
                background: viewport === vp.id ? "var(--color-accent)15" : "transparent",
              }}
              aria-label={vp.label}
              title={vp.label}
            >
              <vp.icon size={14} weight={viewport === vp.id ? "bold" : "regular"} />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={zoomIndex <= 0}
            className="text-text-secondary cursor-pointer rounded p-1.5 transition-colors disabled:opacity-30"
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinus size={14} weight="bold" />
          </button>
          <span className="text-text-muted min-w-[3ch] text-center font-mono text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
            className="text-text-secondary cursor-pointer rounded p-1.5 transition-colors disabled:opacity-30"
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlus size={14} weight="bold" />
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />

        {/* Safe mode toggle */}
        <button
          onClick={() => setSafeMode((v) => !v)}
          className="cursor-pointer rounded p-1.5 transition-colors"
          style={{
            color: safeMode ? "#10B981" : "#F59E0B",
            background: safeMode ? "#10B98115" : "#F59E0B15",
          }}
          aria-label={
            safeMode ? "Safe mode on — scripts blocked" : "Interactive mode — scripts allowed"
          }
          title={safeMode ? "Safe mode (scripts blocked)" : "Interactive mode (scripts allowed)"}
        >
          {safeMode ? (
            <ShieldCheck size={14} weight="bold" />
          ) : (
            <ShieldSlash size={14} weight="bold" />
          )}
        </button>

        {/* Toggle source / preview */}
        <button
          onClick={() => setShowSource((v) => !v)}
          className="cursor-pointer rounded p-1.5 transition-colors"
          style={{
            color: showSource ? "var(--color-accent)" : "var(--color-text-muted)",
            background: showSource ? "var(--color-accent)15" : "transparent",
          }}
          aria-label={showSource ? "Show preview" : "Show source"}
          title={showSource ? "Show preview" : "Show source"}
        >
          {showSource ? <Eye size={14} weight="bold" /> : <Code size={14} weight="bold" />}
        </button>

        {/* Open external */}
        <button
          onClick={handleOpenExternal}
          className="text-text-muted cursor-pointer rounded p-1.5 transition-colors"
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ArrowSquareOut size={14} weight="regular" />
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="text-text-muted cursor-pointer rounded p-1.5 transition-colors"
          aria-label="Remove artifact"
          title="Remove artifact"
        >
          <Trash size={14} weight="regular" />
        </button>
      </div>

      {/* Preview area */}
      <div className="flex flex-1 items-start justify-center overflow-hidden">
        <div
          className="border-border h-full overflow-auto overflow-hidden border"
          style={{
            width: currentViewport.width,
            maxWidth: "100%",
            transition: "width 300ms ease",
            ...(viewport !== "desktop"
              ? {
                  margin: "16px auto",
                  borderRadius: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                }
              : {}),
          }}
        >
          {showSource ? (
            <SourceViewer artifact={artifact} />
          ) : (
            <ArtifactRenderer artifact={artifact} zoom={zoom} safeMode={safeMode} />
          )}
        </div>
      </div>

      {/* Bottom artifact strip — thumbnails when multiple artifacts */}
      {artifacts.length > 1 && (
        <div
          className="bg-bg-card flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-2"
          style={{
            borderTop: "1px solid var(--color-border)",
          }}
        >
          {artifacts.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setActiveIndex(i)}
              aria-current={i === activeIndex ? "true" : undefined}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors"
              style={{
                background:
                  i === activeIndex ? "var(--color-accent)15" : "var(--color-bg-elevated)",
                color: i === activeIndex ? "var(--color-accent)" : "var(--color-text-secondary)",
                border: `1px solid ${i === activeIndex ? "var(--color-accent)" : "var(--color-border)"}`,
              }}
            >
              <span className="font-mono font-bold">{i + 1}</span>
              <span className="truncate" style={{ maxWidth: 120 }}>
                {a.label}
              </span>
              <span className="uppercase opacity-50" style={{ fontSize: 9 }}>
                {a.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
