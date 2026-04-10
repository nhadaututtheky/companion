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
  Camera,
  CaretDown,
  CaretRight,
  GitDiff,
  ChartBar,
} from "@phosphor-icons/react";
import { CostBreakdown } from "./cost-breakdown";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ContextMeter } from "./context-meter";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileTree } from "./file-tree";
import { FileViewer } from "./file-viewer";
import { ChangesPanel } from "./changes-panel";

type SidebarTab = "overview" | "changes";

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
      rtk_tokens_saved?: number;
      rtk_compressions?: number;
      rtk_cache_hits?: number;
    };
    contextTokens?: number;
    contextMaxTokens?: number;
  } | null;
  messages?: Array<{
    id: string;
    toolUseBlocks?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  }>;
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
        <p className="text-xs">
          {label}
        </p>
        <p
          className="text-sm font-semibold font-mono"
         
        >
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

function CompactModeControl({ sessionId }: { sessionId: string }) {
  const [mode, setMode] = useState<"manual" | "smart" | "aggressive">("manual");
  const [threshold, setThreshold] = useState(75);
  const [expanded, setExpanded] = useState(false);

  const updateConfig = useCallback(
    async (updates: { compactMode?: string; compactThreshold?: number }) => {
      try {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        await fetch(`${base}/api/sessions/${sessionId}/config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      } catch {
        toast.error("Failed to update compact settings");
      }
    },
    [sessionId],
  );

  return (
    <div className="px-4 pb-2">
      <button
        className="flex items-center gap-2 w-full text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />}
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Auto-Compact
        </span>
        <span
          className="text-xs ml-auto font-mono"
          style={{ color: mode === "manual" ? "var(--color-text-muted)" : "var(--color-accent)" }}
        >
          {mode}
        </span>
      </button>
      {expanded && (
        <div
          className="mt-2 p-3 rounded-lg flex flex-col gap-2"
          style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
        >
          <div className="flex gap-1">
            {(["manual", "smart", "aggressive"] as const).map((m) => (
              <button
                key={m}
                className="flex-1 text-xs py-1 rounded cursor-pointer transition-colors capitalize"
                style={{
                  background: mode === m ? "var(--color-accent)" : "var(--color-bg-elevated)",
                  color: mode === m ? "var(--color-bg-base)" : "var(--color-text-secondary)",
                }}
                onClick={() => {
                  setMode(m);
                  updateConfig({ compactMode: m });
                }}
              >
                {m}
              </button>
            ))}
          </div>
          {mode !== "manual" && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Threshold
              </span>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={threshold}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setThreshold(val);
                  updateConfig({ compactThreshold: val });
                }}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right" style={{ color: "var(--color-text-primary)" }}>
                {threshold}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RTKSavingsCard({
  tokensSaved,
  compressions,
  cacheHits,
}: {
  tokensSaved: number;
  compressions: number;
  cacheHits: number;
}) {
  if (tokensSaved === 0 && compressions === 0) {
    return (
      <div
        className="p-3 rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border)",
          borderLeft: "3px solid var(--color-border-strong)",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--color-text-muted)", fontSize: 14 }}>⚡</span>
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            RTK compression stats will appear here
          </span>
        </div>
      </div>
    );
  }

  // Rough cost estimate: ~$3/M input tokens (Sonnet pricing)
  const costSaved = (tokensSaved / 1_000_000) * 3;

  return (
    <div
      className="p-3 rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderLeft: "3px solid var(--color-success)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "var(--color-success)", fontSize: 14 }}>⚡</span>
        <span
          className="text-xs font-semibold"
         
        >
          RTK Savings
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs">
            Tokens
          </p>
          <p
            className="text-sm font-semibold font-mono"
            style={{ color: "var(--color-success)" }}
          >
            {formatTokens(tokensSaved)}
          </p>
        </div>
        <div>
          <p className="text-xs">
            Est. Saved
          </p>
          <p
            className="text-sm font-semibold font-mono"
            style={{ color: "var(--color-success)" }}
          >
            ${costSaved < 0.01 ? "<0.01" : costSaved.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs">
            Compressed
          </p>
          <p
            className="text-sm font-semibold font-mono"
           
          >
            {compressions}
            {cacheHits > 0 && (
              <span
                className="text-xs ml-1"
               
              >
                ({cacheHits} cached)
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SessionDetails({ session, messages }: SessionDetailsProps) {
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("overview");

  const handleFileSelect = useCallback((path: string, name: string) => {
    setViewingFile({ path, name });
  }, []);

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <Robot size={36} />
        <p className="text-sm text-center">
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
  // eslint-disable-next-line react-hooks/purity -- Date.now() for elapsed display, re-renders via parent
  const elapsed = s.started_at ? Date.now() - s.started_at : 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        {[
          {
            id: "overview" as const,
            label: "Overview",
            icon: <ChartBar size={13} weight="bold" />,
          },
          { id: "changes" as const, label: "Changes", icon: <GitDiff size={13} weight="bold" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors flex-1 justify-center"
            style={{
              color: activeTab === tab.id ? "var(--color-accent)" : "var(--color-text-muted)",
              borderBottom: activeTab === tab.id ? "2px solid var(--color-accent)" : "2px solid transparent",
              background: "transparent",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Changes tab */}
      {activeTab === "changes" && <ChangesPanel messages={messages ?? []} />}

      {/* Overview tab — existing content */}
      {activeTab === "overview" && (
        <>
          {/* Session header */}
          <div className="px-4 py-4 border-b">
            <p className="text-sm font-semibold">
              {session.projectName}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {session.model}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={session.status} />
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                #{session.id.slice(0, 8)}
              </span>
            </div>
          </div>

          {/* Context meter — use real-time CLI data when available */}
          <ContextMeter
            inputTokens={s.total_input_tokens}
            outputTokens={s.total_output_tokens}
            maxTokens={session.contextMaxTokens}
          />

          {/* Compact mode control */}
          <CompactModeControl sessionId={session.id} />

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
              color="var(--color-accent)"
            />
            <StatCard
              icon={<Clock size={16} weight="bold" />}
              label="Duration"
              value={elapsed > 0 ? formatDuration(elapsed) : "—"}
              color="var(--color-warning)"
            />
            <StatCard
              icon={<Robot size={16} weight="bold" />}
              label="Tokens"
              value={`${formatTokens(s.total_input_tokens + s.total_output_tokens)}`}
              color="var(--color-danger)"
            />
            <RTKSavingsCard
              tokensSaved={s.rtk_tokens_saved ?? 0}
              compressions={s.rtk_compressions ?? 0}
              cacheHits={s.rtk_cache_hits ?? 0}
            />
          </div>

          {/* Modified files — clickable to open in viewer */}
          {(s.files_read.length > 0 ||
            s.files_modified.length > 0 ||
            s.files_created.length > 0) && (
            <div className="px-4 pb-4">
              <p
                className="text-xs font-semibold mb-2"
               
              >
                Files
              </p>
              <div className="flex flex-col gap-1">
                {s.files_created.map((f) => (
                  <button
                    key={`c-${f}`}
                    className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-1 transition-colors"
                    onClick={() => handleFileSelect(f, f.split("/").pop() ?? f)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--color-bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-xs" style={{ color: "#34A853" }}>
                      +
                    </span>
                    <span
                      className="text-xs font-mono truncate"
                     
                    >
                      {f.split("/").pop()}
                    </span>
                  </button>
                ))}
                {s.files_modified.map((f) => (
                  <button
                    key={`m-${f}`}
                    className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-1 transition-colors"
                    onClick={() => handleFileSelect(f, f.split("/").pop() ?? f)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--color-bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                      ~
                    </span>
                    <span
                      className="text-xs font-mono truncate"
                     
                    >
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
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--color-bg-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <span className="text-xs" style={{ color: "var(--color-accent)" }}>
                        ○
                      </span>
                      <span
                        className="text-xs font-mono truncate"
                       
                      >
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
              <p
                className="text-xs font-semibold mb-2"
               
              >
                <FolderSimple
                  size={12}
                  weight="bold"
                  className="inline mr-1"
                  style={{ verticalAlign: "middle" }}
                />
                Project Files
              </p>
              <FileTree rootPath={s.cwd} onFileSelect={handleFileSelect} />
            </div>
          )}

          {/* Snapshots */}
          <SnapshotPanel
            sessionId={session.id}
            isActive={
              session.status !== "ended" &&
              session.status !== "error" &&
              session.status !== "starting"
            }
          />

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
        </>
      )}
    </div>
  );
}

function SnapshotPanel({ sessionId, isActive }: { sessionId: string; isActive: boolean }) {
  const [snapshots, setSnapshots] = useState<
    Array<{
      id: number;
      label: string | null;
      contentLength: number;
      contentPreview: string;
      createdAt: string;
    }>
  >([]);
  const [expanded, setExpanded] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingContent, setViewingContent] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await api.snapshots.list(sessionId);
      setSnapshots(res.data);
    } catch {
      // Silently fail — snapshot loading is non-critical
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const handleCapture = async () => {
    setCapturing(true);
    try {
      await api.snapshots.capture(sessionId);
      toast.success("Snapshot captured");
      await loadSnapshots();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCapturing(false);
    }
  };

  const handleView = async (snapshotId: number) => {
    try {
      const res = await api.snapshots.get(sessionId, snapshotId);
      setViewingContent(res.data.content);
    } catch {
      toast.error("Failed to load snapshot");
    }
  };

  if (viewingContent !== null) {
    return (
      <div className="px-4 pb-3">
        <button
          onClick={() => setViewingContent(null)}
          className="text-xs mb-2 cursor-pointer"
         
        >
          &larr; Back to snapshots
        </button>
        <pre
          className="text-xs font-mono whitespace-pre-wrap p-3 rounded-lg max-h-[400px] overflow-y-auto"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          {viewingContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left cursor-pointer"
        >
          <Camera size={14} weight="bold" />
          <span className="text-xs font-semibold">
            Snapshots
          </span>
          {snapshots.length > 0 && (
            <span className="text-xs">
              ({snapshots.length})
            </span>
          )}
          <span className="text-xs ml-auto">
            {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          </span>
        </button>
        {isActive && (
          <button
            onClick={handleCapture}
            disabled={capturing}
            className="text-xs px-2 py-1 rounded cursor-pointer transition-colors disabled:opacity-50"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            title="Capture terminal snapshot"
            aria-label="Capture snapshot"
          >
            {capturing ? "..." : "Capture"}
          </button>
        )}
      </div>
      {expanded && snapshots.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {snapshots.map((snap) => (
            <button
              key={snap.id}
              onClick={() => handleView(snap.id)}
              className="flex items-center gap-2 w-full text-left cursor-pointer rounded px-2 py-1.5 transition-colors"
             
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--color-bg-card)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--color-bg-elevated)";
              }}
            >
              <Camera
                size={12}
                style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-mono truncate"
                 
                >
                  {snap.label || new Date(snap.createdAt).toLocaleTimeString()}
                </p>
                <p className="text-xs truncate">
                  {snap.contentPreview.slice(0, 60)}...
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {expanded && loading && (
        <p className="mt-2 text-xs">
          Loading...
        </p>
      )}
      {expanded && !loading && snapshots.length === 0 && (
        <p className="mt-2 text-xs">
          No snapshots yet. {isActive ? "Click Capture to take one." : ""}
        </p>
      )}
    </div>
  );
}

function StreamToTelegramButton({ sessionId }: { sessionId: string }) {
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [streamConfig, setStreamConfig] = useState<{ chatId: number; topicId?: number } | null>(
    null,
  );

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
        style={{
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
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
        background: streaming ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "var(--color-bg-elevated)",
        border: streaming ? "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" : "1px solid var(--color-border)",
        color: streaming
          ? "var(--color-accent)"
          : notConfigured
            ? "var(--color-text-muted)"
            : "var(--color-text-secondary)",
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
    api
      .get<{ data: typeof summary }>(`/api/sessions/${sessionId}/summary`)
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
        <Notebook size={14} weight="bold" />
        <span className="text-xs font-semibold">
          Summary
        </span>
        <span className="text-xs ml-auto">
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
              <p className="font-semibold">
                Decisions
              </p>
              <ul className="list-disc pl-4 mt-1">
                {summary.keyDecisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
