"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowsCounterClockwise,
  Robot,
  Clock,
  DownloadSimple,
  TelegramLogo,
  Notebook,
  FolderSimple,
} from "@phosphor-icons/react";
import { CostBreakdown } from "./cost-breakdown";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ContextMeter } from "./context-meter";
import { FileTree } from "./file-tree";
import { FileViewer } from "./file-viewer";

interface SessionDetailsProps {
  session: {
    id: string;
    projectName: string;
    model: string;
    status: string;
    state: {
      total_cost_usd: number;
      num_turns: number;
      total_input_tokens: number;
      total_output_tokens: number;
      cache_creation_tokens?: number;
      cache_read_tokens: number;
      files_read: string[];
      files_modified: string[];
      files_created: string[];
      started_at: number;
      cwd?: string;
    };
  } | null;
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: `1px solid var(--color-border)`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{label}</p>
        <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function SessionDetails({ session }: SessionDetailsProps) {
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string } | null>(null);

  const handleFileSelect = useCallback((path: string, name: string) => {
    setViewingFile({ path, name });
  }, []);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Robot size={36} style={{ color: "var(--color-text-muted)" }} />
        <p className="text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
          Select a session to view details
        </p>
      </div>
    );
  }

  // If viewing a file, show the viewer full-panel
  if (viewingFile) {
    return (
      <FileViewer
        filePath={viewingFile.path}
        fileName={viewingFile.name}
        onClose={() => setViewingFile(null)}
      />
    );
  }

  const s = session.state;
  const elapsed = s.started_at ? Date.now() - s.started_at : 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Session header */}
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-muted)" }}>
          {session.projectName}
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {session.model}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{
              background:
                session.status === "running" ? "#4285F420" :
                session.status === "waiting" ? "#FBBC0420" :
                "var(--color-bg-elevated)",
              color:
                session.status === "running" ? "#4285F4" :
                session.status === "waiting" ? "#FBBC04" :
                "var(--color-text-muted)",
            }}
          >
            {session.status}
          </span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            #{session.id.slice(0, 8)}
          </span>
        </div>
      </div>

      {/* Context meter */}
      <ContextMeter
        inputTokens={s.total_input_tokens}
        outputTokens={s.total_output_tokens}
      />

      {/* Stats */}
      <div className="flex flex-col gap-2 px-4 pb-4">
        {/* Cost breakdown (expandable) */}
        <CostBreakdown
          session={{
            totalCostUsd: s.total_cost_usd,
            totalInputTokens: s.total_input_tokens,
            totalOutputTokens: s.total_output_tokens,
            cacheCreationTokens: s.cache_creation_tokens,
            cacheReadTokens: s.cache_read_tokens,
          }}
          compact={false}
        />
        <StatCard
          icon={<ArrowsCounterClockwise size={16} weight="bold" />}
          label="Turns"
          value={String(s.num_turns)}
          color="#4285F4"
        />
        <StatCard
          icon={<Clock size={16} weight="bold" />}
          label="Duration"
          value={elapsed > 0 ? formatDuration(elapsed) : "—"}
          color="#FBBC04"
        />
        <StatCard
          icon={<Robot size={16} weight="bold" />}
          label="Tokens"
          value={`${formatTokens(s.total_input_tokens + s.total_output_tokens)}`}
          color="#EA4335"
        />
      </div>

      {/* Modified files — clickable to open in viewer */}
      {(s.files_read.length > 0 || s.files_modified.length > 0 || s.files_created.length > 0) && (
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
            Files
          </p>
          <div className="flex flex-col gap-1">
            {s.files_created.map((f) => (
              <button
                key={`c-${f}`}
                className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-1 transition-colors"
                onClick={() => handleFileSelect(f, f.split("/").pop() ?? f)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="text-xs" style={{ color: "#34A853" }}>+</span>
                <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {f.split("/").pop()}
                </span>
              </button>
            ))}
            {s.files_modified.map((f) => (
              <button
                key={`m-${f}`}
                className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-1 transition-colors"
                onClick={() => handleFileSelect(f, f.split("/").pop() ?? f)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="text-xs" style={{ color: "#FBBC04" }}>~</span>
                <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {f.split("/").pop()}
                </span>
              </button>
            ))}
            {s.files_read
              .filter((f) => !s.files_modified.includes(f) && !s.files_created.includes(f))
              .map((f) => (
              <button
                key={`r-${f}`}
                className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-1 transition-colors"
                onClick={() => handleFileSelect(f, f.split("/").pop() ?? f)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="text-xs" style={{ color: "#4285F4" }}>○</span>
                <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-muted)" }}>
                  {f.split("/").pop()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project file browser */}
      {s.cwd && (
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-secondary)" }}>
            <FolderSimple size={12} weight="bold" className="inline mr-1" style={{ verticalAlign: "middle" }} />
            Project Files
          </p>
          <FileTree rootPath={s.cwd} onFileSelect={handleFileSelect} />
        </div>
      )}

      {/* Summary (for ended sessions) */}
      {session.status === "ended" && <SessionSummaryPanel sessionId={session.id} />}

      {/* Actions */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        <StreamToTelegramButton sessionId={session.id} />
        <a
          href={`${typeof window !== "undefined" ? localStorage.getItem("api_url") || "" : ""}/api/sessions/${session.id}/export`}
          download
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <DownloadSimple size={14} weight="bold" />
          Export as Markdown
        </a>
      </div>
    </div>
  );
}

function StreamToTelegramButton({ sessionId }: { sessionId: string }) {
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [streamConfig, setStreamConfig] = useState<{ chatId: number; topicId?: number } | null>(null);

  // Load stream status + saved config on mount
  useEffect(() => {
    async function load() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          api.sessions.streamTelegramStatus(sessionId),
          api.settings.list("telegram."),
        ]);

        setStreaming(statusRes.data.streaming);

        // Find first bot's streaming chatId from saved settings
        const entries = Object.entries(settingsRes.data);
        const chatIdEntry = entries.find(([k]) => k.endsWith(".streaming.chatId"));
        const topicIdEntry = entries.find(([k]) => k.endsWith(".streaming.topicId"));

        if (chatIdEntry?.[1]) {
          const chatId = parseInt(chatIdEntry[1], 10);
          const topicId = topicIdEntry?.[1] ? parseInt(topicIdEntry[1], 10) : undefined;
          if (!isNaN(chatId) && chatId !== 0) {
            setStreamConfig({ chatId, topicId: topicId && !isNaN(topicId) ? topicId : undefined });
          }
        }
      } catch {
        // Silent — streaming not available
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [sessionId]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (streaming) {
        await api.sessions.detachTelegramStream(sessionId);
        setStreaming(false);
        toast.success("Telegram stream detached");
      } else {
        if (!streamConfig) {
          toast.error("No Telegram chat configured. Go to Settings → Session Streaming.");
          return;
        }
        await api.sessions.streamTelegram(sessionId, streamConfig.chatId, streamConfig.topicId);
        setStreaming(true);
        toast.success("Streaming to Telegram");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
      >
        <TelegramLogo size={14} weight="bold" />
        Loading...
      </div>
    );
  }

  const notConfigured = !streaming && !streamConfig;

  return (
    <button
      onClick={handleToggle}
      disabled={toggling || notConfigured}
      title={notConfigured ? "Configure in Settings → Session Streaming" : undefined}
      className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: streaming ? "#0088cc15" : "var(--color-bg-elevated)",
        border: streaming ? "1px solid #0088cc40" : "1px solid var(--color-border)",
        color: streaming ? "#0088cc" : notConfigured ? "var(--color-text-muted)" : "var(--color-text-secondary)",
      }}
    >
      <TelegramLogo size={14} weight={streaming ? "fill" : "bold"} />
      {toggling
        ? "..."
        : streaming
          ? "Streaming to Telegram"
          : notConfigured
            ? "Stream not configured"
            : "Stream to Telegram"}
    </button>
  );
}

function SessionSummaryPanel({ sessionId }: { sessionId: string }) {
  const [summary, setSummary] = useState<{
    summary: string;
    keyDecisions: string[];
    filesModified: string[];
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: typeof summary }>(`/api/sessions/${sessionId}/summary`)
      .then((res) => setSummary(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading || !summary) return null;

  return (
    <div className="px-4 pb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <Notebook size={14} weight="bold" style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Summary
        </span>
        <span className="text-xs ml-auto" style={{ color: "var(--color-text-muted)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div
          className="mt-2 p-3 rounded-lg text-xs leading-relaxed"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <p>{summary.summary}</p>
          {summary.keyDecisions.length > 0 && (
            <div className="mt-2">
              <p className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Decisions</p>
              <ul className="list-disc pl-4 mt-1">
                {summary.keyDecisions.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
