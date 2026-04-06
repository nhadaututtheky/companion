"use client";

import { useState } from "react";
import {
  TelegramLogo,
  Robot,
  Play,
  Stop,
  Trash,
  PencilSimple,
  Eye,
  EyeSlash,
  CheckCircle,
  XCircle,
  WarningCircle,
  FloppyDisk,
  X,
  Bell,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

type BotRole = "claude" | "codex" | "gemini" | "opencode" | "general";

interface BotConfig {
  id: string;
  label: string;
  role: BotRole;
  enabled: boolean;
  allowedChatIds: number[];
  allowedUserIds: number[];
  notificationGroupId?: number | null;
}

interface RunningBot {
  botId: string;
  label: string;
  role: string;
  running: boolean;
}

interface TelegramBotCardProps {
  config: BotConfig;
  running: RunningBot | undefined;
  onRefresh: () => void;
  onDelete: (id: string) => void;
}

const ROLE_LABELS: Record<BotRole, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  general: "General",
};

const ROLE_COLORS: Record<BotRole, string> = {
  claude: "#4285F4",
  codex: "#10b981",
  gemini: "#FBBC04",
  opencode: "#a855f7",
  general: "#34A853",
};

export function TelegramBotCard({ config, running, onRefresh, onDelete }: TelegramBotCardProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(config.label);
  const [role, setRole] = useState<BotRole>(config.role);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [chatIds, setChatIds] = useState(config.allowedChatIds.join(", "));
  const [userIds, setUserIds] = useState((config.allowedUserIds ?? []).join(", "));
  const [notificationGroupId, setNotificationGroupId] = useState(
    config.notificationGroupId ? String(config.notificationGroupId) : "",
  );
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ username?: string; error?: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRunning = running?.running === true;

  async function handleSave() {
    setSaving(true);
    try {
      const parsedChatIds = chatIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const parsedUserIds = userIds
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const parsedNotificationGroupId = notificationGroupId.trim()
        ? parseInt(notificationGroupId.trim(), 10)
        : null;

      await api.telegram.saveBot(config.id, {
        id: config.id,
        label,
        role,
        botToken: botToken || "KEEP_EXISTING",
        allowedChatIds: parsedChatIds,
        allowedUserIds: parsedUserIds,
        enabled: config.enabled,
        notificationGroupId:
          parsedNotificationGroupId && !isNaN(parsedNotificationGroupId)
            ? parsedNotificationGroupId
            : null,
      });

      toast.success("Bot updated");
      setEditing(false);
      setBotToken("");
      onRefresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      if (isRunning) {
        await api.telegram.stopBot(config.id);
        toast.success(`Bot "${config.label}" stopped`);
      } else {
        await api.telegram.startBot(config.id);
        toast.success(`Bot "${config.label}" started`);
      }
      onRefresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setToggling(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.telegram.testBot(config.id);
      setTestResult({ username: res.data.username });
    } catch (err) {
      setTestResult({ error: String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await api.telegram.deleteBot(config.id);
      toast.success("Bot deleted");
      onDelete(config.id);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: isRunning ? "var(--color-success)" : "var(--color-text-muted)",
          }}
          aria-label={isRunning ? "Running" : "Stopped"}
        />

        {/* Bot icon */}
        <TelegramLogo
          size={18}
          weight="fill"
          style={{ color: "var(--color-accent)", flexShrink: 0 }}
          aria-hidden="true"
        />

        {/* Name and role */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-semibold truncate"
             
            >
              {config.label}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{
                background: `${ROLE_COLORS[config.role]}20`,
                color: ROLE_COLORS[config.role],
                border: `1px solid ${ROLE_COLORS[config.role]}40`,
              }}
            >
              <Robot size={10} weight="fill" className="inline mr-1" aria-hidden="true" />
              {ROLE_LABELS[config.role]}
            </span>
          </div>
          <p className="text-xs mt-0.5">
            {isRunning ? "Running" : "Stopped"} &middot; {config.id}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Test */}
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            aria-label="Test bot token"
          >
            Test
          </button>

          {/* Start/Stop */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: isRunning ? "var(--color-danger)" : "var(--color-success)",
            }}
            aria-label={isRunning ? "Stop bot" : "Start bot"}
          >
            {isRunning ? <Stop size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>

          {/* Edit */}
          <button
            onClick={() => {
              setEditing(!editing);
              setConfirmDelete(false);
            }}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: editing ? "var(--color-accent)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: editing ? "#fff" : "var(--color-text-secondary)",
            }}
            aria-label="Edit bot"
          >
            <PencilSimple size={14} weight="bold" />
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: confirmDelete ? "var(--color-danger)" : "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: confirmDelete ? "#fff" : "var(--color-danger)",
            }}
            aria-label={confirmDelete ? "Confirm delete" : "Delete bot"}
          >
            {confirmDelete ? (
              <XCircle size={14} weight="fill" />
            ) : (
              <Trash size={14} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{
            background: testResult.error
              ? "var(--color-danger-bg, #fef2f2)"
              : "var(--color-success-bg, #f0fdf4)",
            color: testResult.error ? "var(--color-danger)" : "var(--color-success)",
            border: `1px solid ${testResult.error ? "var(--color-danger)" : "var(--color-success)"}30`,
          }}
        >
          {testResult.error ? (
            <XCircle size={14} weight="fill" aria-hidden="true" />
          ) : (
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
          )}
          {testResult.error ? testResult.error : `Valid — @${testResult.username}`}
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <div
          className="flex flex-col gap-3 pt-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {/* Label */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm input-bordered"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as BotRole)}
              className="px-3 py-2 rounded-lg text-sm input-bordered cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            >
              <option value="claude">Claude Code — Anthropic CLI</option>
              <option value="codex">Codex CLI — OpenAI CLI</option>
              <option value="gemini">Gemini CLI — Google CLI</option>
              <option value="opencode">OpenCode — open-source CLI</option>
              <option value="general">General — general purpose</option>
            </select>
          </div>

          {/* Bot Token */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Bot Token{" "}
              <span>
                (leave blank to keep existing)
              </span>
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="New token or leave blank"
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm input-bordered"
                style={{
                  background: "var(--color-bg-elevated)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
               
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeSlash size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Allowed Chat IDs */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Allowed Chat/Group IDs{" "}
              <span>
                (comma-separated, empty = allow all)
              </span>
            </label>
            <input
              type="text"
              value={chatIds}
              onChange={(e) => setChatIds(e.target.value)}
              placeholder="-100123456789, -100987654321"
              className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            />
          </div>

          {/* Admin User IDs */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              Admin User IDs{" "}
              <span>
                (comma-separated, only these users can use bot)
              </span>
            </label>
            <input
              type="text"
              value={userIds}
              onChange={(e) => setUserIds(e.target.value)}
              placeholder="123456789, 987654321"
              className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            />
            <span className="text-xs">
              Get your ID: send /start to @userinfobot on Telegram
            </span>
          </div>

          {/* Notification Group ID */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              <Bell size={12} weight="fill" className="inline mr-1" aria-hidden="true" />
              Notification Group ID{" "}
              <span>
                (receive alerts when sessions complete or error)
              </span>
            </label>
            <input
              type="text"
              value={notificationGroupId}
              onChange={(e) => setNotificationGroupId(e.target.value)}
              placeholder="-100123456789"
              className="px-3 py-2 rounded-lg text-sm input-bordered font-mono"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-primary)",
              }}
            />
            {notificationGroupId.trim() && isNaN(parseInt(notificationGroupId.trim(), 10)) && (
              <span className="text-xs" style={{ color: "var(--color-danger)" }}>
                Must be a numeric chat/group ID (e.g. -100123456789)
              </span>
            )}
            <span className="text-xs">
              Bot will send notifications to this chat/group when sessions end, error, or time out
            </span>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              style={{
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                opacity: saving ? 0.7 : 1,
              }}
            >
              <FloppyDisk size={12} weight="bold" aria-hidden="true" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setLabel(config.label);
                setRole(config.role);
                setBotToken("");
                setChatIds(config.allowedChatIds.join(", "));
                setUserIds((config.allowedUserIds ?? []).join(", "));
                setNotificationGroupId(
                  config.notificationGroupId ? String(config.notificationGroupId) : "",
                );
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              <X size={12} weight="bold" aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Chat IDs display (when not editing) */}
      {!editing && config.allowedChatIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {config.allowedChatIds.map((id) => (
            <span
              key={id}
              className="text-xs px-2 py-0.5 rounded font-mono"
              style={{
                background: "var(--color-bg-elevated)",
                color: "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              {id}
            </span>
          ))}
        </div>
      )}

      {/* Notification badge (when not editing) */}
      {!editing && config.notificationGroupId && (
        <div
          className="flex items-center gap-1.5 text-xs"
         
        >
          <Bell size={12} weight="fill" aria-hidden="true" />
          Notifications → <span className="font-mono">{config.notificationGroupId}</span>
        </div>
      )}

      {config.allowedChatIds.length === 0 && !editing && (
        <div
          className="flex items-center gap-1.5 text-xs"
         
        >
          <WarningCircle size={12} aria-hidden="true" />
          No allowed chats — bot will reject all messages
        </div>
      )}
    </div>
  );
}
