"use client";
import { useState, useCallback, useRef } from "react";
import {
  ArrowSquareUpRight,
  X,
  Rocket,
  ArrowsClockwise,
  DownloadSimple,
  CaretDown,
} from "@phosphor-icons/react";
import { Z } from "@/lib/z-index";
import { isTauriEnv } from "@/lib/tauri";
import { useUpdateCheck } from "@/hooks/use-update-check";

// ── Types ──────────────────────────────────────────────────────────────────

type UpdatePhase = "idle" | "downloading" | "installing" | "done" | "error";

// ── Tauri global API types ─────────────────────────────────────────────────

/**
 * Access Tauri updater check() via global API.
 * Returns the update object if available, null otherwise.
 */
async function tauriUpdaterCheck(): Promise<{
  downloadAndInstall: (
    onProgress?: (event: {
      event: string;
      data: { chunkLength?: number; contentLength?: number };
    }) => void,
  ) => Promise<void>;
  version: string;
} | null> {
  const w = globalThis as unknown as Record<string, unknown>;
  const tauri = w.__TAURI__ as Record<string, unknown> | undefined;
  const updaterModule = tauri?.updater as Record<string, unknown> | undefined;
  const checkFn = updaterModule?.check as (() => Promise<unknown>) | undefined;
  if (!checkFn) return null;

  const result = await checkFn();
  if (!result) return null;

  return result as {
    downloadAndInstall: (
      onProgress?: (event: {
        event: string;
        data: { chunkLength?: number; contentLength?: number };
      }) => void,
    ) => Promise<void>;
    version: string;
  };
}

/** Call Tauri process relaunch() to restart the app after update */
async function tauriRelaunch(): Promise<void> {
  const w = globalThis as unknown as Record<string, unknown>;
  const tauri = w.__TAURI__ as Record<string, unknown> | undefined;
  const processModule = tauri?.process as Record<string, unknown> | undefined;
  const relaunchFn = processModule?.relaunch as (() => Promise<void>) | undefined;
  if (relaunchFn) {
    await relaunchFn();
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function UpdateBanner() {
  const { update, dismissed, dismiss } = useUpdateCheck();
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const downloadedRef = useRef(0);
  const contentLengthRef = useRef(0);
  const isDesktop = isTauriEnv();

  const handleUpdateNow = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("downloading");
    setDownloadPercent(0);
    downloadedRef.current = 0;
    contentLengthRef.current = 0;
    setErrorMsg("");

    try {
      const updateObj = await tauriUpdaterCheck();
      if (!updateObj) {
        setPhase("error");
        setErrorMsg("No update found");
        return;
      }

      await updateObj.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started": {
            downloadedRef.current = 0;
            contentLengthRef.current = event.data.contentLength ?? 0;
            break;
          }
          case "Progress": {
            downloadedRef.current += event.data.chunkLength ?? 0;
            if (contentLengthRef.current > 0) {
              const pct = Math.round((downloadedRef.current / contentLengthRef.current) * 100);
              setDownloadPercent(Math.min(pct, 99));
            } else {
              setDownloadPercent((prev) => Math.min(prev + 2, 99));
            }
            break;
          }
          case "Finished":
            setDownloadPercent(100);
            break;
        }
      });

      setPhase("installing");

      // Brief pause so user sees "Installing..." before restart
      await new Promise((r) => setTimeout(r, 500));
      await tauriRelaunch();

      // If relaunch didn't work (plugin missing), show done state
      setPhase("done");
    } catch (err) {
      console.error("Auto-update failed:", err);
      setPhase("error");
      setErrorMsg("Download failed. Check your internet connection and try again.");
    }
  }, [phase]);

  if (!update?.available || dismissed) return null;

  const relativeTime = update.publishedAt ? formatRelativeDate(update.publishedAt) : "";
  const isUpdating = phase === "downloading" || phase === "installing";

  return (
    <div
      className="bg-bg-card fixed bottom-4 right-4 flex max-w-sm flex-col rounded-xl px-4 py-3"
      style={{
        zIndex: Z.overlay,
        border: "1px solid var(--color-accent)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)",
        animation: "slideUp 300ms ease",
        width: 320,
      }}
      role="alert"
    >
      {/* Top row: icon + info + close */}
      <div className="flex items-start gap-3">
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
            You&apos;re on v{update.currentVersion}.
            {relativeTime ? ` Released ${relativeTime}.` : ""}
          </p>
        </div>

        {!isUpdating && (
          <button
            onClick={() => dismiss(update.latestVersion)}
            className="text-text-muted flex-shrink-0 cursor-pointer rounded p-0.5 transition-all"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Progress bar (visible during download) */}
      {phase === "downloading" && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-text-secondary text-xs font-medium">Downloading...</span>
            <span className="text-accent font-mono text-xs">{downloadPercent}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--color-bg-elevated)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${downloadPercent}%`,
                background: "var(--color-accent)",
                transition: "width 300ms ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Installing state */}
      {phase === "installing" && (
        <div className="mt-3 flex items-center gap-2">
          <ArrowsClockwise size={14} weight="bold" className="text-accent animate-spin" />
          <span className="text-text-secondary text-xs font-medium">
            Installing & restarting...
          </span>
        </div>
      )}

      {/* Done state (fallback if relaunch didn't trigger) */}
      {phase === "done" && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "#10b981" }}>
            Update installed! Please restart Companion manually.
          </span>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div className="mt-3">
          <p className="text-xs" style={{ color: "#ef4444" }}>
            Update failed: {errorMsg || "Unknown error"}
          </p>
          <button
            onClick={() => {
              setPhase("idle");
              setErrorMsg("");
            }}
            className="text-accent mt-1 cursor-pointer text-xs font-medium"
          >
            Try again
          </button>
        </div>
      )}

      {/* What's new (collapsible release notes) */}
      {phase === "idle" && update.releaseNotes?.trim() && (
        <div className="mt-2">
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="text-text-muted hover:text-text-secondary flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
            aria-expanded={notesOpen}
            aria-controls="update-release-notes"
          >
            <CaretDown
              size={10}
              weight="bold"
              className="transition-transform"
              style={{ transform: notesOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            What&apos;s new
          </button>
          {notesOpen && (
            <pre
              id="update-release-notes"
              className="text-text-secondary mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg p-2 font-sans text-xs leading-relaxed"
              style={{ background: "var(--color-bg-elevated)" }}
            >
              {update.releaseNotes.trim()}
            </pre>
          )}
        </div>
      )}

      {/* Action buttons */}
      {phase === "idle" && (
        <div className="mt-2.5 flex items-center gap-2">
          {isDesktop ? (
            <button
              onClick={() => void handleUpdateNow()}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              style={{ background: "var(--color-accent)", color: "#fff" }}
              aria-label="Download and install update"
            >
              <DownloadSimple size={13} weight="bold" />
              Update Now
            </button>
          ) : (
            <a
              href={update.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all"
              style={{ background: "var(--color-accent)", color: "#fff" }}
            >
              <ArrowSquareUpRight size={12} weight="bold" />
              View Release
            </a>
          )}
          <button
            onClick={() => dismiss(update.latestVersion)}
            className="text-text-muted cursor-pointer rounded-lg px-2 py-1.5 text-xs transition-all"
            aria-label="Dismiss update notification"
          >
            Later
          </button>
        </div>
      )}

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
