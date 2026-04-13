"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Z } from "@/lib/z-index";
import {
  ArrowsOut,
  Minus,
  X,
  LinkSimple,
  CaretDown,
  Check,
  Bell,
  BellSlash,
  BellRinging,
  Plus,
  TelegramLogo,
} from "@phosphor-icons/react";
import { useSessionStore } from "@/lib/stores/session-store";
import { SessionSettingsButton } from "./session-settings";
import { CostBreakdown } from "@/components/session/cost-breakdown";
import { PulseIndicator } from "@/components/pulse/pulse-indicator";
import { api } from "@/lib/api-client";

const PLATFORM_ICONS: Record<string, { icon: string; color: string }> = {
  claude: { icon: "◈", color: "#D97706" },
  codex: { icon: "◇", color: "#10B981" },
  gemini: { icon: "◆", color: "#4285F4" },
  opencode: { icon: "☁", color: "#8B5CF6" },
};

interface SessionHeaderProps {
  sessionId: string;
  shortId?: string;
  name?: string;
  projectName: string;
  model: string;
  status: string;
  cliPlatform?: string;
  source?: string;
  onExpand: () => void;
  onClose: () => void;
  onMinimize?: () => void;
  onSpawnClick?: () => void;
  onRename?: (name: string | null) => void;
  onSetModel?: (model: string) => void;
  channelId?: string | null;
  channelTopic?: string | null;
  channelStatus?: string | null;
  contextPercent?: number;
  totalTokens?: number;
  maxTokens?: number;
  totalCostUsd?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  sessionColor?: string;
}

const STATUS_COLORS: Record<string, string> = {
  starting: "var(--color-warning)",
  idle: "var(--color-success)",
  running: "var(--color-accent)",
  busy: "var(--color-accent)",
  waiting: "var(--color-warning)",
  ended: "var(--color-text-muted)",
  error: "var(--color-danger)",
};

