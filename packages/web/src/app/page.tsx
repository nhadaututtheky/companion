"use client";
import { useEffect, useMemo, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ArrowCounterClockwise, X, TelegramLogo, Globe, Trash } from "@phosphor-icons/react";
import { Header } from "@/components/layout/header";
import { BottomStatsBar } from "@/components/layout/bottom-stats-bar";
import { NavSidebar } from "@/components/layout/nav-sidebar";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
// StatsGrid moved to Header
import { ExpandedSession } from "@/components/grid/expanded-session";
import { MultiSessionLayout } from "@/components/layout/multi-session-layout";
import { NewSessionModal } from "@/components/session/new-session-modal";
import { CompanionLogo } from "@/components/layout/companion-logo";
import { ActivityTerminal } from "@/components/activity/activity-terminal";
import { FileExplorerPanel } from "@/components/panels/file-explorer-panel";
import { BrowserPreviewPanel } from "@/components/panels/browser-preview-panel";
import { SearchPanel } from "@/components/panels/search-panel";
import { TerminalPanel } from "@/components/panels/terminal-panel";
import { PanelErrorBoundary } from "@/components/ui/panel-error-boundary";
import { FloatingStatsBar } from "@/components/panels/floating-stats-bar";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { useNotificationPermission } from "@/hooks/use-notifications";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const AiContextPanel = dynamic(
  () => import("@/components/panels/ai-context-panel").then((m) => ({ default: m.AiContextPanel })),
  { ssr: false },
);
const WikiPanel = dynamic(
  () => import("@/components/panels/wiki-panel").then((m) => ({ default: m.WikiPanel })),
  { ssr: false },
);
const OnboardingWizard = dynamic(
  () => import("@/components/onboarding-wizard").then((m) => ({ default: m.OnboardingWizard })),
  { ssr: false },
);
const FeatureGuideModal = dynamic(
  () =>
    import("@/components/feature-guide/feature-guide-modal").then((m) => ({
      default: m.FeatureGuideModal,
    })),
  { ssr: false },
);

// ── Empty center state ─────────────────────────────────────────────────────

function EmptyCenter() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <CompanionLogo size="lg" />
      <p className="text-base text-center" style={{ color: "var(--color-text-secondary)" }}>
        Select a session or start a new one
      </p>
    </div>
  );
}

// ── Resumable Sessions Banner ──────────────────────────────────────────────

interface ResumableSession {
  id: string;
  projectSlug: string | null;
  model: string;
  source: string;
  cwd: string;
  cliSessionId: string;
  endedAt: number;
}

interface ResumeBannerProps {
  sessions: ResumableSession[];
  onResume: (id: string) => void;
  onDismissOne: (id: string) => void;
  onDismiss: () => void;
}

