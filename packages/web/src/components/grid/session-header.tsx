"use client";
import { useState, useRef, useCallback } from "react";
import { ArrowsOut, X, LinkSimple } from "@phosphor-icons/react";
import { SessionSettingsButton } from "./session-settings";
import { CostBreakdown } from "@/components/session/cost-breakdown";
import { api } from "@/lib/api-client";

interface SessionHeaderProps {
  sessionId: string;
  shortId?: string;
  name?: string;
  projectName: string;
  model: string;
  status: string;
  onExpand: () => void;
  onClose: () => void;
  onRename?: (name: string | null) => void;
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
}

const STATUS_COLORS: Record<string, string> = {
  starting: "#FBBC04",
  idle: "#34A853",
  running: "#4285F4",
  busy: "#4285F4",
  waiting: "#FBBC04",
  ended: "#9AA0A6",
  error: "#EA4335",
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
  onRename,
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
}: SessionHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  const dotColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const modelShort = model.includes("opus") ? "Opus" : model.includes("haiku") ? "Haiku" : "Sonnet";
  const channelColor = channelStatus === "active" ? "#4285F4" : "#9AA0A6";
  const isActive = !["ended", "error"].includes(status);

  const contextBarColor =
    contextPercent === undefined
      ? undefined
      : contextPercent >= 80
        ? "#EA4335"
        : contextPercent >= 60
          ? "#FBBC04"
          : "#34A853";

  const contextTooltip =
    contextPercent !== undefined && totalTokens !== undefined && maxTokens !== undefined
      ? `Context: ${Math.round(contextPercent)}% used (${(totalTokens / 1000).toFixed(0)}K / ${(maxTokens / 1000).toFixed(0)}K tokens)`
      : undefined;

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{
          borderBottom: contextPercent === undefined ? "1px solid var(--color-border)" : "none",
        }}
      >
        {/* Left: status dot + project name */}
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        {shortId && (
          <span
            className="text-xs font-mono px-1 py-0.5 rounded flex-shrink-0"
            style={{ background: "var(--color-bg-elevated)", color: "#34A853" }}
            title={`@${shortId} — mention this session in other chats`}
          >
            @{shortId}
          </span>
        )}
        {editing ? (
          <input
            ref={inputRef}
            className="text-sm font-semibold flex-1 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-accent border-b"
            style={{
              color: "var(--color-text-primary)",
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
            className="text-sm font-semibold truncate flex-1 cursor-pointer"
           
            title={`${displayName} — double-click to rename`}
            onDoubleClick={startEditing}
          >
            {displayName}
          </span>
        )}

        {/* Center: model badge */}
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {modelShort}
        </span>

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

        {/* Channel badge */}
        {channelId && (
          <span
            className="flex-shrink-0 p-0.5 rounded"
            style={{ color: channelColor }}
            title={channelTopic ? `Linked to: ${channelTopic}` : "Linked to a shared channel"}
            aria-label={
              channelTopic ? `Linked to channel: ${channelTopic}` : "Linked to shared channel"
            }
          >
            <LinkSimple size={12} weight="bold" aria-hidden="true" />
          </span>
        )}

        {/* Settings gear — only for active sessions */}
        {isActive && <SessionSettingsButton sessionId={sessionId} />}

        {/* Right: expand + close */}
        <button
          onClick={onExpand}
          className="flex-shrink-0 p-1 rounded-md transition-colors cursor-pointer"
         
          aria-label="Expand session"
          title="Expand to full view"
        >
          <ArrowsOut size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-md transition-colors cursor-pointer"
         
          aria-label="Close session"
          title="Stop & close session"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#EA4335";
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
          style={{
            height: 2,
            background: "var(--color-border)",
            flexShrink: 0,
            borderBottom: "1px solid var(--color-border)",
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
          className="flex items-center justify-center px-3 py-0.5 flex-shrink-0 text-xs font-medium"
          style={{
            background: "#EA433510",
            color: "#EA4335",
            borderBottom: "1px solid var(--color-border)",
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
