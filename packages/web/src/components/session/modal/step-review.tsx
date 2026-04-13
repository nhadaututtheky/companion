"use client";

import { CircleNotch, Rocket } from "@phosphor-icons/react";
import { getModelsForPlatform } from "@/hooks/use-cli-platforms";
import { PersonaAvatar } from "@/components/persona/persona-avatar";
import type { Persona } from "@companion/shared";

export interface StepReviewProps {
  projectName: string;
  selectedDir: string;
  model: string;
  permissionMode: string;
  selectedPlatform: "claude" | "codex" | "gemini" | "opencode";
  selectedPersonaId: string | null;
  allPersonas: Persona[];
  resume: boolean;
  initialPrompt: string;
  launching: boolean;
  atLimit: boolean;
  templateVarsValid: boolean;
  onLaunch: () => void;
  onBack: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StepReview(props: StepReviewProps) {
  const {
    projectName,
    selectedDir,
    model,
    permissionMode,
    selectedPlatform,
    selectedPersonaId,
    allPersonas,
    resume,
    initialPrompt,
    launching,
    atLimit,
    templateVarsValid,
    onLaunch,
    onBack,
  } = props;

  const selectedPersona = allPersonas.find((p) => p.id === selectedPersonaId);

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* Summary card */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3 bg-bg-elevated border border-border"
      >
        <h3
          className="text-sm font-bold text-text-primary" style={{
            fontFamily: "var(--font-display)",
            }}
        >
          {projectName || "Unnamed project"}
        </h3>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Directory</span>
            <span className="text-xs font-mono truncate">{selectedDir}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Platform</span>
            <span
              className="text-xs font-semibold"
              style={{
                color:
                  selectedPlatform === "claude"
                    ? "#D97706"
                    : selectedPlatform === "codex"
                      ? "#10B981"
                      : selectedPlatform === "gemini"
                        ? "#4285F4"
                        : "#8B5CF6",
              }}
            >
              {selectedPlatform === "claude"
                ? "◈ Claude Code"
                : selectedPlatform === "codex"
                  ? "◇ Codex"
                  : selectedPlatform === "gemini"
                    ? "◆ Gemini CLI"
                    : "☁ OpenCode"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Model</span>
            <span className="text-xs font-mono">
              {getModelsForPlatform(selectedPlatform).find((m) => m.value === model)?.label ??
                model}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Permissions</span>
            <span className="text-xs capitalize">{permissionMode}</span>
          </div>
          {selectedPersonaId && selectedPersona && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Expert</span>
              <span className="flex items-center gap-1.5">
                <PersonaAvatar persona={selectedPersona} size={18} showBadge={false} />
                <span className="text-xs font-medium" style={{ color: "#4285F4" }}>
                  {selectedPersona.name}
                </span>
              </span>
            </div>
          )}
          {resume && (
            <div className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Resume</span>
              <span className="text-xs" style={{ color: "#34A853" }}>
                Yes
              </span>
            </div>
          )}
          {initialPrompt.trim() && (
            <div className="flex items-start gap-2">
              <span className="w-24 flex-shrink-0 text-xs font-semibold uppercase">Prompt</span>
              <span className="text-xs">
                {initialPrompt.length > 120 ? `${initialPrompt.slice(0, 120)}…` : initialPrompt}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer text-text-secondary bg-bg-elevated border border-border"
        >
          Back
        </button>

        <button
          onClick={onLaunch}
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
  );
}
