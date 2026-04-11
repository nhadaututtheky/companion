"use client";
import { useMemo, useEffect, useState } from "react";
import {
  Plus,
  DotsThree,
  NotePencil,
  Plugs,
  PlugsConnected,
  Trash,
  CircleDashed,
  PencilSimple,
  SquaresFour,
} from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { SessionList } from "@/components/session/session-list";
import { WorkspaceCreateModal } from "./workspace-create-modal";
import type { Workspace, CLIPlatform } from "@companion/shared";

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionItem {
  id: string;
  shortId?: string;
  projectName: string;
  projectSlug?: string;
  model: string;
  status: string;
  totalCostUsd: number;
  numTurns: number;
  createdAt: number;
  tags?: string[];
}

interface ProjectGroup {
  slug: string;
  name: string;
  sessions: SessionItem[];
  activeCount: number;
  initial: string;
  color: string;
}

interface ProjectSidebarProps {
  sessions: SessionItem[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#9C27B0",
  "#4285F4",
  "#34A853",
  "#FF9800",
  "#E91E63",
  "#00BCD4",
  "#FF5722",
  "#607D8B",
];

const CLI_LABELS: Record<CLIPlatform, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

const CLI_COLORS: Record<CLIPlatform, string> = {
  claude: "#4285F4",
  codex: "#10b981",
  gemini: "#f59e0b",
  opencode: "#8b5cf6",
};

function getProjectColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) & 0xffff;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length]!;
}

function getInitial(name: string): string {
  return (name[0] ?? "?").toUpperCase();
}

function resolveSlug(s: SessionItem): string {
  return s.projectSlug ?? s.projectName ?? "unknown";
}

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

// ── Workspace Expanded Panel ──────────────────────────────────────────────

