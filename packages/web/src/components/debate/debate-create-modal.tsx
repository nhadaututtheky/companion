"use client";
import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Z } from "@/lib/z-index";
import { X, Plus, Rocket, CaretDown, FolderSimple, CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAnimatePresence } from "@/lib/animation";
import { useCLIPlatforms, getDefaultModelForPlatform } from "@/hooks/use-cli-platforms";
import { api } from "@/lib/api-client";
import { DebateAgentCard, type DebateAgentConfig } from "./debate-agent-card";

// ── Types ──────────────────────────────────────────────────────────────────

interface DebateCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (channelId: string) => void;
  defaultWorkingDir?: string;
}

type DebateFormat = "pro_con" | "code_review" | "architecture" | "benchmark";

const FORMAT_OPTIONS: Array<{ value: DebateFormat; label: string; desc: string }> = [
  { value: "pro_con", label: "Pro / Con", desc: "Two agents argue for and against" },
  { value: "code_review", label: "Code Review", desc: "Builder writes, reviewer critiques" },
  { value: "architecture", label: "Architecture", desc: "Propose and defend design approaches" },
  { value: "benchmark", label: "Benchmark", desc: "Solve same task, compare solutions" },
];

const AGENT_EMOJIS = ["🔵", "🔴", "🟢", "🟡"];

