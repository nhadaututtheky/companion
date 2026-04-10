"use client";

import { type ChangeEvent } from "react";
import {
  FolderOpen,
  GithubLogo,
  MagnifyingGlass,
  CircleNotch,
  FolderSimple,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { DirectoryBrowser } from "../directory-browser";
import { PlatformPicker } from "../platform-picker";
import type { CLIPlatformInfo } from "@/hooks/use-cli-platforms";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProjectItem {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
}

export interface ResumableSession {
  id: string;
  projectSlug: string | null;
  model: string;
  cwd: string;
  cliSessionId: string;
  endedAt: number;
}

interface StepProjectProps {
  projectSearch: string;
  onProjectSearchChange: (v: string) => void;
  projects: ProjectItem[];
  projectsLoading: boolean;
  onSelectProject: (p: ProjectItem) => void;
  resumableSessions: ResumableSession[];
  onResumeSession: (s: ResumableSession) => void;
  resumingId: string | null;
  atLimit: boolean;
  showDirBrowser: boolean;
  onShowDirBrowser: (v: boolean) => void;
  onDirSelected: (path: string) => void;
  showGithubInput: boolean;
  onShowGithubInput: (v: boolean | ((prev: boolean) => boolean)) => void;
  githubUrl: string;
  onGithubUrlChange: (v: string) => void;
  onGithubAdd: () => void;
  selectedPlatform: "claude" | "codex" | "gemini" | "opencode";
  onSelectPlatform: (id: "claude" | "codex" | "gemini" | "opencode") => void;
  detectedPlatforms: CLIPlatformInfo[];
  platformsLoading: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StepProject(props: StepProjectProps) {
  const {
    projectSearch,
    onProjectSearchChange,
    projects,
    projectsLoading,
    onSelectProject,
    resumableSessions,
    onResumeSession,
    resumingId,
    atLimit,
    showDirBrowser,
    onShowDirBrowser,
    onDirSelected,
    showGithubInput,
    onShowGithubInput,
    githubUrl,
    onGithubUrlChange,
    onGithubAdd,
    selectedPlatform,
    onSelectPlatform,
    detectedPlatforms,
    platformsLoading,
  } = props;

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.dir.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  if (showDirBrowser) {
    return (
      <DirectoryBrowser
        onSelect={onDirSelected}
        onCancel={() => onShowDirBrowser(false)}
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 360 }}>
      {/* Search */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <MagnifyingGlass
          size={14}
          style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={projectSearch}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onProjectSearchChange(e.target.value)}
          placeholder="Search projects..."
          className="flex-1 bg-transparent outline-none text-sm"
          style={{
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-body)",
          }}
          aria-label="Search projects"
          autoFocus
        />
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1" style={{ maxHeight: 260 }}>
        {projectsLoading && (
          <div className="flex items-center justify-center py-8">
            <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          </div>
        )}

        {!projectsLoading && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <FolderOpen size={28} aria-hidden="true" />
            <p className="text-sm">
              {projectSearch ? "No matching projects" : "No projects yet — browse a folder"}
            </p>
          </div>
        )}

        {!projectsLoading &&
          filteredProjects.map((p) => {
            const resumable = resumableSessions.find((r) => r.projectSlug === p.slug);
            return (
              <div key={p.slug}>
                <button
                  onClick={() => onSelectProject(p)}
                  className="w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors cursor-pointer"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FolderSimple size={15} style={{ color: "#FBBC04", flexShrink: 0 }} aria-hidden="true" />
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    <span className="ml-auto text-xs font-mono flex-shrink-0">
                      {p.defaultModel?.split("-")[1] ?? "sonnet"}
                    </span>
                  </div>
                  <span className="text-xs truncate pl-5">{p.dir}</span>
                </button>

                {resumable && (
                  <button
                    onClick={() => onResumeSession(resumable)}
                    disabled={atLimit || resumingId === resumable.id}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: "#4285F408" }}
                    onMouseEnter={(e) => {
                      if (!atLimit && resumingId !== resumable.id) {
                        (e.currentTarget as HTMLButtonElement).style.background = "#4285F415";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "#4285F408";
                    }}
                    aria-label={`Resume last session for ${p.name}`}
                  >
                    <ArrowCounterClockwise
                      size={13}
                      color="#4285F4"
                      weight="bold"
                      className={resumingId === resumable.id ? "animate-spin" : ""}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold" style={{ color: "#4285F4" }}>
                      {resumingId === resumable.id ? "Resuming..." : "Resume last session"}
                    </span>
                    <span className="text-xs ml-auto" style={{ color: "#4285F480" }}>
                      {new Date(resumable.endedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {/* Browse / GitHub actions */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => onShowDirBrowser(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <FolderOpen size={14} aria-hidden="true" />
          Browse folder...
        </button>

        <button
          onClick={() => onShowGithubInput((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          style={{
            background: showGithubInput ? "var(--color-bg-hover)" : "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <GithubLogo size={14} aria-hidden="true" />
          Add from GitHub
        </button>

        {showGithubInput && (
          <div className="flex-1 flex items-center gap-2">
            <input
              type="url"
              value={githubUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onGithubUrlChange(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="flex-1 px-2.5 py-1.5 rounded-md text-sm input-bordered"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-body)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onGithubAdd();
              }}
              autoFocus
              aria-label="GitHub repository URL"
            />
            <button
              onClick={onGithubAdd}
              disabled={!githubUrl.trim()}
              className="px-2.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#4285F4", color: "#fff" }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Platform picker */}
      <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
        <PlatformPicker
          platforms={detectedPlatforms}
          loading={platformsLoading}
          selected={selectedPlatform}
          onSelect={onSelectPlatform}
        />
      </div>
    </div>
  );
}
