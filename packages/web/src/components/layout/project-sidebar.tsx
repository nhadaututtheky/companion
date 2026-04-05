"use client";
import { useMemo } from "react";
import {
  Plus,
  DotsThree,
  NotePencil,
} from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { useUiStore } from "@/lib/stores/ui-store";
import { SessionList } from "@/components/session/session-list";

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
  "#9C27B0", "#4285F4", "#34A853", "#FF9800",
  "#E91E63", "#00BCD4", "#FF5722", "#607D8B",
];

function getProjectColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) & 0xffff;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length]!;
}

function getProjectInitial(name: string): string {
  return (name[0] ?? "?").toUpperCase();
}

function resolveSlug(s: SessionItem): string {
  return s.projectSlug ?? s.projectName ?? "unknown";
}

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy"]);

// ── Main component ─────────────────────────────────────────────────────────

export function ProjectSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
}: ProjectSidebarProps) {
  const { sidebarExpanded, sidebarActiveProject, toggleSidebarProject } = useUiStore(
    useShallow((s) => ({
      sidebarExpanded: s.sidebarExpanded,
      sidebarActiveProject: s.sidebarActiveProject,
      toggleSidebarProject: s.toggleSidebarProject,
    })),
  );

  // Group sessions by project
  const groups = useMemo(() => {
    const map = new Map<string, ProjectGroup>();

    for (const s of sessions) {
      const slug = resolveSlug(s);
      if (!map.has(slug)) {
        map.set(slug, {
          slug,
          name: s.projectName || slug,
          sessions: [],
          activeCount: 0,
          initial: getProjectInitial(s.projectName || slug),
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
  }, [sessions]);

  // Find which project the active session belongs to
  const activeProjectSlug = useMemo(() => {
    if (!activeSessionId) return null;
    const s = sessions.find((s) => s.id === activeSessionId);
    return s ? resolveSlug(s) : null;
  }, [sessions, activeSessionId]);

  // Sessions filtered for the expanded project
  const filteredSessions = useMemo(() => {
    if (!sidebarActiveProject) return [];
    return sessions.filter((s) => resolveSlug(s) === sidebarActiveProject);
  }, [sessions, sidebarActiveProject]);

  const activeGroup = sidebarActiveProject
    ? groups.find((g) => g.slug === sidebarActiveProject)
    : null;

  return (
    <div className="flex h-full">
      {/* Icon rail — always visible */}
      <div
        className="flex flex-col items-center py-2 gap-1 flex-shrink-0 project-icon-rail"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Projects"
      >
        {groups.map((group) => {
          const isActive = sidebarActiveProject === group.slug;
          const containsActiveSession = activeProjectSlug === group.slug;
          const hasActiveSessions = group.activeCount > 0;

          return (
            <button
              key={group.slug}
              onClick={() => toggleSidebarProject(group.slug)}
              className="project-icon-btn relative flex items-center justify-center rounded-lg cursor-pointer"
              role="tab"
              aria-selected={isActive}
              data-active={isActive || undefined}
              data-has-active-session={containsActiveSession || undefined}
              style={{
                "--project-color": group.color,
              } as React.CSSProperties}
              title={`${group.name} (${group.sessions.length} session${group.sessions.length !== 1 ? "s" : ""})`}
              aria-label={`${group.name} project`}
            >
              {group.initial}
              {hasActiveSessions && !isActive && (
                <span className="project-icon-dot" />
              )}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* New session / Open project */}
        <button
          onClick={onNew}
          className="project-icon-btn project-icon-new flex items-center justify-center rounded-lg cursor-pointer"
          title="Open project (Ctrl+O)"
          aria-label="Open project"
          aria-keyshortcuts="Control+O"
        >
          <Plus size={18} weight="bold" />
        </button>
      </div>

      {/* Expanded panel — shows when a project is selected */}
      {sidebarExpanded && activeGroup && (
        <div
          className="flex flex-col flex-1 min-w-0 overflow-hidden project-panel"
          role="tabpanel"
        >
          {/* Project header */}
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <span
              className="flex items-center justify-center rounded-md flex-shrink-0"
              style={{
                width: 28,
                height: 28,
                background: `color-mix(in srgb, ${activeGroup.color} 12%, transparent)`,
                color: activeGroup.color,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {activeGroup.initial}
            </span>
            <div className="flex flex-col flex-1 min-w-0">
              <span
                className="text-sm font-semibold truncate"
                style={{ color: "var(--color-text-primary)" }}
              >
                {activeGroup.name}
              </span>
            </div>
            <button
              className="p-1 rounded cursor-pointer project-options-btn"
              aria-label="Project options"
              title="Project options"
              disabled
            >
              <DotsThree size={16} weight="bold" />
            </button>
          </div>

          {/* New session button */}
          <button
            onClick={onNew}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium cursor-pointer project-new-session-btn"
            style={{ borderBottom: "1px solid var(--color-border)" }}
            aria-label="New session"
          >
            <NotePencil size={14} weight="bold" />
            New session
          </button>

          {/* Session list for this project */}
          <div className="flex-1 overflow-hidden">
            <SessionList
              sessions={filteredSessions}
              activeSessionId={activeSessionId}
              onSelect={onSelect}
              onNew={onNew}
            />
          </div>
        </div>
      )}
    </div>
  );
}