function makeDefaultAgent(index: number, platform: string): DebateAgentConfig {
  const roles = ["advocate", "challenger", "reviewer", "builder"];
  const labels = ["Agent A", "Agent B", "Agent C", "Agent D"];
  return {
    id: `agent-${index}`,
    source: "cli",
    platform: platform as DebateAgentConfig["platform"],
    model: getDefaultModelForPlatform(platform),
    role: roles[index] ?? "reviewer",
    label: labels[index] ?? `Agent ${index + 1}`,
    emoji: AGENT_EMOJIS[index] ?? "🤖",
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export function DebateCreateModal({
  open,
  onClose,
  onCreated,
  defaultWorkingDir,
}: DebateCreateModalProps) {
  const { shouldRender, animationState } = useAnimatePresence(open);
  const { platforms, loading: platformsLoading } = useCLIPlatforms();

  const availablePlatforms = platforms.filter((p) => p.available).map((p) => p.id);

  const defaultPlatform = availablePlatforms[0] ?? "claude";

  // Form state
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<DebateFormat>("pro_con");
  const [workingDir, setWorkingDir] = useState(defaultWorkingDir ?? "");
  const [maxRounds, setMaxRounds] = useState(3);
  const [agents, setAgents] = useState<DebateAgentConfig[]>([
    makeDefaultAgent(0, defaultPlatform),
    makeDefaultAgent(1, availablePlatforms[1] ?? defaultPlatform),
  ]);
  const [starting, setStarting] = useState(false);

  // Agent management
  const updateAgent = useCallback((index: number, updated: DebateAgentConfig) => {
    setAgents((prev) => prev.map((a, i) => (i === index ? updated : a)));
  }, []);

  const removeAgent = useCallback((index: number) => {
    setAgents((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addAgent = useCallback(() => {
    if (agents.length >= 4) return;
    const nextPlatform =
      availablePlatforms.find((p) => !agents.some((a) => a.platform === p)) ?? defaultPlatform;
    setAgents((prev) => [...prev, makeDefaultAgent(prev.length, nextPlatform)]);
  }, [agents, availablePlatforms, defaultPlatform]);

  // Start debate
  const handleStart = useCallback(async () => {
    if (!topic.trim() || agents.length < 2 || !workingDir.trim()) return;
    setStarting(true);

    try {
      const res = await api.channels.startCLIDebate({
        topic: topic.trim(),
        format,
        agents: agents.map((a) => ({
          id: a.id,
          role: a.role,
          label: a.label,
          emoji: a.emoji,
          platform: a.platform,
          model: a.model,
        })),
        workingDir: workingDir.trim(),
        maxRounds,
      });

      toast.success("Debate started!");
      onCreated?.(res.data.channelId);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start debate");
    } finally {
      setStarting(false);
    }
  }, [topic, format, agents, workingDir, maxRounds, onCreated, onClose]);

  if (!shouldRender) return null;

  const canStart = topic.trim().length > 0 && agents.length >= 2 && workingDir.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: Z.topModal,
        background: "var(--overlay-heavy)",
        backdropFilter: "blur(var(--glass-blur-sm))",
        opacity: animationState === "entering" || animationState === "entered" ? 1 : 0,
        transition: "opacity 250ms ease",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Start Debate"
    >
      <div
        className="shadow-float bg-bg-base flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        style={{
          boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-5 py-3"
          style={{ boxShadow: "0 1px 0 var(--color-border)" }}
        >
          <h2 className="text-text-primary text-sm font-bold">Start CLI Debate</h2>
          <button
            onClick={onClose}
            className="text-text-muted cursor-pointer rounded-lg p-1.5 transition-all"
            aria-label="Close dialog"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Topic */}
          <div className="flex flex-col gap-1">
            <label className="text-text-secondary text-xs font-semibold">Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. How should we implement auth in this app?"
              className="input-bordered text-text-primary bg-bg-card rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          {/* Format + Working Dir row */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-text-secondary text-xs font-semibold">Format</label>
              <div className="relative">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as DebateFormat)}
                  className="input-bordered text-text-primary bg-bg-card w-full cursor-pointer appearance-none rounded-lg px-3 py-2 text-sm"
                >
                  {FORMAT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <CaretDown
                  size={12}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-text-secondary text-xs font-semibold">Working Directory</label>
              <div className="flex items-center gap-1">
                <FolderSimple size={14} className="text-text-muted shrink-0" aria-hidden="true" />
                <input
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="/home/user/project"
                  className="input-bordered text-text-primary bg-bg-card flex-1 rounded-lg px-2 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Format description */}
          <p className="text-text-muted text-xs" style={{ marginTop: -8 }}>
            {FORMAT_OPTIONS.find((f) => f.value === format)?.desc}
          </p>

          {/* Agents */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-text-secondary text-xs font-semibold">
                Agents ({agents.length}/4)
              </label>
              {agents.length < 4 && (
                <button
                  onClick={addAgent}
                  className="text-text-secondary bg-bg-elevated flex cursor-pointer items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-all"
                >
                  <Plus size={11} weight="bold" aria-hidden="true" />
                  Add
                </button>
              )}
            </div>

            {platformsLoading ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <CircleNotch size={16} className="text-text-muted animate-spin" />
                <span className="text-text-muted text-xs">Detecting CLI platforms...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {agents.map((agent, i) => (
                  <DebateAgentCard
                    key={agent.id}
                    agent={agent}
                    index={i}
                    availablePlatforms={availablePlatforms}
                    canRemove={agents.length > 2}
                    onChange={(updated) => updateAgent(i, updated)}
                    onRemove={() => removeAgent(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Max rounds */}
          <div className="flex items-center gap-3">
            <label className="text-text-secondary text-xs font-semibold">Max Rounds</label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxRounds}
              onChange={(e) => setMaxRounds(Math.max(1, Math.min(10, Number(e.target.value))))}
              className="input-bordered text-text-primary bg-bg-card w-16 rounded-lg px-2 py-1 text-center text-xs"
            />
            <span className="text-text-muted text-xs">
              (CLI debates are slower — 3 recommended)
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex flex-shrink-0 items-center justify-end gap-3 px-5 py-3"
          style={{ boxShadow: "0 -1px 0 var(--color-border)" }}
        >
          <button
            onClick={onClose}
            className="text-text-secondary bg-bg-elevated cursor-pointer rounded-lg px-4 py-2 text-xs font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleStart()}
            disabled={!canStart || starting}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold transition-all disabled:opacity-40"
            style={{
              background:
                canStart && !starting ? "var(--color-accent)" : "var(--color-bg-elevated)",
              color: canStart && !starting ? "#fff" : "var(--color-text-muted)",
            }}
          >
            {starting ? (
              <>
                <CircleNotch size={14} className="animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Rocket size={14} weight="fill" />
                Start Debate
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
