"use client";
import { CaretDown, Wrench, ChatText, Trash } from "@phosphor-icons/react";
import { getModelsForPlatform, getDefaultModelForPlatform } from "@/hooks/use-cli-platforms";

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentSource = "cli" | "api";

export interface DebateAgentConfig {
  id: string;
  source: AgentSource;
  platform: "claude" | "codex" | "gemini" | "opencode";
  model: string;
  role: string;
  label: string;
  emoji: string;
}

interface DebateAgentCardProps {
  agent: DebateAgentConfig;
  index: number;
  availablePlatforms: string[];
  canRemove: boolean;
  onChange: (updated: DebateAgentConfig) => void;
  onRemove: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: "advocate", label: "Advocate (For)" },
  { value: "challenger", label: "Challenger (Against)" },
  { value: "reviewer", label: "Reviewer" },
  { value: "builder", label: "Builder" },
];

const PLATFORM_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  claude: { label: "Claude", icon: "◈", color: "#d97706" },
  codex: { label: "Codex", icon: "◇", color: "#22c55e" },
  gemini: { label: "Gemini", icon: "◆", color: "#3b82f6" },
  opencode: { label: "OpenCode", icon: "☁", color: "#a855f7" },
};

const AGENT_EMOJIS = ["🔵", "🔴", "🟢", "🟡"];

// ── Component ──────────────────────────────────────────────────────────────

export function DebateAgentCard({
  agent,
  index,
  availablePlatforms,
  canRemove,
  onChange,
  onRemove,
}: DebateAgentCardProps) {
  const _platformInfo = PLATFORM_LABELS[agent.platform] ?? PLATFORM_LABELS.claude;
  const models = getModelsForPlatform(agent.platform);
  const isCLI = agent.source === "cli";

  const handlePlatformChange = (platform: string) => {
    const defaultModel = getDefaultModelForPlatform(platform);
    onChange({
      ...agent,
      platform: platform as DebateAgentConfig["platform"],
      model: defaultModel,
      source: "cli",
    });
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{agent.emoji || AGENT_EMOJIS[index] || "🤖"}</span>
          <input
            type="text"
            value={agent.label}
            onChange={(e) => onChange({ ...agent, label: e.target.value })}
            className="text-xs font-semibold bg-transparent border-none outline-none"
            style={{ color: "var(--color-text-primary)", width: 120 }}
            aria-label={`Agent ${index + 1} name`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {isCLI ? (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--color-success)20", color: "var(--color-success)", fontSize: 10 }}>
              <Wrench size={10} aria-hidden="true" />
              Tool access
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--color-text-muted)20", color: "var(--color-text-muted)", fontSize: 10 }}>
              <ChatText size={10} aria-hidden="true" />
              Text only
            </span>
          )}
          {canRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded transition-all cursor-pointer"
              style={{ color: "var(--color-text-muted)" }}
              aria-label={`Remove agent ${index + 1}`}
            >
              <Trash size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Platform select */}
      <div className="flex gap-2">
        <div className="flex flex-col gap-0.5 flex-1">
          <label className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
            Platform
          </label>
          <div className="relative">
            <select
              value={agent.platform}
              onChange={(e) => handlePlatformChange(e.target.value)}
              className="w-full appearance-none rounded-lg px-2 py-1 text-xs input-bordered cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
              aria-label="Select platform"
            >
              {Object.entries(PLATFORM_LABELS).map(([id, info]) => (
                <option key={id} value={id} disabled={!availablePlatforms.includes(id)}>
                  {info.icon} {info.label} {!availablePlatforms.includes(id) ? "(not found)" : ""}
                </option>
              ))}
            </select>
            <CaretDown size={10} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Model select */}
        <div className="flex flex-col gap-0.5 flex-1">
          <label className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
            Model
          </label>
          <div className="relative">
            <select
              value={agent.model}
              onChange={(e) => onChange({ ...agent, model: e.target.value })}
              className="w-full appearance-none rounded-lg px-2 py-1 text-xs input-bordered cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
              aria-label="Select model"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <CaretDown size={10} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      {/* Role select */}
      <div className="flex flex-col gap-0.5">
        <label className="text-xs" style={{ color: "var(--color-text-muted)", fontSize: 10 }}>
          Role
        </label>
        <div className="relative">
          <select
            value={agent.role}
            onChange={(e) => onChange({ ...agent, role: e.target.value })}
            className="w-full appearance-none rounded-lg px-2 py-1 text-xs input-bordered cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              color: "var(--color-text-primary)",
            }}
            aria-label="Select role"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <CaretDown size={10} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
        </div>
      </div>
    </div>
  );
}
