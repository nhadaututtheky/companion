"use client";
import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
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
import { useUiStore } from "@/lib/stores/ui-store";
import { TemplateVariablesForm, type TemplateVariable } from "./template-variables-form";
import { COMMAND_PRESETS } from "@companion/shared";
import { PersonaAvatar } from "@/components/persona/persona-avatar";
import { PersonaTooltip } from "@/components/persona/persona-tooltip";
import { usePersonas } from "@/hooks/use-personas";
import { useCLIPlatforms, getModelsForPlatform, getDefaultModelForPlatform } from "@/hooks/use-cli-platforms";
import { PlatformPicker } from "./platform-picker";

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: "Claude asks before any file or command changes",
  acceptEdits: "Claude auto-approves file edits, asks for commands",
  bypassPermissions: "Claude acts autonomously — no permission prompts",
  plan: "Claude plans only, no file or command execution",
};

interface ProjectItem {
  slug: string;
  name: string;
  dir: string;
  defaultModel: string;
  permissionMode: string;
}

interface TemplateItem {
  id: string;
  name: string;
  slug: string;
  prompt: string;
  icon: string;
  model: string | null;
  permissionMode: string | null;
  variables: TemplateVariable[] | null;
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
    <div className="flex items-center gap-1.5">
      {steps.map(({ n, label }, idx) => (
        <div key={n} className="flex items-center gap-1.5">
          {idx > 0 && (
            <div
              style={{
                width: 16,
                height: 1,
                background: current > idx ? "var(--color-accent)" : "var(--color-border)",
                borderRadius: 1,
              }}
              aria-hidden="true"
            />
          )}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1"
            style={{
              borderRadius: "var(--radius-pill)",
              background:
                current === n
                  ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                  : current > n
                    ? "color-mix(in srgb, var(--color-success) 10%, transparent)"
                    : "transparent",
              border:
                current === n
                  ? "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)"
                  : "1px solid transparent",
            }}
          >
            <div
              className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
              style={{
                width: 20,
                height: 20,
                background:
                  current === n ? "var(--color-accent)" : current > n ? "var(--color-success)" : "var(--color-bg-elevated)",
                color: current >= n ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {current > n ? <Check size={10} weight="bold" aria-hidden="true" /> : n}
            </div>
            <span
              className="text-xs font-medium"
              style={{
                color: current === n ? "var(--color-accent)" : current > n ? "var(--color-success)" : "var(--color-text-muted)",
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

  // Template selection
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // CLI Platform — default "claude", sync from localStorage after mount to avoid SSR mismatch
  const [selectedPlatform, setSelectedPlatform] = useState<"claude" | "codex" | "gemini" | "opencode">("claude");
  const { platforms: detectedPlatforms, loading: platformsLoading } = useCLIPlatforms();

  useEffect(() => {
    const stored = localStorage.getItem("companion_last_platform");
    if (stored && ["claude", "codex", "gemini", "opencode"].includes(stored)) {
      setSelectedPlatform(stored as "claude" | "codex" | "gemini" | "opencode");
    }
  }, []);

  // Sync model when platform changes — ensures model select always has a valid value
  useEffect(() => {
    const platformModels = getModelsForPlatform(selectedPlatform);
    const validValues = platformModels.map((m) => m.value);
    if (!validValues.includes(model)) {
      setModel(getDefaultModelForPlatform(selectedPlatform));
    }
  }, [selectedPlatform]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only on platform change

  // Platform-specific options
  const [codexApprovalMode, setCodexApprovalMode] = useState("suggest");
  const [geminiSandbox, setGeminiSandbox] = useState(true);
  const [geminiYolo, setGeminiYolo] = useState(false);

  // Persona / Expert Mode — pre-select from template picker if set
  const defaultPersonaId = useUiStore((s) => s.newSessionDefaultPersonaId);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(defaultPersonaId);
  const { all: allPersonas } = usePersonas();

  // Sync if defaultPersonaId changes (picker opened while modal was closed)
  useEffect(() => {
    if (defaultPersonaId) setSelectedPersonaId(defaultPersonaId);
  }, [defaultPersonaId]);

  // Launch step
  const [launching, setLaunching] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  const sessionCount = useSessionStore(
    (s) =>
      Object.values(s.sessions).filter((sess) =>
        ["running", "waiting", "idle"].includes(sess.status),
      ).length,
  );
  const atLimit = sessionCount >= 6;

  // Fetch projects, resumable sessions, and templates in parallel
  useEffect(() => {
    Promise.all([
      api.projects.list().catch(() => ({ data: [] })),
      api.sessions.listResumable().catch(() => ({ data: [] })),
      api.templates.list().catch(() => ({ data: [] })),
    ]).then(([projectsRes, resumableRes, templatesRes]) => {
      setProjects((projectsRes.data ?? []) as ProjectItem[]);
      setResumableSessions((resumableRes.data ?? []) as ResumableSession[]);
      setTemplates((templatesRes.data ?? []) as TemplateItem[]);
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

  const handleResumeSession = useCallback(
    async (s: ResumableSession) => {
      if (atLimit) return;
      setResumingId(s.id);
      try {
        const res = await api.sessions.resume(s.id, {
          idleTimeoutMs: idleTimeout,
          keepAlive: idleTimeout === 0,
        });
        const sessionId = res.data.sessionId;
        const label =
          s.projectSlug ?? s.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "session";

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
    },
    [atLimit, onClose, idleTimeout],
  );

  const handleSelectProject = useCallback((p: ProjectItem) => {
    setSelectedDir(p.dir);
    setProjectName(p.name);
    // Set model based on platform
    const platformModels = getModelsForPlatform(selectedPlatform);
    const validValues = platformModels.map((m) => m.value);
    if (selectedPlatform === "claude") {
      setModel(validValues.includes(p.defaultModel) ? p.defaultModel : "claude-sonnet-4-6");
    } else {
      setModel(platformModels[0]?.value ?? "");
    }
    setPermissionMode((p.permissionMode as PermissionMode) || "default");
    setStep(2);
  }, [selectedPlatform]);

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
    const match = githubUrl.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    const repoName = match ? match[2] : (githubUrl.split("/").pop() ?? "repo");
    setProjectName(repoName ?? "repo");
    // Store URL as the "dir" metadata placeholder
    setSelectedDir(`github://${githubUrl.trim()}`);
    setShowGithubInput(false);
    setStep(2);
  }, [githubUrl]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVariables = selectedTemplate?.variables ?? [];

  const handleSelectTemplate = useCallback(
    (tpl: TemplateItem) => {
      if (selectedTemplateId === tpl.id) {
        // Deselect
        setSelectedTemplateId(null);
        setTemplateVars({});
        setInitialPrompt("");
        return;
      }
      setSelectedTemplateId(tpl.id);
      setTemplateVars({});
      // Pre-fill prompt with template prompt; user can still edit it
      setInitialPrompt(tpl.prompt);
      if (tpl.model) {
        const validModels = getModelsForPlatform(selectedPlatform).map((m) => m.value);
        if (validModels.includes(tpl.model)) setModel(tpl.model);
      }
      if (tpl.permissionMode) {
        setPermissionMode((tpl.permissionMode as PermissionMode) || "default");
      }
    },
    [selectedTemplateId], // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only re-run on template change
  );

  // Check if all required template variables are filled
  const templateVarsValid =
    templateVariables.length === 0 ||
    templateVariables.every((v) => !v.required || (templateVars[v.key] ?? "").trim() !== "");

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

      // Build platform-specific options
      const platformOptions: Record<string, unknown> = {};
      if (selectedPlatform === "codex") {
        if (codexApprovalMode === "full-auto") platformOptions.fullAuto = true;
        else platformOptions.approvalMode = codexApprovalMode;
      }
      if (selectedPlatform === "gemini") {
        if (geminiSandbox) platformOptions.sandbox = true;
        if (geminiYolo) platformOptions.yolo = true;
      }

      const res = await api.sessions.start({
        projectDir: selectedDir,
        projectSlug: projectName
          ? projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")
          : undefined,
        model,
        permissionMode: selectedPlatform === "claude" ? permissionMode : undefined,
        prompt: initialPrompt.trim() || undefined,
        templateId: selectedTemplateId ?? undefined,
        templateVars:
          selectedTemplateId && Object.keys(templateVars).length > 0 ? templateVars : undefined,
        idleTimeoutMs: idleTimeout,
        keepAlive: idleTimeout === 0,
        personaId: selectedPlatform === "claude" ? (selectedPersonaId ?? undefined) : undefined,
        cliPlatform: selectedPlatform,
        platformOptions: Object.keys(platformOptions).length > 0 ? platformOptions : undefined,
      });

      const sessionId = res.data.sessionId;
      const projectCreated = res.data.projectCreated === true;

      // Add to store and grid
      const slug = projectName ? projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-") : "session";
      useSessionStore.getState().setSession(sessionId, {
        id: sessionId,
        projectSlug: slug,
        projectName: projectName || slug,
        model,
        status: "starting",
        createdAt: Date.now(),
        personaId: selectedPersonaId ?? undefined,
      });

      useSessionStore.getState().addToGrid(sessionId);
      useSessionStore.getState().setActiveSession(sessionId);

      toast.success(`Session started: ${projectName || selectedDir}`);
      if (projectCreated) {
        toast.info(`Project "${projectName}" saved — now available in Telegram /start`, {
          duration: 5000,
        });
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start session");
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
    selectedTemplateId,
    templateVars,
    selectedPersonaId,
    selectedPlatform,
    codexApprovalMode,
    geminiSandbox,
    geminiYolo,
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
            boxShadow: "0 8px 40px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.1)",
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
              <p className="text-xs mt-0.5">
                {atLimit
                  ? "Maximum 6 sessions active — stop one to continue"
                  : "Launch a coding session in a project"}
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setProjectSearch(e.target.value)}
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
                     
                      aria-hidden="true"
                    />
                  </div>
                )}

                {!projectsLoading && filteredProjects.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-8 gap-2"
                   
                  >
                    <FolderOpen size={28} aria-hidden="true" />
                    <p className="text-sm">
                      {projectSearch ? "No matching projects" : "No projects yet — browse a folder"}
                    </p>
                  </div>
                )}

                {!projectsLoading &&
                  filteredProjects.map((p) => {
                    // Check if this project has a resumable session
                    const resumable = resumableSessions.find((r) => r.projectSlug === p.slug);
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
                            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
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
                             
                            >
                              {p.name}
                            </span>
                            <span
                              className="ml-auto text-xs font-mono flex-shrink-0"
                             
                            >
                              {p.defaultModel?.split("-")[1] ?? "sonnet"}
                            </span>
                          </div>
                          <span
                            className="text-xs truncate pl-5"
                           
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
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 px-2.5 py-1.5 rounded-md text-sm input-bordered"
                      style={{
                        background: "var(--color-bg-card)",
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

              {/* Platform picker */}
              <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
                <PlatformPicker
                  platforms={detectedPlatforms}
                  loading={platformsLoading}
                  selected={selectedPlatform}
                  onSelect={(id) => {
                    setSelectedPlatform(id);
                    localStorage.setItem("companion_last_platform", id);
                    // Reset model to platform default
                    setModel(getDefaultModelForPlatform(id));
                  }}
                />
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
                 
                  htmlFor="project-name-input"
                >
                  PROJECT NAME
                </label>
                <input
                  id="project-name-input"
                  type="text"
                  value={projectName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setProjectName(e.target.value)}
                  placeholder="my-project"
                  className="w-full px-3 py-2 rounded-lg text-sm input-bordered"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-body)",
                  }}
                  autoFocus
                />
              </div>

              {/* Model — dynamic per platform */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  htmlFor="model-select"
                >
                  MODEL
                  <span className="font-normal ml-1" style={{ color: "var(--color-text-muted)" }}>
                    ({selectedPlatform === "claude" ? "Claude" : selectedPlatform === "codex" ? "Codex" : selectedPlatform === "gemini" ? "Gemini" : "OpenCode"})
                  </span>
                </label>
                <select
                  id="model-select"
                  value={model}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {getModelsForPlatform(selectedPlatform).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ── Platform-specific options ── */}
              {selectedPlatform === "codex" && (
                <div>
                  <p className="text-xs font-semibold mb-2">APPROVAL MODE</p>
                  <div className="flex gap-2">
                    {[
                      { value: "suggest", label: "Suggest", desc: "Review all changes" },
                      { value: "auto-edit", label: "Auto-edit", desc: "Auto-approve file edits" },
                      { value: "full-auto", label: "Full Auto", desc: "No prompts" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setCodexApprovalMode(opt.value)}
                        className="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors"
                        style={{
                          background: codexApprovalMode === opt.value ? "#10B98115" : "var(--color-bg-elevated)",
                          border: codexApprovalMode === opt.value ? "1.5px solid #10B981" : "1px solid var(--color-border)",
                          color: codexApprovalMode === opt.value ? "#10B981" : "var(--color-text-secondary)",
                        }}
                      >
                        <span className="font-semibold">{opt.label}</span>
                        <span style={{ color: "var(--color-text-muted)", fontSize: 10 }}>{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlatform === "gemini" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "#4285F410", border: "1px solid #4285F430" }}>
                    <span style={{ color: "#4285F4", fontSize: 11, fontWeight: 600 }}>Free tier: 1000 req/day with Google Account</span>
                  </div>
                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
                    <input type="checkbox" checked={geminiSandbox} onChange={(e) => setGeminiSandbox(e.target.checked)} className="cursor-pointer" style={{ accentColor: "#4285F4" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>Sandbox Mode</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Run in isolated sandbox environment</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)" }}>
                    <input type="checkbox" checked={geminiYolo} onChange={(e) => setGeminiYolo(e.target.checked)} className="cursor-pointer" style={{ accentColor: "#EA4335" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>YOLO Mode</p>
                      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Skip all confirmations (dangerous)</p>
                    </div>
                  </label>
                </div>
              )}

              {selectedPlatform === "opencode" && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "#8B5CF610", border: "1px solid #8B5CF630" }}>
                  <span style={{ color: "#8B5CF6", fontSize: 11, fontWeight: 600 }}>75+ providers via OpenCode — supports local (Ollama) and cloud models</span>
                </div>
              )}

              {/* Expert Mode / Persona picker — only for Claude */}
              {selectedPlatform === "claude" && <div>
                <p className="text-xs font-semibold mb-2">
                  EXPERT MODE{" "}
                  <span className="font-normal">
                    (optional)
                  </span>
                </p>
                <div
                  className="flex gap-2 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {/* None option */}
                  <button
                    type="button"
                    onClick={() => setSelectedPersonaId(null)}
                    className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all flex-shrink-0"
                    style={{
                      width: 64,
                      background: selectedPersonaId === null ? "#4285F410" : "var(--color-bg-elevated)",
                      border: selectedPersonaId === null
                        ? "2px solid #4285F4"
                        : "1px solid var(--color-border)",
                      transform: selectedPersonaId === null ? "scale(1.05)" : "scale(1)",
                    }}
                    aria-pressed={selectedPersonaId === null}
                  >
                    <div
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 36,
                        height: 36,
                        background: "var(--color-bg-card)",
                        border: "1px solid var(--color-border)",
                        fontSize: 14,
                        color: "var(--color-text-muted)",
                      }}
                    >
                      —
                    </div>
                    <span
                      className="text-[10px] truncate w-full text-center"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      None
                    </span>
                  </button>

                  {allPersonas.map((persona) => {
                    const isSelected = selectedPersonaId === persona.id;
                    return (
                      <PersonaTooltip key={persona.id} persona={persona} placement="bottom">
                        <button
                          type="button"
                          onClick={() => setSelectedPersonaId(isSelected ? null : persona.id)}
                          className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all flex-shrink-0"
                          style={{
                            width: 64,
                            background: isSelected ? "#4285F410" : "var(--color-bg-elevated)",
                            border: isSelected
                              ? "2px solid #4285F4"
                              : "1px solid var(--color-border)",
                            transform: isSelected ? "scale(1.05)" : "scale(1)",
                          }}
                          aria-pressed={isSelected}
                          aria-label={`${persona.name} — ${persona.strength}`}
                        >
                          <PersonaAvatar persona={persona} size={36} showBadge={false} />
                          <span
                            className="text-[10px] truncate w-full text-center"
                            style={{
                              color: isSelected ? "#4285F4" : "var(--color-text-muted)",
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          >
                            {persona.name.split(" ")[0]}
                          </span>
                        </button>
                      </PersonaTooltip>
                    );
                  })}
                </div>
              </div>}

              {/* Permission mode — Claude only */}
              {selectedPlatform === "claude" && <>
              <div>
                <p
                  className="text-xs font-semibold mb-2"

                >
                  PERMISSION MODE
                </p>
                <div className="flex flex-col gap-2">
                  {(Object.entries(PERMISSION_DESCRIPTIONS) as [PermissionMode, string][]).map(
                    ([mode, desc]) => (
                      <label
                        key={mode}
                        className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                        style={{
                          background:
                            permissionMode === mode ? "#4285F408" : "var(--color-bg-elevated)",
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
                           
                          >
                            {mode}
                          </p>
                          <p
                            className="text-xs mt-0.5"
                           
                          >
                            {desc}
                          </p>
                        </div>
                      </label>
                    ),
                  )}
                </div>
              </div>
              </>}

              {/* Template picker */}
              {templates.length > 0 && (
                <div>
                  <p
                    className="text-xs font-semibold mb-2"
                   
                  >
                    TEMPLATE
                    <span className="ml-1 font-normal">
                      (optional)
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((tpl) => {
                      const isSelected = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleSelectTemplate(tpl)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                          style={{
                            background: isSelected ? "#4285F415" : "var(--color-bg-elevated)",
                            border: isSelected
                              ? "1px solid #4285F440"
                              : "1px solid var(--color-border)",
                            color: isSelected ? "#4285F4" : "var(--color-text-secondary)",
                          }}
                          aria-pressed={isSelected}
                        >
                          <span aria-hidden="true">{tpl.icon}</span>
                          {tpl.name}
                          {tpl.variables && tpl.variables.length > 0 && (
                            <span
                              className="ml-0.5 font-mono"
                              style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                              aria-hidden="true"
                            >
                              {"{…}"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Template variables form */}
              {selectedTemplate && templateVariables.length > 0 && (
                <TemplateVariablesForm
                  variables={templateVariables}
                  values={templateVars}
                  onChange={setTemplateVars}
                />
              )}

              {/* Command Presets */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                 
                >
                  QUICK START{" "}
                  <span className="font-normal">
                    (click to set as prompt)
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMAND_PRESETS.flatMap((cat) =>
                    cat.presets.slice(0, 3).map((p) => (
                      <button
                        key={p.command}
                        type="button"
                        onClick={() => setInitialPrompt(p.command)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
                        style={{
                          background:
                            initialPrompt === p.command
                              ? "var(--color-accent)" + "20"
                              : "var(--color-bg-card)",
                          border: `1px solid ${initialPrompt === p.command ? "var(--color-accent)" : "var(--color-border)"}`,
                          color:
                            initialPrompt === p.command
                              ? "var(--color-accent)"
                              : "var(--color-text-muted)",
                        }}
                        title={`${cat.name}: ${p.command}`}
                      >
                        <span>{p.icon}</span>
                        {p.label}
                      </button>
                    )),
                  )}
                </div>
              </div>

              {/* Initial prompt */}
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                 
                  htmlFor="initial-prompt"
                >
                  INITIAL PROMPT{" "}
                  <span className="font-normal">
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
                  className="w-full px-3 py-2 rounded-lg text-sm input-bordered resize-none"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-body)",
                  }}
                />
              </div>

              {/* Idle Timeout */}
              <div className="flex flex-col gap-1.5">
                <p
                  className="text-xs font-semibold tracking-wider"
                 
                >
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
                        background:
                          idleTimeout === opt.value
                            ? "var(--color-google-blue)"
                            : "var(--color-bg-elevated)",
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setResume(e.target.checked)}
                  className="cursor-pointer"
                  style={{ accentColor: "#4285F4" }}
                />
                <div>
                  <p
                    className="text-sm font-semibold"
                   
                  >
                    Resume previous session
                  </p>
                  <p className="text-xs mt-0.5">
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
                  disabled={!selectedDir || !templateVarsValid}
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
                     
                    >
                      Directory
                    </span>
                    <span
                      className="text-xs font-mono truncate"
                     
                    >
                      {selectedDir}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">
                      Platform
                    </span>
                    <span className="text-xs font-semibold" style={{ color: selectedPlatform === "claude" ? "#D97706" : selectedPlatform === "codex" ? "#10B981" : selectedPlatform === "gemini" ? "#4285F4" : "#8B5CF6" }}>
                      {selectedPlatform === "claude" ? "◈ Claude Code" : selectedPlatform === "codex" ? "◇ Codex" : selectedPlatform === "gemini" ? "◆ Gemini CLI" : "☁ OpenCode"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">
                      Model
                    </span>
                    <span className="text-xs font-mono">
                      {getModelsForPlatform(selectedPlatform).find((m) => m.value === model)?.label ?? model}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                     
                    >
                      Permissions
                    </span>
                    <span
                      className="text-xs capitalize"
                     
                    >
                      {permissionMode}
                    </span>
                  </div>
                  {selectedPersonaId && (() => {
                    const selectedPersona = allPersonas.find((p) => p.id === selectedPersonaId);
                    if (!selectedPersona) return null;
                    return (
                      <div className="flex items-center gap-2">
                        <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">
                          Expert
                        </span>
                        <span className="flex items-center gap-1.5">
                          <PersonaAvatar
                            persona={selectedPersona}
                            size={18}
                            showBadge={false}
                          />
                          <span className="text-xs font-medium" style={{ color: "#4285F4" }}>
                            {selectedPersona.name}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                  {resume && (
                    <div className="flex items-center gap-2">
                      <span
                        className="w-24 flex-shrink-0 text-xs font-semibold uppercase"

                      >
                        Resume
                      </span>
                      <span className="text-xs" style={{ color: "#34A853" }}>
                        Yes
                      </span>
                    </div>
                  )}
                  {initialPrompt.trim() && (
                    <div className="flex items-start gap-2">
                      <span
                        className="w-24 flex-shrink-0 text-xs font-semibold uppercase"
                       
                      >
                        Prompt
                      </span>
                      <span className="text-xs">
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
                  disabled={launching || atLimit || !templateVarsValid}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: "#4285F4", color: "#fff" }}
                  aria-label="Start session"
                >
                  {launching ? (
                    <>
                      <CircleNotch size={15} className="animate-spin" aria-hidden="true" />
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
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- SSR portal guard
  }, []);

  if (!mounted || !shouldRender) return null;

  return createPortal(<NewSessionModalInner onClose={onClose} />, document.body);
}
