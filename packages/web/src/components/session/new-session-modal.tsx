"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  FolderOpen,
  GithubLogo,
  MagnifyingGlass,
  CircleNotch,
  Check,
  Rocket,
  FolderSimple,
  Warning,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAnimatePresence } from "@/lib/animation";
import { DirectoryBrowser } from "./directory-browser";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/lib/stores/session-store";

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: "Claude asks before any file or command changes",
  acceptEdits: "Claude auto-approves file edits, asks for commands",
  bypassPermissions: "Claude acts autonomously — no permission prompts",
  plan: "Claude plans only, no file or command execution",
};

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (default)" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];

interface ProjectItem {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
}

interface ResumableSession {
  id: string;
  projectSlug: string | null;
  model: string;
  cwd: string;
  cliSessionId: string;
  endedAt: number;
}

// ── Step indicator ──────────────────────────────────────────────────────────

function StepPills({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Project" },
    { n: 2, label: "Configure" },
    { n: 3, label: "Launch" },
  ];

  return (
    <div className="flex items-center gap-2">
      {steps.map(({ n, label }, idx) => (
        <div key={n} className="flex items-center gap-2">
          {idx > 0 && (
            <div
              style={{
                width: 24,
                height: 1,
                background:
                  current > idx
                    ? "#4285F4"
                    : "var(--color-border)",
              }}
              aria-hidden="true"
            />
          )}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
              style={{
                width: 22,
                height: 22,
                background:
                  current === n
                    ? "#4285F4"
                    : current > n
                      ? "#34A853"
                      : "var(--color-bg-elevated)",
                color:
                  current >= n ? "#fff" : "var(--color-text-muted)",
                border:
                  current === n
                    ? "none"
                    : `1px solid ${current > n ? "#34A853" : "var(--color-border)"}`,
              }}
            >
              {current > n ? (
                <Check size={12} weight="bold" aria-hidden="true" />
              ) : (
                n
              )}
            </div>
            <span
              className="text-xs font-medium"
              style={{
                color:
                  current === n
                    ? "var(--color-text-primary)"
                    : "var(--color-text-muted)",
              }}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Focus trap ──────────────────────────────────────────────────────────────

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(
    el.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((e) => !e.closest("[aria-hidden='true']"));
}

// ── Modal inner ─────────────────────────────────────────────────────────────

interface ModalInnerProps {
  onClose: () => void;
}

function NewSessionModalInner({ onClose }: ModalInnerProps) {
  const [step, setStep] = useState<Step>(1);
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [resumableSessions, setResumableSessions] = useState<ResumableSession[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);

  // Config step
  const [selectedDir, setSelectedDir] = useState("");
  const [projectName, setProjectName] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("default");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [resume, setResume] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState<number>(3_600_000); // 1h default
  const [_autoApprove, _setAutoApprove] = useState(false);

  // Launch step
  const [launching, setLaunching] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  const sessionCount = useSessionStore((s) =>
    Object.values(s.sessions).filter((sess) =>
      ["running", "waiting", "idle"].includes(sess.status),
    ).length,
  );
  const atLimit = sessionCount >= 6;

  // Fetch projects and resumable sessions in parallel
  useEffect(() => {
    Promise.all([
      api.projects.list().catch(() => ({ data: [] })),
      api.sessions.listResumable().catch(() => ({ data: [] })),
    ]).then(([projectsRes, resumableRes]) => {
      setProjects((projectsRes.data ?? []) as ProjectItem[]);
      setResumableSessions((resumableRes.data ?? []) as ResumableSession[]);
      setProjectsLoading(false);
    });
  }, []);

  // Esc to close + focus trap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = getFocusable(dialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleResumeSession = useCallback(async (s: ResumableSession) => {
    if (atLimit) return;
    setResumingId(s.id);
    try {
      const res = await api.sessions.resume(s.id);
      const sessionId = res.data.sessionId;
      const label = s.projectSlug ?? s.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "session";

      useSessionStore.getState().setSession(sessionId, {
        id: sessionId,
        projectSlug: s.projectSlug ?? label,
        projectName: label,
        model: s.model,
        status: "starting",
        createdAt: Date.now(),
      });
      useSessionStore.getState().addToGrid(sessionId);
      useSessionStore.getState().setActiveSession(sessionId);

      toast.success(`Resuming session: ${label}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume session");
    } finally {
      setResumingId(null);
    }
  }, [atLimit, onClose]);

  const handleSelectProject = useCallback((p: ProjectItem) => {
    setSelectedDir(p.dir);
    setProjectName(p.name);
    setModel(p.defaultModel || "claude-sonnet-4-6");
    setPermissionMode((p.permissionMode as PermissionMode) || "default");
    setStep(2);
  }, []);

  const handleDirSelected = useCallback((path: string) => {
    setShowDirBrowser(false);
    setSelectedDir(path);
    // Auto-fill project name from the last path segment
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    setProjectName(parts[parts.length - 1] ?? "");
    setStep(2);
  }, []);

  const handleGithubAdd = useCallback(() => {
    if (!githubUrl.trim()) return;
    // Parse github.com/<owner>/<repo>
    const match = githubUrl.match(
      /github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/,
    );
    const repoName = match ? match[2] : githubUrl.split("/").pop() ?? "repo";
    setProjectName(repoName ?? "repo");
    // Store URL as the "dir" metadata placeholder
    setSelectedDir(`github://${githubUrl.trim()}`);
    setShowGithubInput(false);
    setStep(2);
  }, [githubUrl]);

  const handleLaunch = useCallback(async () => {
    if (atLimit) return;
    setLaunching(true);
    try {
      // If it's a GitHub URL placeholder, we can't actually start it yet
      if (selectedDir.startsWith("github://")) {
        toast.info("GitHub project saved. Clone the repo first to start a session.");
        onClose();
        return;
      }

      const res = await api.sessions.start({
        projectDir: selectedDir,
        projectSlug: projectName
          ? projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
          : undefined,
        model,
        permissionMode,
        prompt: initialPrompt.trim() || undefined,
        idleTimeoutMs: idleTimeout,
        keepAlive: idleTimeout === 0,
      });

      const sessionId = res.data.sessionId;

      // Add to store and grid
      const slug = projectName
        ? projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
        : "session";
      useSessionStore.getState().setSession(sessionId, {
        id: sessionId,
        projectSlug: slug,
        projectName: projectName || slug,
        model,
        status: "starting",
        createdAt: Date.now(),
      });

      useSessionStore.getState().addToGrid(sessionId);
      useSessionStore.getState().setActiveSession(sessionId);

      toast.success(`Session started: ${projectName || selectedDir}`);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start session",
      );
    } finally {
      setLaunching(false);
    }
  }, [
    atLimit,
    selectedDir,
    projectName,
    model,
    permissionMode,
    initialPrompt,
    idleTimeout,
    onClose,
  ]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.dir.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 61,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          pointerEvents: "none",
        }}
        aria-hidden="false"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="New Session"
          style={{
            width: "100%",
            maxWidth: 600,
            borderRadius: 16,
            overflow: "hidden",
            pointerEvents: "auto",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow:
              "0 8px 40px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.1)",
          }}
          className="dark:bg-glass-dark"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--color-border)" }}
          >
            <div>
              <h2
                className="text-base font-bold"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-text-primary)",
                }}
              >
                New Session
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                {atLimit
                  ? "Maximum 6 sessions active — stop one to continue"
                  : "Launch a Claude Code session in a project"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <StepPills current={step} />
              <button
                onClick={onClose}
                className="flex items-center justify-center p-2 rounded-lg transition-colors cursor-pointer"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border)",
                }}
                aria-label="Close modal"
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Session limit warning */}
          {atLimit && (
            <div
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
              style={{
                background: "#EA433510",
                color: "#EA4335",
                borderBottom: "1px solid #EA433530",
              }}
            >
              <Warning size={16} aria-hidden="true" />
              Maximum 6 sessions active. Stop an existing session first.
            </div>
          )}

          {/* ── Step 1: Project selection ── */}
          {step === 1 && !showDirBrowser && (
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setProjectSearch(e.target.value)
                  }
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
                    <CircleNotch
                      size={20}
                      className="animate-spin"
                      style={{ color: "var(--color-text-muted)" }}
                      aria-hidden="true"
                    />
                  </div>
                )}

                {!projectsLoading && filteredProjects.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-8 gap-2"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <FolderOpen size={28} aria-hidden="true" />
                    <p className="text-sm">
                      {projectSearch
                        ? "No matching projects"
                        : "No projects yet — browse a folder"}
                    </p>
                  </div>
                )}

                {!projectsLoading &&
                  filteredProjects.map((p) => {
                    // Check if this project has a resumable session
                    const resumable = resumableSessions.find(
                      (r) => r.projectSlug === p.slug,
                    );
                    return (
                      <div key={p.slug}>
                        <button
                          onClick={() => handleSelectProject(p)}
                          className="w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors cursor-pointer"
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
                          <div className="flex items-center gap-2">
                            <FolderSimple
                              size={15}
                              style={{ color: "#FBBC04", flexShrink: 0 }}
                              aria-hidden="true"
                            />
                            <span
                              className="text-sm font-semibold truncate"
                              style={{ color: "var(--color-text-primary)" }}
                            >
                              {p.name}
                            </span>
                            <span
                              className="ml-auto text-xs font-mono flex-shrink-0"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              {p.defaultModel?.split("-")[1] ?? "sonnet"}
                            </span>
                          </div>
                          <span
                            className="text-xs truncate pl-5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {p.dir}
                          </span>
                        </button>

                        {/* Resume option if this project has an ended session */}
                        {resumable && (
                          <button
                            onClick={() => handleResumeSession(resumable)}
                            disabled={atLimit || resumingId === resumable.id}
                            className="w-full flex items-center gap-2 px-4 py-2 text-left cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: "#4285F408" }}
                            onMouseEnter={(e) => {
                              if (!atLimit && resumingId !== resumable.id) {
                                (e.currentTarget as HTMLButtonElement).style.background =
                                  "#4285F415";
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background =
                                "#4285F408";
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
                              {resumingId === resumable.id
                                ? "Resuming..."
                                : "Resume last session"}
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
                  onClick={() => setShowDirBrowser(true)}
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
                  onClick={() => setShowGithubInput((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  style={{
                    background: showGithubInput
                      ? "var(--color-bg-hover)"
                      : "var(--color-bg-elevated)",
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
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setGithubUrl(e.target.value)
                      }
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 px-2.5 py-1.5 rounded-md text-sm outline-none"
                      style={{
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-body)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleGithubAdd();
                      }}
                      autoFocus
                      aria-label="GitHub repository URL"
                    />
                    <button
                      onClick={handleGithubAdd}
                      disabled={!githubUrl.trim()}
                      className="px-2.5 py-1.5 rounded-md text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "#4285F4", color: "#fff" }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Directory browser sub-view ── */}
          {step === 1 && showDirBrowser && (
            <DirectoryBrowser
              onSelect={handleDirSelected}
              onCancel={() => setShowDirBrowser(false)}
            />
          )}

          {/* ── Step 2: Configuration ── */}
          {step === 2 && (
            <div
              className="flex flex-col gap-4 px-5 py-4 overflow-y-auto"
              style={{ maxHeight: 460 }}
            >
              {/* Project name */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: "var(--color-text-secondary)" }}
                  htmlFor="project-name-input"
                >
                  PROJECT NAME
                </label>
                <input
                  id="project-name-input"
                  type="text"
                  value={projectName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setProjectName(e.target.value)
                  }
                  placeholder="my-project"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-body)",
                  }}
                  autoFocus
                />
              </div>

              {/* Model */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: "var(--color-text-secondary)" }}
                  htmlFor="model-select"
                >
                  MODEL
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setModel(e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permission mode */}
              <div>
                <p
                  className="text-xs font-semibold mb-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  PERMISSION MODE
                </p>
                <div className="flex flex-col gap-2">
                  {(
                    Object.entries(PERMISSION_DESCRIPTIONS) as [
                      PermissionMode,
                      string,
                    ][]
                  ).map(([mode, desc]) => (
                    <label
                      key={mode}
                      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background:
                          permissionMode === mode
                            ? "#4285F408"
                            : "var(--color-bg-elevated)",
                        border:
                          permissionMode === mode
                            ? "1px solid #4285F440"
                            : "1px solid var(--color-border)",
                      }}
                    >
                      <input
                        type="radio"
                        name="permission-mode"
                        value={mode}
                        checked={permissionMode === mode}
                        onChange={() => setPermissionMode(mode)}
                        className="mt-0.5 cursor-pointer"
                        style={{ accentColor: "#4285F4" }}
                      />
                      <div>
                        <p
                          className="text-sm font-semibold capitalize"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {mode}
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Initial prompt */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: "var(--color-text-secondary)" }}
                  htmlFor="initial-prompt"
                >
                  INITIAL PROMPT{" "}
                  <span
                    className="font-normal"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    (optional)
                  </span>
                </label>
                <textarea
                  id="initial-prompt"
                  value={initialPrompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setInitialPrompt(e.target.value)
                  }
                  placeholder="Start with a specific task..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-body)",
                  }}
                />
              </div>

              {/* Idle Timeout */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                  IDLE TIMEOUT
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Never", value: 0 },
                    { label: "30m", value: 1_800_000 },
                    { label: "1h", value: 3_600_000 },
                    { label: "4h", value: 14_400_000 },
                    { label: "12h", value: 43_200_000 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setIdleTimeout(opt.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                      style={{
                        background: idleTimeout === opt.value ? "var(--color-google-blue)" : "var(--color-bg-elevated)",
                        color: idleTimeout === opt.value ? "#fff" : "var(--color-text-secondary)",
                        border: `1px solid ${idleTimeout === opt.value ? "var(--color-google-blue)" : "var(--color-border)"}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resume toggle */}
              <label
                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <input
                  type="checkbox"
                  checked={resume}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setResume(e.target.checked)
                  }
                  className="cursor-pointer"
                  style={{ accentColor: "#4285F4" }}
                />
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Resume previous session
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Continue from last conversation in this project
                  </p>
                </div>
              </label>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => {
                    setStep(1);
                    setShowDirBrowser(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedDir}
                  className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "#4285F4", color: "#fff" }}
                >
                  Next: Review
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Launch summary ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4 px-5 py-4">
              {/* Summary card */}
              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <h3
                  className="text-sm font-bold"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {projectName || "Unnamed project"}
                </h3>

                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span
                      className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Directory
                    </span>
                    <span
                      className="text-xs font-mono truncate"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {selectedDir}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Model
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {MODEL_OPTIONS.find((m) => m.value === model)?.label ??
                        model}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Permissions
                    </span>
                    <span
                      className="text-xs capitalize"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {permissionMode}
                    </span>
                  </div>
                  {resume && (
                    <div className="flex items-center gap-2">
                      <span
                        className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Resume
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "#34A853" }}
                      >
                        Yes
                      </span>
                    </div>
                  )}
                  {initialPrompt.trim() && (
                    <div className="flex items-start gap-2">
                      <span
                        className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Prompt
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {initialPrompt.length > 120
                          ? `${initialPrompt.slice(0, 120)}…`
                          : initialPrompt}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Back
                </button>

                <button
                  onClick={handleLaunch}
                  disabled={launching || atLimit}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: "#4285F4", color: "#fff" }}
                  aria-label="Start session"
                >
                  {launching ? (
                    <>
                      <CircleNotch
                        size={15}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Rocket size={15} weight="bold" aria-hidden="true" />
                      Start Session
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Public component with portal + animate-presence ─────────────────────────

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewSessionModal({ open, onClose }: NewSessionModalProps) {
  const { shouldRender } = useAnimatePresence(open);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !shouldRender) return null;

  return createPortal(
    <NewSessionModalInner onClose={onClose} />,
    document.body,
  );
}