export function SessionHeader({
  sessionId,
  shortId,
  name,
  projectName,
  model,
  status,
  onExpand,
  onClose,
  onMinimize,
  onSpawnClick,
  onRename,
  onSetModel,
  source,
  channelId,
  channelTopic,
  channelStatus,
  contextPercent,
  totalTokens,
  maxTokens,
  totalCostUsd,
  totalInputTokens,
  totalOutputTokens,
  cacheCreationTokens,
  cacheReadTokens,
  cliPlatform,
  sessionColor,
}: SessionHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const displayName = name || projectName;

  const startEditing = useCallback(() => {
    setEditValue(name || "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [name]);

  const commitRename = useCallback(async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    const newName = trimmed || null;
    try {
      await api.sessions.rename(sessionId, newName);
      onRename?.(newName);
    } catch {
      // silently fail — UI will revert on next state sync
    }
  }, [editValue, sessionId, onRename]);

  // Close model dropdown on click outside
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelDropdownOpen]);

  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  // Strip provider prefix for OpenCode format (e.g., "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  const modelShort = modelName.includes("opus")
    ? "Opus"
    : modelName.includes("haiku")
      ? "Haiku"
      : modelName.includes("sonnet")
        ? "Sonnet"
        : modelName.includes("gpt")
          ? modelName.split("-").slice(0, 2).join("-").toUpperCase()
          : modelName.includes("gemini")
            ? "Gemini"
            : modelName.includes("llama")
              ? "Llama"
              : modelName.startsWith("o3") || modelName.startsWith("o4")
                ? modelName.split("-")[0]!.toUpperCase()
                : modelName.split("-")[0]!;
  const channelColor =
    channelStatus === "active" ? "var(--color-accent)" : "var(--color-text-muted)";
  const isActive = !["ended", "error"].includes(status);
  const isThinking = ["running", "busy"].includes(status);

  const contextBarColor =
    contextPercent === undefined
      ? undefined
      : contextPercent >= 80
        ? "var(--color-danger)"
        : contextPercent >= 60
          ? "var(--color-warning)"
          : "var(--color-success)";

  const contextTooltip =
    contextPercent !== undefined && totalTokens !== undefined && maxTokens !== undefined
      ? `Context: ${Math.round(contextPercent)}% used (${(totalTokens / 1000).toFixed(0)}K / ${(maxTokens / 1000).toFixed(0)}K tokens)`
      : undefined;

  return (
    <>
      {/* Top accent bar — session identity */}
      {sessionColor && (
        <div
          style={{
            height: 2,
            background: `linear-gradient(90deg, ${sessionColor}, transparent)`,
            flexShrink: 0,
            borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
          }}
        />
      )}
      <div
        className="flex flex-shrink-0 items-center gap-2 px-3 py-2"
        style={{
          borderBottom: contextPercent === undefined ? "1px solid var(--glass-border)" : "none",
          background: sessionColor
            ? `color-mix(in srgb, ${sessionColor} 4%, transparent)`
            : undefined,
        }}
      >
        {/* Left: status dot + project name */}
        <span
          className="inline-block shrink-0 rounded-full"
          style={{
            width: 7,
            height: 7,
            background: dotColor,
          }}
        />
        {shortId && (
          <span
            className="text-success flex-shrink-0 rounded-full px-1.5 py-0.5 font-mono text-xs"
            style={{ background: "var(--color-bg-elevated)" }}
            title={`@${shortId} — mention this session in other chats`}
          >
            @{shortId}
          </span>
        )}
        {editing ? (
          <input
            ref={inputRef}
            className="text-text-primary flex-1 border-b bg-transparent text-sm font-semibold outline-none"
            style={{
              borderColor: "var(--color-border)",
              minWidth: 0,
            }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={100}
            placeholder={projectName}
            aria-label="Session name"
          />
        ) : (
          <span
            className="flex flex-1 cursor-pointer items-center gap-1.5 truncate text-sm font-semibold"
            title={`${displayName} — double-click to rename`}
            onDoubleClick={startEditing}
          >
            {displayName}
            {source === "telegram" && (
              <TelegramLogo
                size={13}
                weight="fill"
                className="shrink-0"
                style={{ color: "#2AABEE" }}
                aria-label="Telegram session"
              />
            )}
            {isThinking && (
              <span
                className="text-accent flex-shrink-0 text-xs font-normal"
                style={{
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              >
                typing…
              </span>
            )}
          </span>
        )}

        {/* Center: model badge — clickable dropdown */}
        <div ref={modelDropdownRef} className="relative flex-shrink-0">
          <button
            onClick={() => isActive && onSetModel && setModelDropdownOpen(!modelDropdownOpen)}
            className="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium transition-colors"
            style={{
              background: modelDropdownOpen ? "var(--color-accent)" : "var(--color-bg-elevated)",
              color: modelDropdownOpen ? "#fff" : "var(--color-text-muted)",
              border: modelDropdownOpen ? "1px solid var(--color-accent)" : "1px solid transparent",
            }}
            title={isActive && onSetModel ? "Click to switch model" : modelName}
            aria-label="Switch model"
            aria-expanded={modelDropdownOpen}
          >
            {cliPlatform && cliPlatform !== "claude" && (
              <span
                style={{
                  color: modelDropdownOpen
                    ? "#fff"
                    : (PLATFORM_ICONS[cliPlatform]?.color ?? "var(--color-text-muted)"),
                }}
              >
                {PLATFORM_ICONS[cliPlatform]?.icon ?? ""}{" "}
              </span>
            )}
            {modelShort}
            {isActive && onSetModel && <CaretDown size={10} weight="bold" />}
          </button>

          {/* Model dropdown */}
          {modelDropdownOpen && (
            <div
              className="rounded-radius-lg shadow-float border-glass-border absolute border"
              style={{
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: Z.popover,
                background: "var(--glass-bg-heavy)",
                backdropFilter: "blur(var(--glass-blur))",
                WebkitBackdropFilter: "blur(var(--glass-blur))",
                boxShadow: "var(--shadow-float)",
                minWidth: 180,
                padding: "4px",
                animation: "slideUpFade 150ms ease forwards",
              }}
            >
              {[
                { id: "claude-opus-4-6", label: "Opus 4.6", emoji: "🧠", desc: "Deep reasoning" },
                {
                  id: "claude-sonnet-4-6",
                  label: "Sonnet 4.6",
                  emoji: "🎯",
                  desc: "Fast & capable",
                },
                { id: "claude-haiku-4-5", label: "Haiku 4.5", emoji: "⚡", desc: "Quick tasks" },
              ].map((opt) => {
                const isCurrent = modelName.includes(opt.id.replace("claude-", "").split("-")[0]!);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSetModel?.(opt.id);
                      setModelDropdownOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors"
                    style={{
                      background: isCurrent
                        ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                        : "transparent",
                      color: isCurrent ? "var(--color-accent)" : "var(--color-text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = "var(--color-bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isCurrent) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span>{opt.emoji}</span>
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-text-muted">{opt.desc}</span>
                    {isCurrent && <Check size={12} weight="bold" className="text-accent ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact cost display */}
        {totalCostUsd !== undefined && (
          <CostBreakdown
            session={{
              totalCostUsd,
              totalInputTokens,
              totalOutputTokens,
              cacheCreationTokens,
              cacheReadTokens,
            }}
            compact
          />
        )}

        {/* Pulse indicator — agent operational health */}
        {isActive && <PulseIndicator sessionId={sessionId} />}

        {/* Channel badge */}
        {channelId && (
          <span
            className="flex-shrink-0 rounded p-0.5"
            style={{ color: channelColor }}
            title={channelTopic ? `Linked to: ${channelTopic}` : "Linked to a shared channel"}
            aria-label={
              channelTopic ? `Linked to channel: ${channelTopic}` : "Linked to shared channel"
            }
          >
            <LinkSimple size={12} weight="bold" aria-hidden="true" />
          </span>
        )}

        {/* Notification mode toggle */}
        {isActive && <NotifyModeButton sessionId={sessionId} />}

        {/* Settings gear — only for active sessions */}
        {isActive && <SessionSettingsButton sessionId={sessionId} />}

        {/* Spawn agent */}
        {isActive && onSpawnClick && (
          <button
            onClick={onSpawnClick}
            className="text-text-muted flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
            }}
            aria-label="Spawn agent"
            title="Spawn new agent"
          >
            <Plus size={14} weight="bold" />
          </button>
        )}

        {/* Right: minimize + expand + close */}
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors"
            aria-label="Minimize session"
            title="Hide from grid (session keeps running)"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-warning)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
            }}
          >
            <Minus size={14} weight="bold" />
          </button>
        )}
        <button
          onClick={onExpand}
          className="flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors"
          aria-label="Expand session"
          title="Expand to full view"
        >
          <ArrowsOut size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors"
          aria-label="Close session"
          title="Stop & close session"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-danger)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          }}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Context meter — thin progress bar */}
      {contextPercent !== undefined && contextBarColor && (
        <div
          className="shrink-0"
          style={{
            height: 2,
            background: "var(--glass-border)",
          }}
          title={contextTooltip}
          aria-label={contextTooltip}
          role="progressbar"
          aria-valuenow={Math.round(contextPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              height: "100%",
              width: `${contextPercent}%`,
              background: contextBarColor,
              transition: "width 500ms ease, background 500ms ease",
            }}
          />
        </div>
      )}

      {/* Compact warning banner */}
      {contextPercent !== undefined && contextPercent >= 80 && (
        <div
          className="text-danger flex flex-shrink-0 items-center justify-center px-3 py-0.5 text-xs font-medium"
          style={{
            background: "color-mix(in srgb, var(--color-danger) 6%, transparent)",
            borderBottom: "1px solid var(--glass-border)",
            fontSize: 10,
          }}
          role="alert"
        >
          Context {Math.round(contextPercent)}% full — consider /compact
        </div>
      )}
    </>
  );
}

// ── Notification Mode Toggle ────────────────────────────────────────────────

const NOTIFY_LABELS = {
  visual: "Visual (card flash)",
  toast: "Toast notifications",
  off: "Notifications off",
} as const;

function NotifyModeButton({ sessionId }: { sessionId: string }) {
  const mode = useSessionStore((s) => s.sessions[sessionId]?.notifyMode ?? "visual");
  const cycleNotifyMode = useSessionStore((s) => s.cycleNotifyMode);

  const Icon = mode === "off" ? BellSlash : mode === "toast" ? BellRinging : Bell;
  const color =
    mode === "off"
      ? "var(--color-text-muted)"
      : mode === "toast"
        ? "var(--color-warning)"
        : "var(--color-text-secondary)";

  return (
    <button
      onClick={() => cycleNotifyMode(sessionId)}
      className="flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors"
      style={{ color }}
      aria-label={NOTIFY_LABELS[mode]}
      title={NOTIFY_LABELS[mode]}
    >
      <Icon size={12} weight={mode === "visual" ? "regular" : "bold"} />
    </button>
  );
}
