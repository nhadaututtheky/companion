"use client";
import { useState, useEffect, useCallback } from "react";
import {
  FolderSimple,
  ArrowLeft,
  GitBranch,
  House,
  CaretRight,
  CircleNotch,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface DirEntry {
  name: string;
  path: string;
  hasGit: boolean;
}

interface BrowseRoot {
  label: string;
  path: string;
}

interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
}

// ── Breadcrumb bar ──────────────────────────────────────────────────────────

function Breadcrumbs({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (p: string) => void;
}) {
  // Split path by OS separator (both / and \)
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  // Reconstruct absolute path segments
  const isWindows = path.includes("\\") || /^[A-Za-z]:/.test(path);

  const getSegPath = (idx: number) => {
    if (isWindows) {
      // e.g. "C:/Users/foo" → parts[0]="C:", parts[1]="Users"
      return parts.slice(0, idx + 1).join("/");
    }
    return "/" + parts.slice(0, idx + 1).join("/");
  };

  return (
    <div
      className="flex items-center gap-1 flex-wrap text-xs overflow-x-auto"
      style={{ color: "var(--color-text-secondary)" }}
    >
      {parts.map((part, idx) => (
        <span key={idx} className="flex items-center gap-1 flex-shrink-0">
          {idx > 0 && (
            <CaretRight
              size={10}
              style={{ color: "var(--color-text-muted)" }}
              aria-hidden="true"
            />
          )}
          <button
            onClick={() => onNavigate(getSegPath(idx))}
            className="hover:underline cursor-pointer truncate max-w-32"
            style={{
              color:
                idx === parts.length - 1
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              fontWeight: idx === parts.length - 1 ? 600 : 400,
              fontFamily: "inherit",
              fontSize: "inherit",
              background: "none",
              border: "none",
              padding: 0,
            }}
          >
            {part}
          </button>
        </span>
      ))}
    </div>
  );
}

// ── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      aria-hidden="true"
    >
      <div
        className="rounded"
        style={{
          width: 16,
          height: 16,
          background: "var(--color-bg-elevated)",
          flexShrink: 0,
        }}
      />
      <div
        className="rounded"
        style={{
          height: 12,
          background: "var(--color-bg-elevated)",
          width: `${40 + Math.random() * 40}%`, // eslint-disable-line react-hooks/purity
        }}
      />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function DirectoryBrowser({ onSelect, onCancel: _onCancel }: DirectoryBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [roots, setRoots] = useState<BrowseRoot[]>([]);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  // Load roots on mount
  useEffect(() => {
    setLoading(true);
    api.fs
      .roots()
      .then((res) => {
        setRoots(res.data.roots);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load roots");
        setLoading(false);
      });
  }, []);

  const navigateTo = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.fs.browse(path);
        const rawDirs = res.data.dirs;

        // Check each subdir for .git via the browse API (check for dirs named ".git")
        // The server filters ".git" from HIDDEN_DIRS — we instead check if a
        // separate browse call with files=false returns it. Since hidden dirs are
        // filtered, we can't detect .git sub-entries this way. Instead we just
        // show the git indicator on the current path if it contains .git (visible
        // via a files=true call, but that's heavier). For simplicity, we detect
        // .git by noting it's in HIDDEN_DIRS on the server. We'll do a lightweight
        // approach: assume no sub-dirs have .git (server hides them). We instead
        // surface the git indicator on a directory that WAS selected by checking
        // if its parent browse includes any .git marker. Since the server hides
        // ".git", we cannot detect it from browse results. Skip git-detection for
        // sub-directories; only detect for the current selected directory by
        // attempting a raw browse of its contents with files=true.
        const mapped: DirEntry[] = rawDirs.map((name) => ({
          name,
          path: path.replace(/\\/g, "/").endsWith("/")
            ? `${path}${name}`
            : `${path}/${name}`.replace(/\\/g, "/"),
          hasGit: false, // server filters .git out — cannot detect from browse
        }));

        if (currentPath !== null) {
          setHistory((h) => [...h, currentPath]);
        }
        setCurrentPath(path);
        setEntries(mapped);
      } catch {
        setError("Cannot read directory");
      } finally {
        setLoading(false);
      }
    },
    [currentPath],
  );

  const navigateBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev === undefined) {
      // Go back to roots
      setCurrentPath(null);
      setEntries([]);
      setHistory([]);
    } else {
      const newHistory = history.slice(0, -1);
      setHistory(newHistory);
      setLoading(true);
      setError(null);
      api.fs
        .browse(prev)
        .then((res) => {
          const mapped: DirEntry[] = res.data.dirs.map((name) => ({
            name,
            path: `${prev.replace(/\\/g, "/")}/${name}`,
            hasGit: false,
          }));
          setCurrentPath(prev);
          setEntries(mapped);
        })
        .catch(() => setError("Cannot read directory"))
        .finally(() => setLoading(false));
    }
  }, [history]);

  const canGoBack = currentPath !== null;

  return (
    <div
      className="flex flex-col"
      style={{ height: 360 }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        {canGoBack && (
          <button
            onClick={navigateBack}
            className="flex items-center justify-center p-1.5 rounded-md transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="Go back"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          </button>
        )}

        <button
          onClick={() => {
            setCurrentPath(null);
            setEntries([]);
            setHistory([]);
          }}
          className="flex items-center justify-center p-1.5 rounded-md transition-colors cursor-pointer"
          style={{
            background: currentPath === null
              ? "var(--color-bg-hover)"
              : "var(--color-bg-elevated)",
            color: currentPath === null
              ? "var(--color-text-primary)"
              : "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
          }}
          aria-label="Go to drives / root folders"
        >
          <House size={14} weight="bold" aria-hidden="true" />
        </button>

        <div className="flex-1 min-w-0">
          {currentPath ? (
            <Breadcrumbs path={currentPath} onNavigate={navigateTo} />
          ) : (
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--color-text-muted)" }}
            >
              Select a root folder
            </span>
          )}
        </div>
      </div>

      {/* Directory list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="py-1">
            {[...Array(6)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {error && !loading && (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--color-danger)" }}
          >
            {error}
          </div>
        )}

        {!loading && !error && currentPath === null && (
          <div className="py-1">
            {roots.map((root) => (
              <button
                key={root.path}
                onClick={() => navigateTo(root.path)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                <House
                  size={16}
                  style={{ color: "#4285F4", flexShrink: 0 }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm font-medium flex-1 truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {root.label}
                </span>
                <span
                  className="text-xs font-mono truncate max-w-36"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {root.path}
                </span>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && currentPath !== null && entries.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            <FolderSimple size={28} aria-hidden="true" />
            <p className="text-sm">Empty folder</p>
          </div>
        )}

        {!loading && !error && currentPath !== null && entries.length > 0 && (
          <div className="py-1">
            {entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => navigateTo(entry.path)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                <FolderSimple
                  size={16}
                  style={{ color: "#FBBC04", flexShrink: 0 }}
                  aria-hidden="true"
                />
                <span
                  className="text-sm flex-1 truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {entry.name}
                </span>
                {entry.hasGit && (
                  <span
                    className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: "#34A85320",
                      color: "#34A853",
                    }}
                  >
                    <GitBranch size={10} aria-hidden="true" />
                    git
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer: select this folder */}
      {currentPath !== null && !loading && (
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span
            className="text-xs truncate max-w-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {currentPath}
          </span>
          <button
            onClick={() => onSelect(currentPath)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex-shrink-0"
            style={{
              background: "#4285F4",
              color: "#fff",
            }}
          >
            {loading ? (
              <CircleNotch size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <FolderSimple size={14} aria-hidden="true" />
            )}
            Select this folder
          </button>
        </div>
      )}
    </div>
  );
}
