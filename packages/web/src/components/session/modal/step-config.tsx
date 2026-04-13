"use client";

import { type ChangeEvent } from "react";
import { getModelsForPlatform } from "@/hooks/use-cli-platforms";
import { TemplateVariablesForm, type TemplateVariable } from "../template-variables-form";
import { PersonaAvatar } from "@/components/persona/persona-avatar";
import { PersonaTooltip } from "@/components/persona/persona-tooltip";
import { COMMAND_PRESETS, type Persona } from "@companion/shared";

// ── Types ───────────────────────────────────────────────────────────────────

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

const PERMISSION_DESCRIPTIONS: Record<PermissionMode, string> = {
  default: "Claude asks before any file or command changes",
  acceptEdits: "Claude auto-approves file edits, asks for commands",
  bypassPermissions: "Claude acts autonomously — no permission prompts",
  plan: "Claude plans only, no file or command execution",
};

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

export interface StepConfigProps {
  projectName: string;
  onProjectNameChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  permissionMode: PermissionMode;
  onPermissionModeChange: (v: PermissionMode) => void;
  selectedPlatform: "claude" | "codex" | "gemini" | "opencode";
  // Platform-specific
  codexApprovalMode: string;
  onCodexApprovalModeChange: (v: string) => void;
  geminiSandbox: boolean;
  onGeminiSandboxChange: (v: boolean) => void;
  geminiYolo: boolean;
  onGeminiYoloChange: (v: boolean) => void;
  // Persona
  selectedPersonaId: string | null;
  onSelectedPersonaIdChange: (v: string | null) => void;
  allPersonas: Persona[];
  // Templates
  templates: TemplateItem[];
  selectedTemplateId: string | null;
  onSelectTemplate: (tpl: TemplateItem) => void;
  selectedTemplate: TemplateItem | null;
  templateVariables: TemplateVariable[];
  templateVars: Record<string, string>;
  onTemplateVarsChange: (v: Record<string, string>) => void;
  templateVarsValid: boolean;
  // Prompt & options
  initialPrompt: string;
  onInitialPromptChange: (v: string) => void;
  idleTimeout: number;
  onIdleTimeoutChange: (v: number) => void;
  resume: boolean;
  onResumeChange: (v: boolean) => void;
  selectedDir: string;
  // Navigation
  onBack: () => void;
  onNext: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StepConfig(props: StepConfigProps) {
  const {
    projectName,
    onProjectNameChange,
    model,
    onModelChange,
    permissionMode,
    onPermissionModeChange,
    selectedPlatform,
    codexApprovalMode,
    onCodexApprovalModeChange,
    geminiSandbox,
    onGeminiSandboxChange,
    geminiYolo,
    onGeminiYoloChange,
    selectedPersonaId,
    onSelectedPersonaIdChange,
    allPersonas,
    templates,
    selectedTemplateId,
    onSelectTemplate,
    selectedTemplate,
    templateVariables,
    templateVars,
    onTemplateVarsChange,
    templateVarsValid,
    initialPrompt,
    onInitialPromptChange,
    idleTimeout,
    onIdleTimeoutChange,
    resume,
    onResumeChange,
    selectedDir,
    onBack,
    onNext,
  } = props;

  return (
    <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto" style={{ maxHeight: 460 }}>
      {/* Project name */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" htmlFor="project-name-input">
          PROJECT NAME
        </label>
        <input
          id="project-name-input"
          type="text"
          value={projectName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onProjectNameChange(e.target.value)}
          placeholder="my-project"
          className="w-full px-3 py-2 rounded-lg text-sm input-bordered text-text-primary bg-bg-elevated" style={{
            fontFamily: "var(--font-body)",
          }}
          autoFocus
        />
      </div>

      {/* Model — dynamic per platform */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" htmlFor="model-select">
          MODEL
          <span className="font-normal ml-1 text-text-muted">
            (
            {selectedPlatform === "claude"
              ? "Claude"
              : selectedPlatform === "codex"
                ? "Codex"
                : selectedPlatform === "gemini"
                  ? "Gemini"
                  : "OpenCode"}
            )
          </span>
        </label>
        <select
          id="model-select"
          value={model}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onModelChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer text-text-primary bg-bg-elevated font-mono"
        >
          {getModelsForPlatform(selectedPlatform).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Platform-specific options */}
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
                onClick={() => onCodexApprovalModeChange(opt.value)}
                className="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors"
                style={{
                  background:
                    codexApprovalMode === opt.value ? "#10B98115" : "var(--color-bg-elevated)",
                  border:
                    codexApprovalMode === opt.value
                      ? "1.5px solid #10B981"
                      : "1px solid var(--color-border)",
                  color:
                    codexApprovalMode === opt.value ? "#10B981" : "var(--color-text-secondary)",
                }}
              >
                <span className="font-semibold">{opt.label}</span>
                <span className="text-text-muted" style={{ fontSize: 10 }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPlatform === "gemini" && (
        <div className="flex flex-col gap-3">
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
            style={{ background: "#4285F410", border: "1px solid #4285F430" }}
          >
            <span className="font-semibold" style={{ color: "#4285F4", fontSize: 11 }}>
              Free tier: 1000 req/day with Google Account
            </span>
          </div>
          <label
            className="shadow-soft flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer bg-bg-elevated"
          >
            <input
              type="checkbox"
              checked={geminiSandbox}
              onChange={(e) => onGeminiSandboxChange(e.target.checked)}
              className="cursor-pointer"
              style={{ accentColor: "#4285F4" }}
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Sandbox Mode
              </p>
              <p className="text-xs text-text-muted">
                Run in isolated sandbox environment
              </p>
            </div>
          </label>
          <label
            className="shadow-soft flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer bg-bg-elevated"
          >
            <input
              type="checkbox"
              checked={geminiYolo}
              onChange={(e) => onGeminiYoloChange(e.target.checked)}
              className="cursor-pointer"
              style={{ accentColor: "#EA4335" }}
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                YOLO Mode
              </p>
              <p className="text-xs text-text-muted">
                Skip all confirmations (dangerous)
              </p>
            </div>
          </label>
        </div>
      )}

      {selectedPlatform === "opencode" && (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
          style={{ background: "#8B5CF610", border: "1px solid #8B5CF630" }}
        >
          <span className="font-semibold" style={{ color: "#8B5CF6", fontSize: 11 }}>
            75+ providers via OpenCode — supports local (Ollama) and cloud models
          </span>
        </div>
      )}

      {/* Expert Mode / Persona picker — only for Claude */}
      {selectedPlatform === "claude" && (
        <div>
          <p className="text-xs font-semibold mb-2">
            EXPERT MODE <span className="font-normal">(optional)</span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            {/* None option */}
            <button
              type="button"
              onClick={() => onSelectedPersonaIdChange(null)}
              className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all flex-shrink-0"
              style={{
                width: 64,
                background: selectedPersonaId === null ? "#4285F410" : "var(--color-bg-elevated)",
                border:
                  selectedPersonaId === null
                    ? "2px solid #4285F4"
                    : "1px solid var(--color-border)",
                transform: selectedPersonaId === null ? "scale(1.05)" : "scale(1)",
              }}
              aria-pressed={selectedPersonaId === null}
            >
              <div
                className="shadow-soft flex items-center justify-center rounded-full text-text-muted bg-bg-card" style={{
                  width: 36,
                  height: 36,
                  fontSize: 14,
                  }}
              >
                —
              </div>
              <span
                className="text-[10px] truncate w-full text-center text-text-muted"
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
                    onClick={() => onSelectedPersonaIdChange(isSelected ? null : persona.id)}
                    className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all flex-shrink-0"
                    style={{
                      width: 64,
                      background: isSelected ? "#4285F410" : "var(--color-bg-elevated)",
                      border: isSelected ? "2px solid #4285F4" : "1px solid var(--color-border)",
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
        </div>
      )}

      {/* Permission mode — Claude only */}
      {selectedPlatform === "claude" && (
        <div>
          <p className="text-xs font-semibold mb-2">PERMISSION MODE</p>
          <div className="flex flex-col gap-2">
            {(Object.entries(PERMISSION_DESCRIPTIONS) as [PermissionMode, string][]).map(
              ([mode, desc]) => (
                <label
                  key={mode}
                  className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: permissionMode === mode ? "#4285F408" : "var(--color-bg-elevated)",
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
                    onChange={() => onPermissionModeChange(mode)}
                    className="mt-0.5 cursor-pointer"
                    style={{ accentColor: "#4285F4" }}
                  />
                  <div>
                    <p className="text-sm font-semibold capitalize">{mode}</p>
                    <p className="text-xs mt-0.5">{desc}</p>
                  </div>
                </label>
              ),
            )}
          </div>
        </div>
      )}

      {/* Template picker */}
      {templates.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">
            TEMPLATE <span className="ml-1 font-normal">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onSelectTemplate(tpl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? "#4285F415" : "var(--color-bg-elevated)",
                    border: isSelected ? "1px solid #4285F440" : "1px solid var(--color-border)",
                    color: isSelected ? "#4285F4" : "var(--color-text-secondary)",
                  }}
                  aria-pressed={isSelected}
                >
                  <span aria-hidden="true">{tpl.icon}</span>
                  {tpl.name}
                  {tpl.variables && tpl.variables.length > 0 && (
                    <span
                      className="ml-0.5 font-mono text-text-muted" style={{ fontSize: 10 }}
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
          onChange={onTemplateVarsChange}
        />
      )}

      {/* Command Presets */}
      <div>
        <label className="block text-xs font-semibold mb-1.5">
          QUICK START <span className="font-normal">(click to set as prompt)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {COMMAND_PRESETS.flatMap((cat) =>
            cat.presets.slice(0, 3).map((p) => (
              <button
                key={p.command}
                type="button"
                onClick={() => onInitialPromptChange(p.command)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] cursor-pointer transition-colors hover:bg-[var(--color-bg-elevated)]"
                style={{
                  background:
                    initialPrompt === p.command
                      ? "var(--color-accent)" + "20"
                      : "var(--color-bg-card)",
                  border: `1px solid ${initialPrompt === p.command ? "var(--color-accent)" : "var(--color-border)"}`,
                  color:
                    initialPrompt === p.command ? "var(--color-accent)" : "var(--color-text-muted)",
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
        <label className="block text-xs font-semibold mb-1.5" htmlFor="initial-prompt">
          INITIAL PROMPT <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id="initial-prompt"
          value={initialPrompt}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onInitialPromptChange(e.target.value)}
          placeholder="Start with a specific task..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm input-bordered resize-none text-text-primary bg-bg-elevated" style={{
            fontFamily: "var(--font-body)",
          }}
        />
      </div>

      {/* Idle Timeout */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold tracking-wider">IDLE TIMEOUT</p>
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
              onClick={() => onIdleTimeoutChange(opt.value)}
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
        className="shadow-sm flex items-center gap-3 p-3 rounded-lg cursor-pointer bg-bg-elevated"
      >
        <input
          type="checkbox"
          checked={resume}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onResumeChange(e.target.checked)}
          className="cursor-pointer"
          style={{ accentColor: "#4285F4" }}
        />
        <div>
          <p className="text-sm font-semibold">Resume previous session</p>
          <p className="text-xs mt-0.5">Continue from last conversation in this project</p>
        </div>
      </label>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="shadow-soft px-4 py-2 rounded-lg text-sm font-medium cursor-pointer text-text-secondary bg-bg-elevated"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedDir || !templateVarsValid}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#4285F4", color: "#fff" }}
        >
          Next: Review
        </button>
      </div>
    </div>
  );
}
