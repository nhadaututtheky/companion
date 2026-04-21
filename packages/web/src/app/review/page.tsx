"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, File, FolderOpen, SpinnerGap } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { MarkdownReviewer } from "@/components/review/markdown-reviewer";
import { useFetch } from "@/hooks/use-fetch";

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
  const {
    data: content,
    loading,
    error,
    run: runLoadFile,
  } = useFetch<string, [string]>(async (path) => {
    if (!projectSlug) throw new Error("No project selected");
    const res = await api.get<{ success: boolean; data: { path: string; content: string } }>(
      `/api/review/read?project=${encodeURIComponent(projectSlug)}&file=${encodeURIComponent(path)}`,
    );
    return res.data.content;
  });

  const loadFile = useCallback(
    async (path: string) => {
      if (!projectSlug) return;
      const result = await runLoadFile(path);
      if (result !== undefined) {
        setActiveFile(path);
        const url = new URL(window.location.href);
        url.searchParams.set("file", path);
        window.history.replaceState({}, "", url.toString());
      }
    },
    [projectSlug, runLoadFile],
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
      <div className="text-text-secondary flex h-screen items-center justify-center">
        <div className="text-center">
          <FolderOpen size={48} weight="duotone" style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p className="text-sm">
            Add{" "}
            <code className="bg-bg-elevated rounded px-1.5 py-0.5 text-xs">
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
    <div className="bg-bg-base flex h-screen">
      {/* Sidebar — file list */}
      <aside
        className="bg-bg-card flex-shrink-0 overflow-y-auto"
        style={{
          width: 260,
          boxShadow: "1px 0 0 var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ boxShadow: "0 1px 0 var(--color-border)" }}
        >
          <a
            href="/"
            className="rounded p-1 transition-opacity hover:opacity-70"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} className="text-text-secondary" />
          </a>
          <span className="text-text-primary text-sm font-semibold">{projectSlug}</span>
        </div>

        {/* File list */}
        <div className="p-2">
          <div
            className="text-text-secondary px-2 py-1 text-xs font-medium uppercase tracking-wider"
            style={{ opacity: 0.6 }}
          >
            Reviewable Files
          </div>
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => loadFile(f.path)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: activeFile === f.path ? "rgba(66,133,244,0.1)" : "transparent",
                color: activeFile === f.path ? "#4285F4" : "var(--color-text-primary)",
              }}
            >
              <File size={14} weight={activeFile === f.path ? "fill" : "regular"} />
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-text-secondary text-xs opacity-50">
                {(f.size / 1024).toFixed(1)}K
              </span>
            </button>
          ))}
          {files.length === 0 && (
            <p className="text-text-secondary px-3 py-4 text-xs">No .md files found</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <SpinnerGap size={24} className="text-text-secondary animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-6">
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              {error.message}
            </div>
          </div>
        )}

        {!loading && !error && content != null && (
          <div className="mx-auto max-w-3xl px-8 py-6">
            {/* File header */}
            <div
              className="mb-6 flex items-center gap-2 pb-4"
              style={{ boxShadow: "0 1px 0 var(--color-border)" }}
            >
              <File size={18} weight="duotone" style={{ color: "#4285F4" }} />
              <span className="text-text-secondary font-mono text-sm">{activeFile}</span>
            </div>

            {/* Markdown viewer with commenting */}
            <MarkdownReviewer content={content} onComment={handleComment} />
          </div>
        )}

        {!loading && !error && content == null && (
          <div className="text-text-secondary flex h-full items-center justify-center">
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
