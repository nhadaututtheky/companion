"use client";
import { useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Check, FloppyDisk, X, Plus, Trash } from "@phosphor-icons/react";
import { PersonaAvatar } from "./persona-avatar";
import type { Persona } from "@companion/shared";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PersonaFormData {
  name: string;
  icon: string;
  title: string;
  intro: string;
  systemPrompt: string;
  mentalModels: string[];
  decisionFramework: string;
  redFlags: string[];
  communicationStyle: string;
  blindSpots: string[];
  bestFor: string[];
  strength: string;
  avatarGradient: [string, string];
  avatarInitials: string;
}

interface PersonaBuilderProps {
  /** Initial data for editing an existing persona */
  initial?: Partial<PersonaFormData>;
  /** Whether we're editing (vs creating) */
  editing?: boolean;
  onSave: (data: PersonaFormData) => void;
  onCancel: () => void;
  saving?: boolean;
}

const STEPS = [
  "Identity",
  "Avatar",
  "System Prompt",
  "Mental Models",
  "Framework & Style",
  "Red Flags & Blind Spots",
  "Review",
] as const;

const DEFAULT_FORM: PersonaFormData = {
  name: "",
  icon: "🧠",
  title: "",
  intro: "",
  systemPrompt: "",
  mentalModels: [""],
  decisionFramework: "",
  redFlags: [""],
  communicationStyle: "",
  blindSpots: [""],
  bestFor: [""],
  strength: "",
  avatarGradient: ["#6366f1", "#8b5cf6"],
  avatarInitials: "",
};

const ICON_OPTIONS = [
  "🧠",
  "🎯",
  "🔥",
  "⚡",
  "🛡️",
  "🔬",
  "🎨",
  "🏗️",
  "🚀",
  "💡",
  "🔮",
  "🦊",
  "🐺",
  "🦅",
  "🌊",
  "⭐",
];

