"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, File, FolderOpen, SpinnerGap } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { MarkdownReviewer } from "@/components/review/markdown-reviewer";

// ── Types ────────────────────────────────────────────────────────────────────

interface ReviewFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const projectSlug = searchParams.get("project");
  const filePath = searchParams.get("file");

  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(filePath);

  // Load file list
  useEffect(() => {
    if (!projectSlug) return;
    api
      .get<{ success: boolean; data: ReviewFile[] }>(
        `/api/review/files?project=${encodeURIComponent(projectSlug)}`,
      )
      .then((res) => {
        if (res.data) setFiles(res.data);
      })
      .catch(() => {});
  }, [projectSlug]);

  // Load file content
  const loadFile = useCallback(
    async (path: string) => {
      if (!projectSlug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<{ success: boolean; data: { path: string; content: string } }>(
          `/api/review/read?project=${encodeURIComponent(projectSlug)}&file=${encodeURIComponent(path)}`,
        );
        setContent(res.data.content);
        setActiveFile(path);
        // Update URL without reload
        const url = new URL(window.location.href);
        url.searchParams.set("file", path);
        window.history.replaceState({}, "", url.toString());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [projectSlug],
  );

  // Auto-load file from URL
  useEffect(() => {
    if (filePath && projectSlug) {
      loadFile(filePath);
    }
  }, [filePath, projectSlug, loadFile]);

  // Handle comment submission
  const handleComment = useCallback(
    async (afterLine: number, comment: string, selectedText?: string) => {
      if (!projectSlug || !activeFile) return;
      await api.post("/api/review/comment", {
        project: projectSlug,
        file: activeFile,
        afterLine,
        comment,
        selectedText,
      });
      // Reload file to show the new comment
      await loadFile(activeFile);
    },
    [projectSlug, activeFile, loadFile],
  );

  // ── No project selected ────────────────────────────────────────────────

  if (!projectSlug) {
    return (
      <div
        className="flex items-center justify-center h-screen text-text-secondary"
      >
        <div className="text-center">
          <FolderOpen size={48} weight="duotone" style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p className="text-sm">
            Add{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs bg-bg-elevated"
            >
              ?project=slug&file=path.md
            </code>{" "}
            to the URL
          </p>
        </div>
      </div>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-bg-base">
      {/* Sidebar — file list */}
      <aside
        className="flex-shrink-0 overflow-y-auto bg-bg-card" style={{
          width: 260,
          borderRight: "1px solid var(--color-border)",
          }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <a
            href="/"
            className="p-1 rounded hover:opacity-70 transition-opacity"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} className="text-text-secondary" />
          </a>
          <span className="text-sm font-semibold text-text-primary">
            {projectSlug}
          </span>
        </div>

        {/* File list */}
        <div className="p-2">
          <div
            className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-text-secondary" style={{ opacity: 0.6 }}
          >
            Reviewable Files
          </div>
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => loadFile(f.path)}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors"
              style={{
                background: activeFile === f.path ? "rgba(66,133,244,0.1)" : "transparent",
                color: activeFile === f.path ? "#4285F4" : "var(--color-text-primary)",
              }}
            >
              <File size={14} weight={activeFile === f.path ? "fill" : "regular"} />
              <span className="truncate flex-1">{f.name}</span>
              <span
                className="text-xs text-text-secondary opacity-50"
              >
                {(f.size / 1024).toFixed(1)}K
              </span>
            </button>
          ))}
          {files.length === 0 && (
            <p className="px-3 py-4 text-xs text-text-secondary">
              No .md files found
            </p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <SpinnerGap
              size={24}
              className="animate-spin text-text-secondary"
            />
          </div>
        )}

        {error && (
          <div className="p-6">
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              {error}
            </div>
          </div>
        )}

        {!loading && !error && content !== null && (
          <div className="max-w-3xl mx-auto px-8 py-6">
            {/* File header */}
            <div
              className="flex items-center gap-2 mb-6 pb-4"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <File size={18} weight="duotone" style={{ color: "#4285F4" }} />
              <span className="text-sm font-mono text-text-secondary">
                {activeFile}
              </span>
            </div>

            {/* Markdown viewer with commenting */}
            <MarkdownReviewer content={content} onComment={handleComment} />
          </div>
        )}

        {!loading && !error && content === null && (
          <div
            className="flex items-center justify-center h-full text-text-secondary"
          >
            <div className="text-center">
              <File size={40} weight="duotone" style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p className="text-sm">Select a file to review</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
