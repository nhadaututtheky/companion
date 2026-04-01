"use client";
import { useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  Globe,
  Monitor,
  DeviceMobile,
  DeviceTablet,
  Camera,
  ArrowSquareOut,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Viewport presets
const VIEWPORTS = [
  { id: "desktop", label: "Desktop", icon: Monitor, width: "100%", height: "100%" },
  { id: "tablet", label: "Tablet", icon: DeviceTablet, width: "768px", height: "1024px" },
  { id: "mobile", label: "Mobile", icon: DeviceMobile, width: "375px", height: "812px" },
] as const;

interface BrowserPreviewPanelProps {
  initialUrl?: string;
  onClose: () => void;
}

export function BrowserPreviewPanel({ initialUrl = "", onClose }: BrowserPreviewPanelProps) {
  const [url, setUrl] = useState(initialUrl || "http://localhost:3000");
  const [inputUrl, setInputUrl] = useState(initialUrl || "http://localhost:3000");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([initialUrl || "http://localhost:3000"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = useCallback((newUrl: string) => {
    // Ensure URL has protocol
    let normalized = newUrl.trim();
    if (!normalized) return;

    // Block dangerous URI schemes
    if (/^(javascript|data|vbscript):/i.test(normalized)) {
      toast.error("Only http:// and https:// URLs are allowed");
      return;
    }

    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "http://" + normalized;
    }

    setUrl(normalized);
    setInputUrl(normalized);
    setLoading(true);

    // Add to history — derive index from prev array length to avoid stale closure
    setHistory((prev) => {
      const newHistory = [...prev, normalized];
      return newHistory;
    });
    setHistoryIndex((prev) => prev + 1);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(inputUrl);
  };

  const goBack = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const prevUrl = history[newIndex]!;
    setUrl(prevUrl);
    setInputUrl(prevUrl);
  }, [historyIndex, history]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const nextUrl = history[newIndex]!;
    setUrl(nextUrl);
    setInputUrl(nextUrl);
  }, [historyIndex, history]);

  const refresh = useCallback(() => {
    if (iframeRef.current) {
      setLoading(true);
      iframeRef.current.src = url;
    }
  }, [url]);

  const handleScreenshot = useCallback(async () => {
    // Try to use the server's screenshot API (Playwright) if available
    try {
      const res = await fetch("/api/fs/screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": typeof window !== "undefined" ? (localStorage.getItem("api_key") ?? "") : "",
        },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `screenshot-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success("Screenshot saved");
        return;
      }
    } catch {
      // Playwright not available — fallback
    }

    // Fallback: notify user to use browser screenshot
    toast.info("Use Ctrl+Shift+S or browser screenshot tool");
  }, [url]);

  const openExternal = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const currentViewport = VIEWPORTS.find((v) => v.id === viewport)!;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg-base)" }}>
      {/* Navigation bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {/* Nav buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={goBack}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded cursor-pointer transition-colors disabled:opacity-30"
            style={{ color: "var(--color-text-secondary)", background: "none", border: "none" }}
            aria-label="Back"
          >
            <ArrowLeft size={13} weight="bold" />
          </button>
          <button
            onClick={goForward}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded cursor-pointer transition-colors disabled:opacity-30"
            style={{ color: "var(--color-text-secondary)", background: "none", border: "none" }}
            aria-label="Forward"
          >
            <ArrowRight size={13} weight="bold" />
          </button>
          <button
            onClick={refresh}
            className="p-1.5 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-secondary)", background: "none", border: "none" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={13} weight="bold" />
          </button>
        </div>

        {/* URL bar */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center">
          <div
            className="flex items-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Globe size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="flex-1 text-xs outline-none bg-transparent font-mono"
              style={{ color: "var(--color-text-primary)" }}
            />
            {loading && (
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                ...
              </span>
            )}
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {/* Viewport buttons */}
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              onClick={() => setViewport(vp.id as typeof viewport)}
              className="p-1.5 rounded cursor-pointer transition-colors"
              style={{
                color: viewport === vp.id ? "var(--color-accent)" : "var(--color-text-muted)",
                background: viewport === vp.id ? "var(--color-accent-alpha)" : "none",
                border: "none",
              }}
              aria-label={vp.label}
              title={vp.label}
            >
              <vp.icon size={13} weight={viewport === vp.id ? "bold" : "regular"} />
            </button>
          ))}

          <div
            style={{
              width: 1,
              height: 16,
              background: "var(--color-border)",
              margin: "0 2px",
            }}
          />

          <button
            onClick={handleScreenshot}
            className="p-1.5 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="Screenshot"
            title="Screenshot"
          >
            <Camera size={13} weight="regular" />
          </button>
          <button
            onClick={openExternal}
            className="p-1.5 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="Open in browser"
            title="Open in browser"
          >
            <ArrowSquareOut size={13} weight="regular" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted)", background: "none", border: "none" }}
            aria-label="Close"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>

      {/* Iframe container */}
      <div
        className="flex-1 flex items-start justify-center overflow-auto"
        style={{ background: "var(--color-bg-elevated, #1a1a2e)" }}
      >
        <div
          style={{
            width: currentViewport.width,
            height: currentViewport.height,
            maxWidth: "100%",
            maxHeight: "100%",
            transition: "width 300ms ease, height 300ms ease",
            ...(viewport !== "desktop"
              ? {
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  overflow: "hidden",
                  margin: 16,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                }
              : {}),
          }}
        >
          {url ? (
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full"
              style={{
                border: "none",
                background: "#fff",
                borderRadius: viewport !== "desktop" ? 8 : 0,
              }}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              title="Browser Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Enter a URL to preview
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        className="flex items-center justify-between px-3 py-1 shrink-0"
        style={{
          background: "var(--color-bg-elevated)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <span
          className="text-xs font-mono truncate"
          style={{ color: "var(--color-text-muted)", fontSize: 10 }}
        >
          {url}
        </span>
        <span
          className="text-xs shrink-0"
          style={{ color: "var(--color-text-muted)", fontSize: 10 }}
        >
          {viewport !== "desktop" && `${currentViewport.width} × ${currentViewport.height}`}
        </span>
      </div>
    </div>
  );
}