const GRADIENT_PRESETS: [string, string][] = [
  ["#6366f1", "#8b5cf6"],
  ["#ec4899", "#f43f5e"],
  ["#14b8a6", "#06b6d4"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#059669"],
  ["#3b82f6", "#1d4ed8"],
  ["#8b5cf6", "#ec4899"],
  ["#f97316", "#facc15"],
  ["#64748b", "#334155"],
  ["#e11d48", "#be123c"],
  ["#0ea5e9", "#6366f1"],
  ["#84cc16", "#22c55e"],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function EditableList({
  items,
  onChange,
  placeholder,
  max = 10,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs input-bordered text-text-primary bg-bg-card"
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="p-1 rounded transition-colors cursor-pointer text-text-muted"
              aria-label="Remove item"
            >
              <Trash size={12} />
            </button>
          )}
        </div>
      ))}
      {items.length < max && (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors text-accent"
        >
          <Plus size={11} weight="bold" /> Add item
        </button>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PersonaBuilder({
  initial,
  editing,
  onSave,
  onCancel,
  saving,
}: PersonaBuilderProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PersonaFormData>(() => ({
    ...DEFAULT_FORM,
    ...initial,
    mentalModels: initial?.mentalModels?.length ? initial.mentalModels : [""],
    redFlags: initial?.redFlags?.length ? initial.redFlags : [""],
    blindSpots: initial?.blindSpots?.length ? initial.blindSpots : [""],
    bestFor: initial?.bestFor?.length ? initial.bestFor : [""],
  }));

  const update = useCallback(
    <K extends keyof PersonaFormData>(key: K, value: PersonaFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const canAdvance = (): boolean => {
    switch (step) {
      case 0:
        return form.name.trim().length > 0 && form.title.trim().length > 0;
      case 1:
        return form.avatarInitials.trim().length > 0;
      case 2:
        return form.systemPrompt.trim().length > 0;
      default:
        return true;
    }
  };

  const handleSave = () => {
    const cleaned: PersonaFormData = {
      ...form,
      mentalModels: form.mentalModels.filter((s) => s.trim()),
      redFlags: form.redFlags.filter((s) => s.trim()),
      blindSpots: form.blindSpots.filter((s) => s.trim()),
      bestFor: form.bestFor.filter((s) => s.trim()),
      avatarInitials: form.avatarInitials.trim() || form.name.slice(0, 2).toUpperCase(),
    };
    onSave(cleaned);
  };

  // Preview persona for avatar
  const previewPersona: Persona = {
    id: "preview",
    name: form.name || "Preview",
    slug: "preview",
    icon: form.icon,
    category: "custom",
    title: form.title,
    intro: form.intro,
    systemPrompt: form.systemPrompt,
    mentalModels: form.mentalModels.filter(Boolean),
    decisionFramework: form.decisionFramework,
    redFlags: form.redFlags.filter(Boolean),
    communicationStyle: form.communicationStyle,
    blindSpots: form.blindSpots.filter(Boolean),
    bestFor: form.bestFor.filter(Boolean),
    strength: form.strength,
    avatarGradient: form.avatarGradient,
    avatarInitials: form.avatarInitials || form.name.slice(0, 2).toUpperCase() || "CP",
    builtIn: false,
  };

  return (
    <div
      className="shadow-soft flex flex-col gap-4 rounded-xl p-5 bg-bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {editing ? "Edit Persona" : "Create Custom Persona"}
        </h3>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg cursor-pointer transition-colors text-text-muted"
          aria-label="Cancel"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            disabled={i > step}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors cursor-pointer disabled:cursor-default"
            style={{
              background:
                i === step
                  ? "var(--color-accent)"
                  : i < step
                    ? "var(--color-bg-elevated)"
                    : "transparent",
              color:
                i === step
                  ? "#fff"
                  : i < step
                    ? "var(--color-text-secondary)"
                    : "var(--color-text-muted)",
              fontSize: 10,
              fontWeight: i === step ? 600 : 400,
            }}
          >
            {i < step ? <Check size={10} weight="bold" /> : null}
            {label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="min-h-[200px]">
        {step === 0 && <StepIdentity form={form} update={update} />}
        {step === 1 && <StepAvatar form={form} update={update} preview={previewPersona} />}
        {step === 2 && <StepSystemPrompt form={form} update={update} />}
        {step === 3 && <StepMentalModels form={form} update={update} />}
        {step === 4 && <StepFrameworkStyle form={form} update={update} />}
        {step === 5 && <StepRedFlagsBlindSpots form={form} update={update} />}
        {step === 6 && <StepReview persona={previewPersona} />}
      </div>

      {/* Navigation */}
      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => step > 0 && setStep(step - 1)}
          disabled={step === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-30 text-text-secondary bg-bg-elevated"
        >
          <ArrowLeft size={12} weight="bold" /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canAdvance() && setStep(step + 1)}
            disabled={!canAdvance()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Next <ArrowRight size={12} weight="bold" />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40"
            style={{ background: "#10b981", color: "#fff" }}
          >
            <FloppyDisk size={13} weight="bold" />
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Persona"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step Components ──────────────────────────────────────────────────────────

interface StepProps {
  form: PersonaFormData;
  update: <K extends keyof PersonaFormData>(key: K, value: PersonaFormData[K]) => void;
}

function StepIdentity({ form, update }: StepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Name *
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => {
            update("name", e.target.value);
            if (
              !form.avatarInitials ||
              form.avatarInitials === form.name.slice(0, 2).toUpperCase()
            ) {
              update("avatarInitials", e.target.value.slice(0, 2).toUpperCase());
            }
          }}
          placeholder="e.g. Security Auditor"
          className="rounded-lg px-2.5 py-2 text-sm input-bordered text-text-primary" style={{ background: "var(--color-bg-base)" }}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Title *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="e.g. Senior Security Engineer — Threat Modeling Expert"
          className="rounded-lg px-2.5 py-2 text-sm input-bordered text-text-primary" style={{ background: "var(--color-bg-base)" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Icon
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ICON_OPTIONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => update("icon", icon)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-base cursor-pointer transition-all"
              style={{
                background: form.icon === icon ? "var(--color-accent)" : "var(--color-bg-elevated)",
                transform: form.icon === icon ? "scale(1.1)" : "scale(1)",
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Intro (optional)
        </label>
        <textarea
          value={form.intro}
          onChange={(e) => update("intro", e.target.value)}
          placeholder="2-3 sentences describing this persona's thinking style…"
          rows={2}
          className="rounded-lg px-2.5 py-2 text-xs input-bordered resize-none text-text-primary" style={{ background: "var(--color-bg-base)" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Strength (one-liner)
        </label>
        <input
          type="text"
          value={form.strength}
          onChange={(e) => update("strength", e.target.value)}
          placeholder="e.g. Finds the vulnerability no one else sees"
          className="rounded-lg px-2.5 py-2 text-xs input-bordered text-text-primary" style={{ background: "var(--color-bg-base)" }}
        />
      </div>
    </div>
  );
}

function StepAvatar({ form, update, preview }: StepProps & { preview: Persona }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <PersonaAvatar persona={preview} size={64} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            Initials *
          </label>
          <input
            type="text"
            value={form.avatarInitials}
            onChange={(e) => update("avatarInitials", e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            className="w-20 rounded-lg px-2.5 py-2 text-sm font-bold text-center input-bordered text-text-primary" style={{ background: "var(--color-bg-base)" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">
          Gradient preset
        </label>
        <div className="flex flex-wrap gap-2">
          {GRADIENT_PRESETS.map(([c1, c2]) => (
            <button
              key={`${c1}-${c2}`}
              type="button"
              onClick={() => update("avatarGradient", [c1, c2])}
              className="w-8 h-8 rounded-full cursor-pointer transition-all"
              style={{
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                outline:
                  form.avatarGradient[0] === c1 && form.avatarGradient[1] === c2
                    ? "2px solid var(--color-accent)"
                    : "2px solid transparent",
                outlineOffset: 2,
              }}
              aria-label={`Gradient ${c1} to ${c2}`}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-text-secondary">
            Color 1
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.avatarGradient[0]}
              onChange={(e) => update("avatarGradient", [e.target.value, form.avatarGradient[1]])}
              className="w-8 h-8 rounded cursor-pointer"
            />
            <span className="text-xs font-mono text-text-muted">
              {form.avatarGradient[0]}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-text-secondary">
            Color 2
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.avatarGradient[1]}
              onChange={(e) => update("avatarGradient", [form.avatarGradient[0], e.target.value])}
              className="w-8 h-8 rounded cursor-pointer"
            />
            <span className="text-xs font-mono text-text-muted">
              {form.avatarGradient[1]}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Best for (tags)
        </label>
        <EditableList
          items={form.bestFor}
          onChange={(v) => update("bestFor", v)}
          placeholder="e.g. Security audits, Threat modeling"
          max={10}
        />
      </div>
    </div>
  );
}

function StepSystemPrompt({ form, update }: StepProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-text-secondary">
        System Prompt * — defines how this persona thinks and communicates
      </label>
      <textarea
        value={form.systemPrompt}
        onChange={(e) => update("systemPrompt", e.target.value)}
        placeholder={`You are channeling the thinking patterns of [persona name]...

## How You Think
- ...

## How You Decide
- ...

## What You Flag Immediately
- ...

## How You Communicate
...`}
        rows={14}
        className="rounded-lg px-3 py-2.5 text-xs font-mono leading-relaxed input-bordered resize-y text-text-primary" style={{ background: "var(--color-bg-base)" }}
        autoFocus
      />
      <p className="text-xs text-text-muted">
        {form.systemPrompt.length}/10,000 characters
      </p>
    </div>
  );
}

function StepMentalModels({ form, update }: StepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Mental Models — how this persona frames problems
        </label>
        <EditableList
          items={form.mentalModels}
          onChange={(v) => update("mentalModels", v)}
          placeholder="e.g. Defense in depth: assume every layer will be breached"
        />
      </div>
    </div>
  );
}

function StepFrameworkStyle({ form, update }: StepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Decision Framework — how this persona evaluates options
        </label>
        <textarea
          value={form.decisionFramework}
          onChange={(e) => update("decisionFramework", e.target.value)}
          placeholder="When evaluating any proposal, this persona asks:
1. What's the attack surface?
2. What's the blast radius if this fails?
3. ..."
          rows={6}
          className="rounded-lg px-2.5 py-2 text-xs input-bordered resize-y text-text-primary" style={{ background: "var(--color-bg-base)" }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Communication Style — tone and delivery
        </label>
        <textarea
          value={form.communicationStyle}
          onChange={(e) => update("communicationStyle", e.target.value)}
          placeholder="e.g. Direct and urgent. Uses security severity ratings. Always provides remediation steps alongside findings."
          rows={3}
          className="rounded-lg px-2.5 py-2 text-xs input-bordered resize-y text-text-primary" style={{ background: "var(--color-bg-base)" }}
        />
      </div>
    </div>
  );
}

function StepRedFlagsBlindSpots({ form, update }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Red Flags — what this persona immediately calls out
        </label>
        <EditableList
          items={form.redFlags}
          onChange={(v) => update("redFlags", v)}
          placeholder="e.g. Hardcoded secrets in source code"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Blind Spots — known weaknesses of this thinking style
        </label>
        <EditableList
          items={form.blindSpots}
          onChange={(v) => update("blindSpots", v)}
          placeholder="e.g. May over-engineer security at the cost of developer experience"
        />
      </div>
    </div>
  );
}

function StepReview({ persona }: { persona: Persona }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PersonaAvatar persona={persona} size={48} />
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {persona.name || "Unnamed"} {persona.icon}
          </p>
          <p className="text-xs text-text-secondary">
            {persona.title || "No title"}
          </p>
        </div>
      </div>

      {persona.intro && (
        <p className="text-xs text-text-secondary">
          {persona.intro}
        </p>
      )}

      {persona.strength && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-muted">
            Strength:
          </span>
          <span className="text-xs text-text-primary">
            {persona.strength}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ReviewSection title="Mental Models" items={persona.mentalModels} />
        <ReviewSection title="Red Flags" items={persona.redFlags} />
        <ReviewSection title="Blind Spots" items={persona.blindSpots} />
        <ReviewSection title="Best For" items={persona.bestFor} />
      </div>

      {persona.systemPrompt && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-muted">
            System Prompt Preview
          </span>
          <pre
            className="text-xs rounded-lg p-2.5 overflow-auto max-h-32 text-text-secondary bg-bg-base whitespace-pre-wrap" style={{
              wordBreak: "break-word",
            }}
          >
            {persona.systemPrompt.slice(0, 500)}
            {persona.systemPrompt.length > 500 ? "…" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReviewSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-text-muted">
        {title}
      </span>
      {items.map((item, i) => (
        <span key={i} className="text-xs text-text-secondary">
          • {item}
        </span>
      ))}
    </div>
  );
}
