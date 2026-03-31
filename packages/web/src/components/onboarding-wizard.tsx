"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  Warning,
  X,
  ArrowRight,
  ArrowLeft,
  Terminal,
  FolderOpen,
  Rocket,
  Sparkle,
} from "@phosphor-icons/react";

const STORAGE_KEY = "onboarding_completed";

interface SetupStatus {
  hasApiKey: boolean;
  hasProjects: boolean;
  hasSessions: boolean;
  /** @deprecated Removed from server response for security — assume available */
  claudeCliAvailable?: boolean;
}

interface OnboardingWizardProps {
  onOpenNewSession: () => void;
}

// ── Step indicators ──────────────────────────────────────────────────────────

interface StepDotProps {
  index: number;
  current: number;
  total: number;
}

function StepDot({ index, current, total }: StepDotProps) {
  const done = index < current;
  const active = index === current;

  return (
    <div
      style={{
        width: active ? 20 : 8,
        height: 8,
        borderRadius: 9999,
        transition: "width 250ms ease, background 250ms ease",
        background: done
          ? "var(--color-accent, #4285F4)"
          : active
          ? "var(--color-accent, #4285F4)"
          : "var(--color-border, #2a3f52)",
        opacity: done ? 0.6 : 1,
      }}
      aria-hidden="true"
    />
  );
}

// ── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-6 text-center px-2">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #4285F420, #34A85320)",
          border: "1px solid #4285F430",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkle size={32} weight="duotone" style={{ color: "#4285F4" }} aria-hidden="true" />
      </div>
      <div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans, Space Grotesk, sans-serif)" }}
        >
          Welcome to Companion!
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          Companion lets you run Claude Code sessions from anywhere — web UI, Telegram, or API.
          <br />
          <br />
          This quick setup takes about 2 minutes.
        </p>
      </div>
      <ul
        className="text-left w-full text-sm flex flex-col gap-3"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {[
          "Check Claude CLI is installed",
          "Configure your first project",
          "Start your first session",
        ].map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--color-bg-elevated, #1a2332)",
                border: "1px solid var(--color-border, #2a3f52)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-accent, #4285F4)",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Step 2: Claude CLI ────────────────────────────────────────────────────────

function StepClaudeCLI({ available }: { available: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: available ? "#34A85320" : "#EA433520",
            border: `1px solid ${available ? "#34A85340" : "#EA433540"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Terminal
            size={20}
            weight="duotone"
            style={{ color: available ? "#34A853" : "#EA4335" }}
            aria-hidden="true"
          />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Claude CLI
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Required to run AI sessions
          </p>
        </div>
        {available ? (
          <CheckCircle
            size={20}
            weight="fill"
            style={{ color: "#34A853", marginLeft: "auto" }}
            aria-label="Available"
          />
        ) : (
          <Warning
            size={20}
            weight="fill"
            style={{ color: "#FBBC04", marginLeft: "auto" }}
            aria-label="Not found"
          />
        )}
      </div>

      {available ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: "#34A85310",
            border: "1px solid #34A85330",
            color: "#34A853",
          }}
        >
          Claude CLI is installed and ready.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: "#FBBC0410",
              border: "1px solid #FBBC0430",
              color: "var(--color-text-secondary)",
            }}
          >
            Claude CLI was not found. Install it to use Companion.
          </div>
          <div
            className="rounded-lg px-4 py-3 text-xs font-mono"
            style={{
              background: "var(--color-bg-elevated, #1a2332)",
              border: "1px solid var(--color-border, #2a3f52)",
              color: "var(--color-text-primary)",
            }}
          >
            npm install -g @anthropic-ai/claude-code
          </div>
          <a
            href="https://docs.anthropic.com/claude/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
            style={{ color: "var(--color-accent, #4285F4)" }}
          >
            View installation docs →
          </a>
          <p
            className="text-xs"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
          >
            After installing, restart Companion and run setup again.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Projects ─────────────────────────────────────────────────────────

function StepProjects({ hasProjects }: { hasProjects: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: hasProjects ? "#34A85320" : "#4285F420",
            border: `1px solid ${hasProjects ? "#34A85340" : "#4285F440"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <FolderOpen
            size={20}
            weight="duotone"
            style={{ color: hasProjects ? "#34A853" : "#4285F4" }}
            aria-hidden="true"
          />
        </div>
        <div>
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Project Directories
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            Map local folders to Claude sessions
          </p>
        </div>
        {hasProjects && (
          <CheckCircle
            size={20}
            weight="fill"
            style={{ color: "#34A853", marginLeft: "auto" }}
            aria-label="Projects configured"
          />
        )}
      </div>

      {hasProjects ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: "#34A85310",
            border: "1px solid #34A85330",
            color: "#34A853",
          }}
        >
          Projects are configured. You're good to go.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: "#4285F410",
              border: "1px solid #4285F430",
              color: "var(--color-text-secondary)",
            }}
          >
            No projects yet. Projects let Claude work inside your code directories.
          </div>

          <div className="flex flex-col gap-2">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-muted, #6b7280)" }}
            >
              Docker mount example
            </p>
            <div
              className="rounded-lg px-4 py-3 text-xs font-mono leading-relaxed"
              style={{
                background: "var(--color-bg-elevated, #1a2332)",
                border: "1px solid var(--color-border, #2a3f52)",
                color: "var(--color-text-primary)",
              }}
            >
              {`# docker-compose.yml\nvolumes:\n  - /path/to/your/code:/workspace`}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-text-muted, #6b7280)" }}
            >
              Then add a project via Settings
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Go to <strong>Settings → Projects</strong> and add a project pointing to <code>/workspace</code> (or any mounted directory).
              Projects can also be added via the API or Telegram.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: First Session ─────────────────────────────────────────────────────

function StepFirstSession({
  hasProjects,
  onOpenNewSession,
}: {
  hasProjects: boolean;
  onOpenNewSession: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center px-2">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #4285F420, #34A85320)",
          border: "1px solid #34A85330",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Rocket size={32} weight="duotone" style={{ color: "#34A853" }} aria-hidden="true" />
      </div>
      <div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-sans, Space Grotesk, sans-serif)" }}
        >
          You're all set!
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
          {hasProjects
            ? "Start your first Claude session. Select a project directory and give Claude a task."
            : "You can start a quick session without a project, or configure projects first."}
        </p>
      </div>
      <button
        onClick={onOpenNewSession}
        className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all"
        style={{
          background: "#4285F4",
          color: "#fff",
          border: "none",
          boxShadow: "0 2px 8px #4285F440",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#3367D6";
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "#4285F4";
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
        }}
      >
        <Rocket size={16} weight="duotone" aria-hidden="true" />
        Start First Session
        <ArrowRight size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

export function OnboardingWizard({ onOpenNewSession }: OnboardingWizardProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Fetch setup status
    fetch("/api/setup-status")
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        setStatus(data);
        const isComplete =
          data.hasApiKey &&
          data.hasProjects;
        if (!isComplete) {
          setVisible(true);
        }
      })
      .catch(() => {
        // Server not available — skip wizard
      });
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const handleOpenNewSession = () => {
    dismiss();
    onOpenNewSession();
  };

  if (!visible || !status) return null;

  const canGoNext = step < TOTAL_STEPS - 1;
  const canGoBack = step > 0;

  return (
    // Backdrop
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding wizard"
    >
      {/* Modal */}
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          borderRadius: 16,
          background: "var(--color-bg-card, #121a20)",
          border: "1px solid var(--color-border, #2a3f52)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--color-border, #2a3f52)" }}
        >
          <div className="flex items-center gap-2">
            {/* Step dots */}
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <StepDot key={i} index={i} current={step} total={TOTAL_STEPS} />
            ))}
          </div>
          <span
            className="text-xs"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
          >
            Step {step + 1} of {TOTAL_STEPS}
          </span>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--color-text-primary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--color-text-muted, #6b7280)")
            }
            aria-label="Skip onboarding"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6" style={{ minHeight: 280 }}>
          {step === 0 && <StepWelcome />}
          {step === 1 && <StepClaudeCLI available={status.claudeCliAvailable ?? true} />}
          {step === 2 && <StepProjects hasProjects={status.hasProjects} />}
          {step === 3 && (
            <StepFirstSession
              hasProjects={status.hasProjects}
              onOpenNewSession={handleOpenNewSession}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: "1px solid var(--color-border, #2a3f52)" }}
        >
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={!canGoBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "var(--color-bg-elevated, #1a2332)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border, #2a3f52)",
            }}
            aria-label="Previous step"
          >
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
            Back
          </button>

          <button
            onClick={dismiss}
            className="text-xs cursor-pointer transition-colors"
            style={{ color: "var(--color-text-muted, #6b7280)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--color-text-secondary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color =
                "var(--color-text-muted, #6b7280)")
            }
          >
            Skip setup
          </button>

          {canGoNext ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
              style={{
                background: "#4285F4",
                color: "#fff",
                border: "none",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "#3367D6")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "#4285F4")
              }
              aria-label="Next step"
            >
              Next
              <ArrowRight size={14} weight="bold" aria-hidden="true" />
            </button>
          ) : (
            // Placeholder to keep layout stable on last step
            <div style={{ width: 80 }} />
          )}
        </div>
      </div>
    </div>
  );
}
