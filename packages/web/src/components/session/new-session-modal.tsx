"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Check, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAnimatePresence } from "@/lib/animation";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/lib/stores/session-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { usePersonas } from "@/hooks/use-personas";
import {
  useCLIPlatforms,
  getModelsForPlatform,
  getDefaultModelForPlatform,
} from "@/hooks/use-cli-platforms";
import { StepProject, type ProjectItem, type ResumableSession } from "./modal/step-project";
import { StepConfig } from "./modal/step-config";
import { StepReview } from "./modal/step-review";
import type { TemplateVariable } from "./template-variables-form";

// ── Types ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

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
                  current === n
                    ? "var(--color-accent)"
                    : current > n
                      ? "var(--color-success)"
                      : "var(--color-bg-elevated)",
                color: current >= n ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {current > n ? <Check size={10} weight="bold" aria-hidden="true" /> : n}
            </div>
            <span
              className="text-xs font-medium"
              style={{
                color:
                  current === n
                    ? "var(--color-accent)"
                    : current > n
                      ? "var(--color-success)"
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

// ── Focus trap helper ─────────────────────────────────────────────────────

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(
    el.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((e) => !e.closest("[aria-hidden='true']"));
}

// ── Modal inner ─────────────────────────────────────────────────────────────

function NewSessionModalInner({ onClose }: { onClose: () => void }) {
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
  const [idleTimeout, setIdleTimeout] = useState<number>(3_600_000);
  const [_autoApprove, _setAutoApprove] = useState(false);

  // Template selection
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // CLI Platform
  const [selectedPlatform, setSelectedPlatform] = useState<
    "claude" | "codex" | "gemini" | "opencode"
  >("claude");
  const { platforms: detectedPlatforms, loading: platformsLoading } = useCLIPlatforms();

  useEffect(() => {
    const stored = localStorage.getItem("companion_last_platform");
    if (stored && ["claude", "codex", "gemini", "opencode"].includes(stored)) {
      setSelectedPlatform(stored as "claude" | "codex" | "gemini" | "opencode");
    }
  }, []);

  useEffect(() => {
    const platformModels = getModelsForPlatform(selectedPlatform);
    const validValues = platformModels.map((m) => m.value);
    if (!validValues.includes(model)) {
      setModel(getDefaultModelForPlatform(selectedPlatform));
    }
  }, [selectedPlatform]); // eslint-disable-line react-hooks/exhaustive-deps

  // Platform-specific options
  const [codexApprovalMode, setCodexApprovalMode] = useState("suggest");
  const [geminiSandbox, setGeminiSandbox] = useState(true);
  const [geminiYolo, setGeminiYolo] = useState(false);

  // Persona
  const defaultPersonaId = useUiStore((s) => s.newSessionDefaultPersonaId);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(defaultPersonaId);
  const { all: allPersonas } = usePersonas();

  useEffect(() => {
    if (defaultPersonaId) setSelectedPersonaId(defaultPersonaId);
  }, [defaultPersonaId]);

  // Launch
  const [launching, setLaunching] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const sessionCount = useSessionStore(
    (s) =>
      Object.values(s.sessions).filter((sess) =>
        ["running", "waiting", "idle"].includes(sess.status),
      ).length,
  );
  const atLimit = sessionCount >= 6;

  // Fetch projects, resumable sessions, and templates
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

  // ── Handlers ────────────────────────────────────────────────────────────

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

  const handleSelectProject = useCallback(
    (p: ProjectItem) => {
      setSelectedDir(p.dir);
      setProjectName(p.name);
      const platformModels = getModelsForPlatform(selectedPlatform);
      const validValues = platformModels.map((m) => m.value);
      if (selectedPlatform === "claude") {
        setModel(validValues.includes(p.defaultModel) ? p.defaultModel : "claude-sonnet-4-6");
      } else {
        setModel(platformModels[0]?.value ?? "");
      }
      setPermissionMode((p.permissionMode as PermissionMode) || "default");
      setStep(2);
    },
    [selectedPlatform],
  );

  const handleDirSelected = useCallback((path: string) => {
    setShowDirBrowser(false);
    setSelectedDir(path);
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    setProjectName(parts[parts.length - 1] ?? "");
    setStep(2);
  }, []);

  const handleGithubAdd = useCallback(() => {
    if (!githubUrl.trim()) return;
    const match = githubUrl.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    const repoName = match ? match[2] : (githubUrl.split("/").pop() ?? "repo");
    setProjectName(repoName ?? "repo");
    setSelectedDir(`github://${githubUrl.trim()}`);
    setShowGithubInput(false);
    setStep(2);
  }, [githubUrl]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateVariables = selectedTemplate?.variables ?? [];

  const handleSelectTemplate = useCallback(
    (tpl: TemplateItem) => {
      if (selectedTemplateId === tpl.id) {
        setSelectedTemplateId(null);
        setTemplateVars({});
        setInitialPrompt("");
        return;
      }
      setSelectedTemplateId(tpl.id);
      setTemplateVars({});
      setInitialPrompt(tpl.prompt);
      if (tpl.model) {
        const validModels = getModelsForPlatform(selectedPlatform).map((m) => m.value);
        if (validModels.includes(tpl.model)) setModel(tpl.model);
      }
      if (tpl.permissionMode) {
        setPermissionMode((tpl.permissionMode as PermissionMode) || "default");
      }
    },
    [selectedTemplateId],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const templateVarsValid =
    templateVariables.length === 0 ||
    templateVariables.every((v) => !v.required || (templateVars[v.key] ?? "").trim() !== "");

  const handleLaunch = useCallback(async () => {
    if (atLimit) return;
    setLaunching(true);
    try {
      if (selectedDir.startsWith("github://")) {
        toast.info("GitHub project saved. Clone the repo first to start a session.");
        onClose();
        return;
      }

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

  const handlePlatformSelect = useCallback((id: "claude" | "codex" | "gemini" | "opencode") => {
    setSelectedPlatform(id);
    localStorage.setItem("companion_last_platform", id);
    setModel(getDefaultModelForPlatform(id));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
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
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}
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

          {/* Step 1: Project selection */}
          {step === 1 && (
            <StepProject
              projectSearch={projectSearch}
              onProjectSearchChange={setProjectSearch}
              projects={projects}
              projectsLoading={projectsLoading}
              onSelectProject={handleSelectProject}
              resumableSessions={resumableSessions}
              onResumeSession={handleResumeSession}
              resumingId={resumingId}
              atLimit={atLimit}
              showDirBrowser={showDirBrowser}
              onShowDirBrowser={setShowDirBrowser}
              onDirSelected={handleDirSelected}
              showGithubInput={showGithubInput}
              onShowGithubInput={setShowGithubInput}
              githubUrl={githubUrl}
              onGithubUrlChange={setGithubUrl}
              onGithubAdd={handleGithubAdd}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={handlePlatformSelect}
              detectedPlatforms={detectedPlatforms}
              platformsLoading={platformsLoading}
            />
          )}

          {/* Step 2: Configuration */}
          {step === 2 && (
            <StepConfig
              projectName={projectName}
              onProjectNameChange={setProjectName}
              model={model}
              onModelChange={setModel}
              permissionMode={permissionMode}
              onPermissionModeChange={setPermissionMode}
              selectedPlatform={selectedPlatform}
              codexApprovalMode={codexApprovalMode}
              onCodexApprovalModeChange={setCodexApprovalMode}
              geminiSandbox={geminiSandbox}
              onGeminiSandboxChange={setGeminiSandbox}
              geminiYolo={geminiYolo}
              onGeminiYoloChange={setGeminiYolo}
              selectedPersonaId={selectedPersonaId}
              onSelectedPersonaIdChange={setSelectedPersonaId}
              allPersonas={allPersonas}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={handleSelectTemplate}
              selectedTemplate={selectedTemplate}
              templateVariables={templateVariables}
              templateVars={templateVars}
              onTemplateVarsChange={setTemplateVars}
              templateVarsValid={templateVarsValid}
              initialPrompt={initialPrompt}
              onInitialPromptChange={setInitialPrompt}
              idleTimeout={idleTimeout}
              onIdleTimeoutChange={setIdleTimeout}
              resume={resume}
              onResumeChange={setResume}
              selectedDir={selectedDir}
              onBack={() => {
                setStep(1);
                setShowDirBrowser(false);
              }}
              onNext={() => setStep(3)}
            />
          )}

          {/* Step 3: Launch review */}
          {step === 3 && (
            <StepReview
              projectName={projectName}
              selectedDir={selectedDir}
              model={model}
              permissionMode={permissionMode}
              selectedPlatform={selectedPlatform}
              selectedPersonaId={selectedPersonaId}
              allPersonas={allPersonas}
              resume={resume}
              initialPrompt={initialPrompt}
              launching={launching}
              atLimit={atLimit}
              templateVarsValid={templateVarsValid}
              onLaunch={handleLaunch}
              onBack={() => setStep(2)}
            />
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
