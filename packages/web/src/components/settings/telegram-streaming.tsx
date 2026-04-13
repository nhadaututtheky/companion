"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowsClockwise,
  ChatCircle,
  Wrench,
  LockKey,
  CurrencyDollar,
  FloppyDisk,
  Check,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface BotOption {
  id: string;
  label: string;
}

interface TelegramStreamingProps {
  botId: string;
  botLabel: string;
  bots: BotOption[];
}

type StreamEvent = "messages" | "tool_use" | "permissions" | "costs";

const EVENT_OPTIONS: Array<{ key: StreamEvent; label: string; icon: React.ReactNode }> = [
  { key: "messages", label: "Messages", icon: <ChatCircle size={14} weight="fill" /> },
  { key: "tool_use", label: "Tool Use", icon: <Wrench size={14} weight="fill" /> },
  { key: "permissions", label: "Permission Requests", icon: <LockKey size={14} weight="fill" /> },
  { key: "costs", label: "Cost Updates", icon: <CurrencyDollar size={14} weight="fill" /> },
];

function settingKey(botId: string, field: string): string {
  return `telegram.${botId}.streaming.${field}`;
}

export function TelegramStreaming({ botId, botLabel, bots: _bots }: TelegramStreamingProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [targetChatId, setTargetChatId] = useState("");
  const [targetTopicId, setTargetTopicId] = useState("");
  const [messageFormat, setMessageFormat] = useState<"compact" | "full" | "code_only">("compact");
  const [permForwarding, setPermForwarding] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [events, setEvents] = useState<Set<StreamEvent>>(new Set(["messages", "permissions"]));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load settings from server
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.settings.list(`telegram.${botId}.streaming.`);
      const s = res.data;

      setStreamEnabled(s[settingKey(botId, "enabled")] === "true");
      setTargetChatId(s[settingKey(botId, "chatId")] ?? "");
      setTargetTopicId(s[settingKey(botId, "topicId")] ?? "");
      setMessageFormat(
        (s[settingKey(botId, "format")] as "compact" | "full" | "code_only") ?? "compact",
      );
      setPermForwarding(s[settingKey(botId, "permForwarding")] === "true");
      setAutoApprove(s[settingKey(botId, "autoApprove")] === "true");

      const rawEvents = s[settingKey(botId, "events")];
      if (rawEvents) {
        setEvents(new Set(rawEvents.split(",") as StreamEvent[]));
      }
    } catch {
      // No settings yet — defaults are fine
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        api.settings.set(settingKey(botId, "enabled"), String(streamEnabled)),
        api.settings.set(settingKey(botId, "chatId"), targetChatId),
        api.settings.set(settingKey(botId, "topicId"), targetTopicId),
        api.settings.set(settingKey(botId, "format"), messageFormat),
        api.settings.set(settingKey(botId, "permForwarding"), String(permForwarding)),
        api.settings.set(settingKey(botId, "autoApprove"), String(autoApprove)),
        api.settings.set(settingKey(botId, "events"), [...events].join(",")),
      ]);

      setSaved(true);
      toast.success("Streaming settings saved");
      setTimeout(() => {
        setSaved(false);
        setCollapsed(true);
      }, 1500);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleEvent(event: StreamEvent) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
        <span className="text-xs">Loading streaming config...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="shadow-soft bg-bg-elevated flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{botLabel}</span>
          {streamEnabled && (
            <span
              className="rounded-full px-1.5 py-0.5 text-xs font-medium"
              style={{ background: "#34A85320", color: "#34A853" }}
            >
              Active
            </span>
          )}
        </span>
        <span className="px-2 text-sm font-medium">{collapsed ? "Configure ▸" : "▾ Close"}</span>
      </button>

      {collapsed ? null : (
        <>
          {/* Enable streaming toggle */}
          <ToggleRow
            label="Stream session output"
            description="Forward Claude session events to Telegram in real-time"
            checked={streamEnabled}
            onChange={setStreamEnabled}
          />

          {streamEnabled && (
            <>
              {/* Target Chat ID */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Target Chat ID</label>
                <input
                  type="text"
                  value={targetChatId}
                  onChange={(e) => setTargetChatId(e.target.value)}
                  placeholder="-100123456789"
                  className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>

              {/* Target Topic/Thread ID */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">
                  Topic / Thread ID <span>(optional, for forum groups)</span>
                </label>
                <input
                  type="text"
                  value={targetTopicId}
                  onChange={(e) => setTargetTopicId(e.target.value)}
                  placeholder="12345"
                  className="input-bordered text-text-primary bg-bg-elevated rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>

              {/* Message format */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Message Format</label>
                <select
                  value={messageFormat}
                  onChange={(e) =>
                    setMessageFormat(e.target.value as "compact" | "full" | "code_only")
                  }
                  className="input-bordered text-text-primary bg-bg-elevated cursor-pointer rounded-lg px-3 py-2 text-sm"
                >
                  <option value="compact">Compact — brief summaries</option>
                  <option value="full">Full — complete message content</option>
                  <option value="code_only">Code Only — tool calls and code blocks</option>
                </select>
              </div>

              {/* Events to stream */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium">Events to Stream</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_OPTIONS.map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => toggleEvent(key)}
                      className="border-border flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background: events.has(key)
                          ? "var(--color-accent)"
                          : "var(--color-bg-elevated)",
                        color: events.has(key) ? "#fff" : "var(--color-text-secondary)",
                      }}
                      aria-pressed={events.has(key)}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permission forwarding */}
              <ToggleRow
                label="Forward permission requests"
                description="Send Claude tool permission requests to Telegram for review"
                checked={permForwarding}
                onChange={setPermForwarding}
              />

              {/* Auto-approve */}
              <ToggleRow
                label="Auto-approve from Telegram"
                description="Allow Telegram replies to approve permission requests"
                checked={autoApprove}
                onChange={setAutoApprove}
              />
            </>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors"
            style={{
              background: saved ? "var(--color-success)" : "var(--color-accent)",
              color: "#fff",
              border: "none",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saved ? (
              <>
                <Check size={12} weight="bold" aria-hidden="true" />
                Saved
              </>
            ) : (
              <>
                <FloppyDisk size={12} weight="bold" aria-hidden="true" />
                Save Streaming Config
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs">{description}</span>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors"
        style={{
          background: checked ? "var(--color-accent)" : "var(--color-border)",
          border: "none",
          padding: 0,
        }}
      >
        <span
          className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