function WorkspacePanel({
  workspace,
  sessions,
  activeSessionId,
  onSelect,
  onNew,
}: {
  workspace: Workspace;
  sessions: SessionItem[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const { detail, detailLoading, deleteWorkspace, updateWorkspace } = useWorkspaceStore(
    useShallow((s) => ({
      detail: s.activeWorkspaceDetail,
      detailLoading: s.detailLoading,
      deleteWorkspace: s.deleteWorkspace,
      updateWorkspace: s.updateWorkspace,
    })),
  );
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const wsSessions = useMemo(
    () => sessions.filter((s) => resolveSlug(s) === workspace.projectSlug),
    [sessions, workspace.projectSlug],
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden project-panel" role="tabpanel">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
      >
        <span
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            background: `color-mix(in srgb, ${getProjectColor(workspace.projectSlug)} 12%, transparent)`,
            color: getProjectColor(workspace.projectSlug),
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {getInitial(workspace.name)}
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          {renaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (renameValue.trim() && renameValue.trim() !== workspace.name) {
                  updateWorkspace(workspace.id, { name: renameValue.trim() });
                }
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="text-sm font-semibold bg-transparent border-b outline-none"
              style={{
                color: "var(--color-text-primary)",
                borderColor: "var(--color-primary, #6366f1)",
              }}
              autoFocus
            />
          ) : (
            <span
              className="text-sm font-semibold truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {workspace.name}
            </span>
          )}
          <span className="text-[10px] truncate" style={{ color: "var(--color-text-muted)" }}>
            {workspace.cliSlots.length} CLI{workspace.cliSlots.length !== 1 ? "s" : ""} configured
          </span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded cursor-pointer project-options-btn"
            aria-label="Workspace options"
          >
            <DotsThree size={16} weight="bold" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-50 py-1"
                style={{
                  width: 160,
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-float)",
                }}
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setRenameValue(workspace.name);
                    setRenaming(true);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  <PencilSimple size={12} weight="bold" />
                  Rename
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (window.confirm(`Delete workspace "${workspace.name}"?`)) {
                      deleteWorkspace(workspace.id);
                    }
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer"
                  style={{ color: "var(--color-danger, #ef4444)" }}
                >
                  <Trash size={12} weight="bold" />
                  Delete workspace
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CLI Slots */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--glass-border)" }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          CLI Agents
        </span>
        <div
          className="flex flex-col gap-1"
          style={{ opacity: detailLoading ? 0.5 : 1, transition: "opacity 150ms ease" }}
        >
          {workspace.cliSlots.map((cli) => {
            const cliStatus = detail?.clis?.find((c) => c.platform === cli);
            const status = cliStatus?.status ?? "disconnected";
            const isActive = status === "connected" || status === "running";
            const color = CLI_COLORS[cli];
            const dotColor =
              status === "connected" || status === "running"
                ? color
                : status === "idle"
                  ? "#f59e0b"
                  : status === "error"
                    ? "#ef4444"
                    : "var(--color-text-muted)";
            const dotOpacity = status === "disconnected" ? 0.4 : 1;

            return (
              <div
                key={cli}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                style={{
                  background: isActive
                    ? `color-mix(in srgb, ${color} 8%, transparent)`
                    : "transparent",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: dotColor,
                    opacity: dotOpacity,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="text-xs flex-1 truncate"
                  style={{
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {CLI_LABELS[cli]}
                </span>
                {isActive ? (
                  <PlugsConnected size={11} weight="bold" style={{ color, flexShrink: 0 }} />
                ) : (
                  <Plugs
                    size={11}
                    weight="regular"
                    style={{ color: "var(--color-text-muted)", opacity: 0.5, flexShrink: 0 }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {detailLoading && (
          <div className="flex items-center gap-1.5 mt-1.5 px-2">
            <CircleDashed
              size={10}
              weight="bold"
              className="animate-spin"
              style={{ color: "var(--color-text-muted)" }}
            />
            <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              Loading...
            </span>
          </div>
        )}
      </div>

      {/* New session button */}
      <button
        onClick={onNew}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium cursor-pointer project-new-session-btn"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
        aria-label="New session"
      >
        <NotePencil size={14} weight="bold" />
        New session
      </button>

      {/* Session list */}
      <div className="flex-1 overflow-hidden">
        <SessionList
          sessions={wsSessions}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNew={onNew}
        />
      </div>
    </div>
  );
}

// ── Legacy Project Panel (unchanged) ─────────────────────────────────────

function ProjectPanel({
  group,
  sessions,
  activeSessionId,
  onSelect,
  onNew,
}: {
  group: ProjectGroup;
  sessions: SessionItem[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const filteredSessions = useMemo(
    () => sessions.filter((s) => resolveSlug(s) === group.slug),
    [sessions, group.slug],
  );

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden project-panel" role="tabpanel">
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
      >
        <span
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            background: `color-mix(in srgb, ${group.color} 12%, transparent)`,
            color: group.color,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          {group.initial}
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {group.name}
          </span>
        </div>
        <button
          className="p-1 rounded cursor-pointer project-options-btn"
          aria-label="Project options"
          disabled
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </div>

      <button
        onClick={onNew}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium cursor-pointer project-new-session-btn"
        style={{ borderBottom: "1px solid var(--glass-border)" }}
        aria-label="New session"
      >
        <NotePencil size={14} weight="bold" />
        New session
      </button>

      <div className="flex-1 overflow-hidden">
        <SessionList
          sessions={filteredSessions}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNew={onNew}
        />
      </div>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────────────

export function ProjectSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
}: ProjectSidebarProps) {
  const {
    sidebarExpanded,
    sidebarActiveProject,
    toggleSidebarProject,
    workspaceCreateModalOpen,
    setWorkspaceCreateModalOpen,
  } = useUiStore(
    useShallow((s) => ({
      sidebarExpanded: s.sidebarExpanded,
      sidebarActiveProject: s.sidebarActiveProject,
      toggleSidebarProject: s.toggleSidebarProject,
      workspaceCreateModalOpen: s.workspaceCreateModalOpen,
      setWorkspaceCreateModalOpen: s.setWorkspaceCreateModalOpen,
    })),
  );

  const { workspaces, activeWorkspaceId, setActiveWorkspace, fetchWorkspaces } = useWorkspaceStore(
    useShallow((s) => ({
      workspaces: s.workspaces,
      activeWorkspaceId: s.activeWorkspaceId,
      setActiveWorkspace: s.setActiveWorkspace,
      fetchWorkspaces: s.fetchWorkspaces,
    })),
  );

  // Fetch workspaces on mount
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Set of project slugs owned by workspaces
  const workspaceProjectSlugs = useMemo(
    () => new Set(workspaces.map((ws) => ws.projectSlug)),
    [workspaces],
  );

  // Group remaining sessions by project (exclude workspace-owned projects)
  const ungroupedProjects = useMemo(() => {
    const map = new Map<string, ProjectGroup>();

    for (const s of sessions) {
      const slug = resolveSlug(s);
      if (workspaceProjectSlugs.has(slug)) continue;
      if (!map.has(slug)) {
        map.set(slug, {
          slug,
          name: s.projectName || slug,
          sessions: [],
          activeCount: 0,
          initial: getInitial(s.projectName || slug),
          color: getProjectColor(slug),
        });
      }
      const group = map.get(slug)!;
      group.sessions.push(s);
      if (ACTIVE_STATUSES.has(s.status)) {
        group.activeCount++;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.activeCount > 0 && b.activeCount === 0) return -1;
      if (a.activeCount === 0 && b.activeCount > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [sessions, workspaceProjectSlugs]);

  // Active session's project
  const activeProjectSlug = useMemo(() => {
    if (!activeSessionId) return null;
    const s = sessions.find((s) => s.id === activeSessionId);
    return s ? resolveSlug(s) : null;
  }, [sessions, activeSessionId]);

  // Count active sessions per workspace
  const wsActiveCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ws of workspaces) {
      let count = 0;
      for (const s of sessions) {
        if (resolveSlug(s) === ws.projectSlug && ACTIVE_STATUSES.has(s.status)) {
          count++;
        }
      }
      counts.set(ws.id, count);
    }
    return counts;
  }, [workspaces, sessions]);

  // Determine which panel to show
  const activeWs = workspaces.find((ws) => ws.id === activeWorkspaceId);
  const activeGroup = sidebarActiveProject
    ? ungroupedProjects.find((g) => g.slug === sidebarActiveProject)
    : null;

  const handleWorkspaceClick = (ws: Workspace) => {
    if (activeWorkspaceId === ws.id) {
      setActiveWorkspace(null);
    } else {
      setActiveWorkspace(ws.id);
      if (sidebarActiveProject) toggleSidebarProject(sidebarActiveProject);
    }
  };

  const handleProjectClick = (slug: string) => {
    if (activeWorkspaceId) setActiveWorkspace(null);
    toggleSidebarProject(slug);
  };

  return (
    <div className="flex h-full">
      {/* Icon rail */}
      <div
        className="flex flex-col items-center py-2 gap-1 flex-shrink-0 project-icon-rail"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Workspaces & Projects"
      >
        {/* Workspace icons */}
        {workspaces.map((ws) => {
          const isActive = activeWorkspaceId === ws.id;
          const activeCount = wsActiveCounts.get(ws.id) ?? 0;
          const color = getProjectColor(ws.projectSlug);

          return (
            <button
              key={ws.id}
              onClick={() => handleWorkspaceClick(ws)}
              className="project-icon-btn relative flex items-center justify-center rounded-lg cursor-pointer"
              role="tab"
              aria-selected={isActive}
              data-active={isActive || undefined}
              style={{ "--project-color": color } as React.CSSProperties}
              title={`${ws.name} (${ws.cliSlots.length} CLIs)`}
              aria-label={`${ws.name} workspace`}
            >
              {getInitial(ws.name)}
              {activeCount > 0 && !isActive && <span className="project-icon-dot" />}
            </button>
          );
        })}

        {/* Separator between workspaces and projects */}
        {workspaces.length > 0 && ungroupedProjects.length > 0 && (
          <div
            style={{
              width: 20,
              height: 1,
              background: "var(--glass-border)",
              margin: "2px 0",
            }}
          />
        )}

        {/* Ungrouped project icons */}
        {ungroupedProjects.map((group) => {
          const isActive = sidebarActiveProject === group.slug && !activeWorkspaceId;
          const containsActiveSession = activeProjectSlug === group.slug;
          const hasActiveSessions = group.activeCount > 0;

          return (
            <button
              key={group.slug}
              onClick={() => handleProjectClick(group.slug)}
              className="project-icon-btn relative flex items-center justify-center rounded-lg cursor-pointer"
              role="tab"
              aria-selected={isActive}
              data-active={isActive || undefined}
              data-has-active-session={containsActiveSession || undefined}
              style={{ "--project-color": group.color } as React.CSSProperties}
              title={`${group.name} (${group.sessions.length} session${group.sessions.length !== 1 ? "s" : ""})`}
              aria-label={`${group.name} project`}
            >
              {group.initial}
              {hasActiveSessions && !isActive && <span className="project-icon-dot" />}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* New workspace */}
        <button
          onClick={() => setWorkspaceCreateModalOpen(true)}
          className="project-icon-btn project-icon-new flex items-center justify-center rounded-lg cursor-pointer"
          title="New workspace"
          aria-label="Create workspace"
        >
          <SquaresFour size={16} weight="bold" />
        </button>

        {/* New session */}
        <button
          onClick={onNew}
          className="project-icon-btn project-icon-new flex items-center justify-center rounded-lg cursor-pointer"
          title="New session (Ctrl+O)"
          aria-label="New session"
          aria-keyshortcuts="Control+O"
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>

      {/* Expanded panel */}
      {activeWs && (
        <WorkspacePanel
          workspace={activeWs}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNew={onNew}
        />
      )}

      {!activeWs && sidebarExpanded && activeGroup && (
        <ProjectPanel
          group={activeGroup}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNew={onNew}
        />
      )}

      <WorkspaceCreateModal
        open={workspaceCreateModalOpen}
        onClose={() => setWorkspaceCreateModalOpen(false)}
      />
    </div>
  );
}
