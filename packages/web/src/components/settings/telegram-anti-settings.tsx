"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowsClockwise,
  FloppyDisk,
  Check,
  Plugs,
  Crosshair,
  Timer,
  ChatCircleText,
  ListChecks,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface TelegramAntiSettingsProps {
  botId: string;
}

function antiKey(field: string): string {
  return `anti.${field}`;
}

export function TelegramAntiSettings({ botId }: TelegramAntiSettingsProps) {
  // CDP connection
  const [cdpHost, setCdpHost] = useState("127.0.0.1");
  const [cdpBasePort, setCdpBasePort] = useState("9000");
  const [cdpPortRange, setCdpPortRange] = useState("3");

  // Watchers
  const [chatWatcherEnabled, setChatWatcherEnabled] = useState(true);
  const [chatPollInterval, setChatPollInterval] = useState("1500");
  const [taskWatcherEnabled, setTaskWatcherEnabled] = useState(false);
  const [taskPollInterval, setTaskPollInterval] = useState("15000");

  // Auto-approve
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [autoApproveDelay, setAutoApproveDelay] = useState("5000");

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [cdpStatus, setCdpStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.settings.list("anti.");
      const s = res.data;

      setCdpHost(s[antiKey("cdpHost")] ?? "127.0.0.1");
      setCdpBasePort(s[antiKey("cdpBasePort")] ?? "9000");
      setCdpPortRange(s[antiKey("cdpPortRange")] ?? "3");
      setChatWatcherEnabled(s[antiKey("chatWatcher")] !== "false");
      setChatPollInterval(s[antiKey("chatPollInterval")] ?? "1500");
      setTaskWatcherEnabled(s[antiKey("taskWatcher")] === "true");
      setTaskPollInterval(s[antiKey("taskPollInterval")] ?? "15000");
      setAutoApproveEnabled(s[antiKey("autoApprove")] === "true");
      setAutoApproveDelay(s[antiKey("autoApproveDelay")] ?? "5000");
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      const settings: Record<string, string> = {
        [antiKey("cdpHost")]: cdpHost,
        [antiKey("cdpBasePort")]: cdpBasePort,
        [antiKey("cdpPortRange")]: cdpPortRange,
        [antiKey("chatWatcher")]: String(chatWatcherEnabled),
        [antiKey("chatPollInterval")]: chatPollInterval,
        [antiKey("taskWatcher")]: String(taskWatcherEnabled),
        [antiKey("taskPollInterval")]: taskPollInterval,
        [antiKey("autoApprove")]: String(autoApproveEnabled),
        [antiKey("autoApproveDelay")]: autoApproveDelay,
        [antiKey("botId")]: botId,
      };

      await Promise.all(
        Object.entries(settings).map(([key, value]) => api.settings.set(key, value)),
      );

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success("Anti settings saved");
    } catch (err) {
      toast.error(`Failed to save: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestCdp() {
    setTesting(true);
    setCdpStatus("unknown");
    try {
      const res = await api.get<{ available: boolean }>("/api/anti/status");
      setCdpStatus(res.available ? "connected" : "disconnected");
      toast[res.available ? "success" : "error"](
        res.available ? "CDP connected" : "CDP not available — is the IDE running with remote debugging?",
      );
    } catch {
      setCdpStatus("disconnected");
      toast.error("Failed to reach CDP");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3" style={{ color: "var(--color-text-muted)" }}>
        <ArrowsClockwise size={14} className="animate-spin" aria-hidden="true" />
        <span className="text-xs">Loading anti settings...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* CDP Connection */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Plugs size={14} weight="bold" style={{ color: "var(--color-accent)" }} aria-hidden="true" />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            CDP Connection
          </span>
          <StatusDot status={cdpStatus} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
          <FieldInput label="Host" value={cdpHost} onChange={setCdpHost} placeholder="127.0.0.1" />
          <FieldInput label="Base Port" value={cdpBasePort} onChange={setCdpBasePort} placeholder="9000" />
          <FieldInput label="Range" value={cdpPortRange} onChange={setCdpPortRange} placeholder="3" />
        </div>

        <button
          onClick={handleTestCdp}
          disabled={testing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors w-fit"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            opacity: testing ? 0.7 : 1,
          }}
        >
          {testing ? (
            <ArrowsClockwise size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair size={12} weight="bold" aria-hidden="true" />
          )}
          Test Connection
        </button>
      </div>

      <Divider />

      {/* Chat Watcher */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ChatCircleText size={14} weight="bold" style={{ color: "var(--color-accent)" }} aria-hidden="true" />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Chat Watcher
          </span>
        </div>
        <ToggleRow
          label="Auto-start chat watcher when Anti mode activates"
          checked={chatWatcherEnabled}
          onChange={setChatWatcherEnabled}
        />
        <FieldInput
          label="Poll interval (ms)"
          value={chatPollInterval}
          onChange={setChatPollInterval}
          placeholder="1500"
        />
      </div>

      <Divider />

      {/* Task Watcher */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={14} weight="bold" style={{ color: "var(--color-accent)" }} aria-hidden="true" />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Task Watcher
          </span>
        </div>
        <ToggleRow
          label="Enable task watcher (poll IDE task list)"
          checked={taskWatcherEnabled}
          onChange={setTaskWatcherEnabled}
        />
        <FieldInput
          label="Poll interval (ms)"
          value={taskPollInterval}
          onChange={setTaskPollInterval}
          placeholder="15000"
        />
      </div>

      <Divider />

      {/* Auto-approve */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Timer size={14} weight="bold" style={{ color: "var(--color-accent)" }} aria-hidden="true" />
          <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Auto-approve
          </span>
        </div>
        <ToggleRow
          label="Auto-approve permission requests after delay"
          checked={autoApproveEnabled}
          onChange={setAutoApproveEnabled}
        />
        {autoApproveEnabled && (
          <FieldInput
            label="Delay before auto-approve (ms)"
            value={autoApproveDelay}
            onChange={setAutoApproveDelay}
            placeholder="5000"
          />
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
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
        ) : saving ? (
          <>
            <ArrowsClockwise size={12} className="animate-spin" aria-hidden="true" />
            Saving...
          </>
        ) : (
          <>
            <FloppyDisk size={12} weight="bold" aria-hidden="true" />
            Save Anti Settings
          </>
        )}
      </button>
    </div>
  );
}

// ── Small shared components ──────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-1.5 rounded-lg text-xs outline-none font-mono"
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="cursor-pointer"
        style={{ accentColor: "var(--color-accent)" }}
      />
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        {label}
      </span>
    </label>
  );
}

function StatusDot({ status }: { status: "unknown" | "connected" | "disconnected" }) {
  const colors = {
    unknown: "var(--color-text-muted)",
    connected: "var(--color-success)",
    disconnected: "var(--color-danger)",
  };
  if (status === "unknown") return null;
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{ background: colors[status] }}
      aria-label={`CDP ${status}`}
    />
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />;
}