function ResumeBanner({ sessions, onResume, onDismissOne, onDismiss }: ResumeBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const handleResume = useCallback(
    async (id: string) => {
      setResumingId(id);
      try {
        await onResume(id);
      } finally {
        setResumingId(null);
      }
    },
    [onResume],
  );

  const projectLabel = (s: ResumableSession) => {
    if (s.projectSlug) return s.projectSlug;
    const parts = s.cwd.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? s.cwd;
  };

  const modelShort = (model: string) =>
    model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : "Sonnet";

  const SourceIcon = ({ source }: { source: string }) => {
    if (source === "telegram")
      return (
        <TelegramLogo
          size={12}
          weight="fill"
          style={{ color: "var(--color-accent)" }}
          aria-label="From Telegram"
        />
      );
    return <Globe size={12} style={{ color: "var(--color-text-muted)" }} aria-label="From Web" />;
  };

  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--color-accent) 6%, transparent)",
        borderBottom: "1px solid color-mix(in srgb, var(--color-accent) 18%, transparent)",
      }}
    >
      {/* Summary row */}
      <div className="flex items-center gap-2 px-4 py-2">
        <ArrowCounterClockwise
          size={14}
          style={{ color: "var(--color-accent)" }}
          weight="bold"
          aria-hidden="true"
        />
        <span className="text-xs font-semibold flex-1" style={{ color: "var(--color-accent)" }}>
          {sessions.length === 1
            ? "1 session can be resumed"
            : `${sessions.length} sessions can be resumed`}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer transition-colors"
          style={{
            color: "var(--color-accent)",
            background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Show"}
        </button>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded cursor-pointer"
          style={{ color: "color-mix(in srgb, var(--color-accent) 50%, transparent)" }}
          aria-label="Dismiss resume banner"
        >
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Expanded session list */}
      {expanded && (
        <div
          className="flex flex-col"
          style={{
            borderTop: "1px solid color-mix(in srgb, var(--color-accent) 12%, transparent)",
          }}
        >
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-2"
              style={{
                borderBottom: "1px solid color-mix(in srgb, var(--color-accent) 8%, transparent)",
              }}
            >
              <SourceIcon source={s.source} />
              <div className="flex flex-col flex-1 min-w-0">
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {projectLabel(s)}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
                >
                  {modelShort(s.model)} &bull;{" "}
                  {new Date(s.endedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <button
                onClick={() => onDismissOne(s.id)}
                className="p-1.5 rounded cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{ color: "var(--color-text-muted)" }}
                aria-label={`Dismiss session ${projectLabel(s)}`}
              >
                <Trash size={12} weight="bold" aria-hidden="true" />
              </button>
              <button
                onClick={() => handleResume(s.id)}
                disabled={resumingId === s.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                style={{ background: "var(--color-accent)", color: "#fff" }}
                aria-label={`Resume session for ${projectLabel(s)}`}
              >
                <ArrowCounterClockwise
                  size={11}
                  weight="bold"
                  className={resumingId === s.id ? "animate-spin" : ""}
                  aria-hidden="true"
                />
                {resumingId === s.id ? "Resuming..." : "Resume"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root page ──────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ["starting", "running", "waiting", "idle", "busy", "error"];

export default function DashboardPage() {
  const newSessionOpen = useUiStore((s) => s.newSessionModalOpen);
  const setNewSessionOpen = useUiStore((s) => s.setNewSessionModalOpen);
  const activityTerminalOpen = useUiStore((s) => s.activityTerminalOpen);
  const setActivityTerminalOpen = useUiStore((s) => s.setActivityTerminalOpen);
  const featureGuideOpen = useUiStore((s) => s.featureGuideOpen);
  const setFeatureGuideOpen = useUiStore((s) => s.setFeatureGuideOpen);
  const rightPanelMode = useUiStore((s) => s.rightPanelMode);
  const rightPanelPath = useUiStore((s) => s.rightPanelPath);
  const browserPreviewUrl = useUiStore((s) => s.browserPreviewUrl);
  const setRightPanelMode = useUiStore((s) => s.setRightPanelMode);
  const setRightPanelPath = useUiStore((s) => s.setRightPanelPath);
  const [resumableSessions, setResumableSessions] = useState<ResumableSession[]>([]);
  const [resumeBannerDismissed, setResumeBannerDismissed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Request browser notification permission on first load
  useNotificationPermission();

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    gridOrder,
    addToGrid,
    expandedSessionId,
    setExpandedSession,
    closedIds,
  } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      setActiveSession: s.setActiveSession,
      gridOrder: s.gridOrder,
      addToGrid: s.addToGrid,
      expandedSessionId: s.expandedSessionId,
      setExpandedSession: s.setExpandedSession,
      closedIds: s.closedIds,
    })),
  );

  const sessionList = useMemo(
    () =>
      Object.values(sessions).map((s) => ({
        id: s.id,
        shortId: s.shortId ?? s.state?.short_id,
        projectSlug: s.projectSlug ?? s.projectName,
        projectName: s.projectName,
        model: s.model,
        status: s.status,
        totalCostUsd: s.state?.total_cost_usd ?? 0,
        numTurns: s.state?.num_turns ?? 0,
        createdAt: s.createdAt,
        tags: s.tags ?? [],
      })),
    [sessions],
  );

  // Ordered active sessions for grid (up to 6)
  const gridSessions = useMemo(() => {
    // Filter active sessions — exclude child sessions (they live in parent's agent tabs)
    const active = Object.values(sessions).filter(
      (s) => ACTIVE_STATUSES.includes(s.status) && !s.parentSessionId,
    );

    // Use gridOrder for ordering, fallback to insertion order
    const ordered = gridOrder
      .map((id) => sessions[id])
      .filter(
        (s): s is NonNullable<typeof s> =>
          !!s && ACTIVE_STATUSES.includes(s.status) && !s.parentSessionId,
      );

    // Add any active sessions not yet in gridOrder (unless user closed them)
    for (const s of active) {
      if (!ordered.find((o) => o.id === s.id) && !closedIds.has(s.id)) {
        ordered.push(s);
      }
    }

    return ordered.slice(0, 6).map((s) => ({
      id: s.id,
      projectName: s.projectName,
      model: s.model,
      status: s.status,
    }));
  }, [sessions, gridOrder, closedIds]);

  // Fetch sessions on mount
  useEffect(() => {
    api.sessions
      .list()
      .then((res) => {
        const data = res.data as {
          sessions: Array<{
            id: string;
            shortId?: string;
            projectSlug: string;
            status: string;
            model: string;
            totalCostUsd: number;
            numTurns: number;
            createdAt: string;
            state: unknown;
          }>;
        };

        for (const s of data.sessions ?? []) {
          // Only load active sessions — skip ended/error to keep sidebar clean
          if (!ACTIVE_STATUSES.includes(s.status)) continue;

          const parentId = (s as { parentId?: string }).parentId;
          const role = (s as { role?: string }).role;
          useSessionStore.getState().setSession(s.id, {
            id: s.id,
            shortId: s.shortId,
            projectSlug: s.projectSlug,
            projectName: s.projectSlug || "session",
            model: s.model,
            status: s.status,
            state: s.state as unknown as import("@companion/shared").SessionState,
            createdAt: new Date(s.createdAt).getTime() || Date.now(),
            tags: (s as { tags?: string[] }).tags ?? [],
            personaId: (s as { personaId?: string }).personaId,
            parentSessionId: parentId,
            brainRole: role as "coordinator" | "specialist" | "researcher" | "reviewer" | undefined,
            agentName: (s as { name?: string }).name ?? undefined,
          });
          // Don't add child sessions to grid — they live in parent's agent tabs
          if (!parentId) {
            useSessionStore.getState().addToGrid(s.id);
          } else {
            // Track child in parent's childSessionIds
            useSessionStore.getState().addChildSession(parentId, s.id);
          }
        }
      })
      .catch(() => {
        // Server might not be running yet
      });
  }, []);

  // Fetch resumable sessions on mount
  useEffect(() => {
    api.sessions
      .listResumable()
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setResumableSessions(res.data);
        }
      })
      .catch(() => {
        // Server might not be running yet
      });
  }, []);

  const handleResume = useCallback(
    async (id: string) => {
      try {
        const res = await api.sessions.resume(id);
        const sessionId = res.data.sessionId;

        // Find original session data
        const original = resumableSessions.find((s) => s.id === id);
        const projectSlug = original?.projectSlug ?? "session";
        const modelShort = original?.model ?? "claude-sonnet-4-6";

        // Derive display name from cwd (folder name), not slug
        const cwdParts = (original?.cwd ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
        const projectName = cwdParts[cwdParts.length - 1] ?? projectSlug;

        useSessionStore.getState().setSession(sessionId, {
          id: sessionId,
          projectSlug,
          projectName,
          model: modelShort,
          status: "starting",
          createdAt: Date.now(),
        });

        useSessionStore.getState().addToGrid(sessionId);
        useSessionStore.getState().setActiveSession(sessionId);

        // Remove the resumed session from the resumable list
        setResumableSessions((prev) => prev.filter((s) => s.id !== id));

        toast.success(`Resuming session: ${projectSlug}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to resume session");
        throw err;
      }
    },
    [resumableSessions],
  );

  // When a session is selected from the list, add it to the grid
  const handleSelectSession = useCallback(
    (id: string) => {
      setActiveSession(id);
      addToGrid(id);
    },
    [setActiveSession, addToGrid],
  );

  const handleNewSession = useCallback(() => {
    setNewSessionOpen(true);
  }, [setNewSessionOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+N / Cmd+N — new session
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        if (!expandedSessionId) {
          e.preventDefault();
          setNewSessionOpen(true);
        }
      }
      // Ctrl+` — toggle activity terminal
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setActivityTerminalOpen(!activityTerminalOpen);
      }
      // Ctrl+S or Escape — close nav sidebar / expanded session / right panel
      if ((e.ctrlKey && e.key === "s") || e.key === "Escape") {
        const navMenu = useUiStore.getState().activeNavMenu;
        if (navMenu) {
          e.preventDefault();
          useUiStore.getState().setActiveNavMenu(null);
        } else if (expandedSessionId) {
          e.preventDefault();
          setExpandedSession(null);
        } else if (rightPanelMode !== "none") {
          e.preventDefault();
          setRightPanelMode("none");
        }
      }
      // Ctrl+K — open search panel
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setRightPanelMode("search");
      }
      // Ctrl+/ or Cmd+/ — open Feature Guide
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setFeatureGuideOpen(!featureGuideOpen);
      }
      // Ctrl+1 through Ctrl+6 — switch to session by grid position
      if (e.ctrlKey && e.key >= "1" && e.key <= "6") {
        const index = parseInt(e.key, 10) - 1;
        const targetId = gridOrder[index];
        if (targetId) {
          e.preventDefault();
          setActiveSession(targetId);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    expandedSessionId,
    setNewSessionOpen,
    activityTerminalOpen,
    setActivityTerminalOpen,
    setExpandedSession,
    rightPanelMode,
    setRightPanelMode,
    featureGuideOpen,
    setFeatureGuideOpen,
    gridOrder,
    setActiveSession,
  ]);

  const handleCloseNewSession = useCallback(() => {
    setNewSessionOpen(false);
  }, [setNewSessionOpen]);

  const handleExpand = useCallback(
    (id: string) => {
      setExpandedSession(id);
    },
    [setExpandedSession],
  );

  const handleCloseExpanded = useCallback(() => {
    setExpandedSession(null);
  }, [setExpandedSession]);

  return (
    <div
      className="flex flex-col"
      style={{
        height: "100vh",
        background:
          "linear-gradient(135deg, var(--color-bg-base) 0%, color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-base)) 50%, var(--color-bg-base) 100%)",
      }}
    >
      {/* Expanded session overlay (Phase 3) */}
      <ExpandedSession sessionId={expandedSessionId} onClose={handleCloseExpanded} />

      {/* New Session modal (Phase 4) */}
      <NewSessionModal open={newSessionOpen} onClose={handleCloseNewSession} />

      <Header onMenuToggle={() => setMobileSidebarOpen(true)} />
      <FloatingStatsBar />

      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "8px 12px 12px 12px",
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            gap: 8,
            borderRadius: "var(--radius-xl)",
          }}
        >
          {/* Mobile sidebar overlay backdrop */}
          {mobileSidebarOpen && (
            <div
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 40,
                background: "rgba(0,0,0,0.4)",
              }}
            />
          )}

          {/* Left sidebar — icon rail + expandable project panel */}
          <aside
            className={[
              "companion-sidebar flex flex-shrink-0 overflow-hidden",
              // Mobile: fixed overlay; desktop: static in flex flow
              "fixed md:static",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
              "transition-transform duration-200 ease-in-out",
              "mobile-sidebar-overlay",
            ].join(" ")}
            style={{
              background: "var(--glass-bg-heavy)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-float)",
            }}
            aria-label="Project sidebar"
          >
            {/* Mobile close button */}
            <div
              className="md:hidden flex items-center justify-between px-4 py-2"
              style={{ borderBottom: "1px solid var(--color-border)", width: "100%" }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Projects
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-lg cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ color: "var(--color-text-muted)" }}
                aria-label="Close sidebar"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <ProjectSidebar
              sessions={sessionList}
              activeSessionId={activeSessionId}
              onSelect={(id) => {
                handleSelectSession(id);
                setMobileSidebarOpen(false);
              }}
              onNew={() => {
                handleNewSession();
                setMobileSidebarOpen(false);
              }}
            />
          </aside>

          {/* Main grid area */}
          <main
            className="flex flex-col flex-1 min-w-0 overflow-hidden"
            style={{
              position: "relative",
              background: "var(--color-bg-base)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-xl)",
            }}
          >
            {/* Stats watermark — centered behind sessions, click to expand */}
            <BottomStatsBar />

            {/* Resume banner */}
            {!resumeBannerDismissed && resumableSessions.length > 0 && (
              <ResumeBanner
                sessions={resumableSessions}
                onResume={handleResume}
                onDismissOne={async (id) => {
                  try {
                    await api.sessions.dismissResumable(id);
                    setResumableSessions((prev) => prev.filter((s) => s.id !== id));
                  } catch {
                    // ignore
                  }
                }}
                onDismiss={() => setResumeBannerDismissed(true)}
              />
            )}
            <MultiSessionLayout
              gridSessions={gridSessions}
              onExpand={handleExpand}
              emptyState={<EmptyCenter />}
            />
          </main>

          {/* Right panel — File Explorer, Browser Preview, or Search (desktop only, hidden on mobile to save space) */}
          {rightPanelMode !== "none" && (
            <aside
              className="hidden md:flex flex-col flex-shrink-0 overflow-hidden"
              style={{
                width:
                  rightPanelMode === "browser" || rightPanelMode === "terminal"
                    ? 600
                    : rightPanelMode === "wiki"
                      ? 520
                      : 480,
                background: "var(--glass-bg-heavy)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-xl)",
                boxShadow: "var(--shadow-float)",
                transition: "width 200ms ease",
              }}
            >
              {rightPanelMode === "files" && (
                <PanelErrorBoundary name="File Explorer">
                  <FileExplorerPanel
                    initialPath={rightPanelPath ?? undefined}
                    onClose={() => setRightPanelMode("none")}
                  />
                </PanelErrorBoundary>
              )}
              {rightPanelMode === "browser" && (
                <PanelErrorBoundary name="Browser Preview">
                  <BrowserPreviewPanel
                    initialUrl={browserPreviewUrl ?? undefined}
                    onClose={() => setRightPanelMode("none")}
                  />
                </PanelErrorBoundary>
              )}
              {rightPanelMode === "search" && (
                <PanelErrorBoundary name="Search">
                  <SearchPanel
                    searchRoot={rightPanelPath ?? ""}
                    onOpenFile={(path) => {
                      setRightPanelMode("files");
                      setRightPanelPath(path);
                    }}
                    onClose={() => setRightPanelMode("none")}
                  />
                </PanelErrorBoundary>
              )}
              {rightPanelMode === "terminal" && (
                <PanelErrorBoundary name="Terminal">
                  <TerminalPanel onClose={() => setRightPanelMode("none")} />
                </PanelErrorBoundary>
              )}
              {rightPanelMode === "ai-context" && (
                <PanelErrorBoundary name="AI Context">
                  <AiContextPanel
                    onClose={() => setRightPanelMode("none")}
                    projectSlug={
                      activeSessionId
                        ? (sessions[activeSessionId]?.projectSlug ?? undefined)
                        : undefined
                    }
                  />
                </PanelErrorBoundary>
              )}
              {rightPanelMode === "wiki" && (
                <PanelErrorBoundary name="Wiki">
                  <WikiPanel onClose={() => setRightPanelMode("none")} />
                </PanelErrorBoundary>
              )}
            </aside>
          )}
        </div>

        {/* Activity Terminal — collapsible bottom panel */}
        <ActivityTerminal
          open={activityTerminalOpen}
          onToggle={() => setActivityTerminalOpen(!activityTerminalOpen)}
        />
      </div>

      {/* Magic Ring moved to layout.tsx for cross-route persistence */}

      {/* First-run onboarding wizard */}
      <OnboardingWizard onOpenNewSession={handleNewSession} />

      {/* Feature Guide modal */}
      {featureGuideOpen && <FeatureGuideModal />}

      {/* Nav menu overlay — floats on top of sessions */}
      <NavSidebar />

      {/* Stats bar now rendered inside <main> as a watermark */}
    </div>
  );
}
