"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Brain,
  TreeStructure,
  Globe,
  MagnifyingGlass,
  ArrowClockwise,
  CircleNotch,
  Lightning,
  File,
  CaretDown,
  CaretRight,
  CheckCircle,
  WarningCircle,
  Trash,
  Link as LinkIcon,
  Key,
  Gear,
  Plus,
  MinusCircle,
  Play,
  Package,
  Heartbeat,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";
import { useContextFeedStore } from "@/lib/stores/context-feed-store";
import dynamic from "next/dynamic";

const GraphVisualization = dynamic(
  () => import("./graph-visualization").then((m) => ({ default: m.GraphVisualization })),
  {
    ssr: false,
    loading: () => (
      <div className="text-text-muted flex h-64 items-center justify-center text-sm">
        Loading graph...
      </div>
    ),
  },
);
import type { ContextInjectionEvent } from "@/lib/stores/context-feed-store";

// ── Types ──────────────────────────────────────────────────────────────────

interface ScanJob {
  id: number;
  status: string;
  totalFiles: number;
  scannedFiles: number;
  totalNodes: number;
  totalEdges: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface HotFile {
  filePath: string;
  incomingEdges: number;
  outgoingEdges: number;
  totalTrust: number;
}

interface SearchResult {
  id: number;
  symbolName: string;
  symbolType: string;
  filePath: string;
  description: string | null;
  signature: string | null;
  isExported: boolean;
  incoming: Array<{ symbolName: string; filePath: string; edgeType: string }>;
  outgoing: Array<{ symbolName: string; filePath: string; edgeType: string }>;
}

interface WebIntelStatus {
  available: boolean;
  cache: { size: number; maxSize: number; hits: number; misses: number };
}

interface Project {
  slug: string;
  name: string;
}

interface AiContextPanelProps {
  onClose: () => void;
  projectSlug?: string;
}

// ── Source Status Card ──────────────────────────────────────────────────────

function SourceCard({
  icon: Icon,
  label,
  color,
  online,
  statusText,
  detail,
  action,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  online: boolean;
  statusText: string;
  detail?: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
}) {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{
        background: online ? color + "08" : "var(--color-bg-elevated)",
        border: `1px solid ${online ? color + "40" : "var(--color-border-strong, var(--color-border))"}`,
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon size={14} weight="bold" style={{ color }} />
        <span className="text-xs font-semibold">{label}</span>
        <div
          className="ml-auto rounded-full"
          style={{
            width: 6,
            height: 6,
            background: online ? "#34A853" : "#EA4335",
            boxShadow: online ? "0 0 4px #34A85360" : "none",
          }}
        />
      </div>
      <div className="text-xs">{statusText}</div>
      {detail && (
        <div className="text-text-secondary mt-0.5 font-mono text-xs" style={{ fontSize: 10 }}>
          {detail}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.loading}
          className="mt-1.5 cursor-pointer rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
          style={{ background: color + "20", color }}
        >
          {action.loading ? <CircleNotch size={10} className="inline animate-spin" /> : null}{" "}
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Scan Progress ────────────────────────────────────────────────────────

function ScanProgress({ job }: { job: ScanJob }) {
  const pct = job.totalFiles > 0 ? Math.round((job.scannedFiles / job.totalFiles) * 100) : 0;

  return (
    <div className="rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">
          {job.status === "scanning" && "Scanning files..."}
          {job.status === "describing" && "Generating descriptions..."}
          {job.status === "done" && "Scan complete"}
          {job.status === "error" && "Scan failed"}
        </span>
        <span className="text-xs">{pct}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: "var(--color-border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: job.status === "error" ? "#EA4335" : "#A855F7" }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span>
          {job.scannedFiles}/{job.totalFiles} files
        </span>
        <span>{job.totalNodes} symbols</span>
      </div>
      {job.errorMessage && (
        <div className="mt-2 text-xs" style={{ color: "#EA4335" }}>
          {job.errorMessage}
        </div>
      )}
    </div>
  );
}

// ── Hot Files ────────────────────────────────────────────────────────────

function HotFilesList({ files }: { files: HotFile[] }) {
  if (files.length === 0) return null;
  const maxEdges = Math.max(...files.map((f) => f.incomingEdges + f.outgoingEdges), 1);

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wider">Most coupled files</h4>
      <div className="flex flex-col gap-1">
        {files.map((f) => {
          const total = f.incomingEdges + f.outgoingEdges;
          const pct = (total / maxEdges) * 100;
          const name = f.filePath.split("/").pop() ?? f.filePath;
          const dir = f.filePath.split("/").slice(0, -1).join("/");

          return (
            <div
              key={f.filePath}
              className="relative rounded"
              style={{ border: "1px solid #A855F715" }}
            >
              <div
                className="absolute inset-0 rounded"
                style={{ width: `${pct}%`, background: "#A855F718" }}
              />
              <div className="relative flex items-center justify-between px-2 py-1.5">
                <div className="min-w-0">
                  <span className="block truncate text-xs font-medium">{name}</span>
                  <span
                    className="text-text-secondary block truncate text-xs"
                    style={{ fontSize: 10 }}
                  >
                    {dir}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <span>{f.incomingEdges} in</span>
                  <span>{f.outgoingEdges} out</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Symbol Search Results ───────────────────────────────────────────────

function SymbolResults({ results }: { results: SearchResult[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (results.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {results.map((r) => (
        <div
          key={r.id}
          className="bg-bg-elevated overflow-hidden rounded-lg"
          style={{
            border: "1px solid var(--color-border-strong, var(--color-border))",
          }}
        >
          <button
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            {expanded === r.id ? <CaretDown size={12} /> : <CaretRight size={12} />}
            <span
              className="rounded px-1.5 py-0.5 font-mono text-xs"
              style={{ background: "var(--color-border)" }}
            >
              {r.symbolType}
            </span>
            <span className="truncate text-sm font-medium">{r.symbolName}</span>
            {r.isExported && <span className="text-xs">exported</span>}
          </button>
          {expanded === r.id && (
            <div className="space-y-1.5 px-3 pb-2">
              <div className="text-xs">{r.filePath}</div>
              {r.description && <div className="text-xs">{r.description}</div>}
              {r.signature && <div className="truncate font-mono text-xs">{r.signature}</div>}
              {r.incoming.length > 0 && (
                <div className="text-xs">
                  <span>Used by: </span>
                  {r.incoming.map((e, i) => (
                    <span key={i}>
                      {e.symbolName}
                      {i < r.incoming.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
              {r.outgoing.length > 0 && (
                <div className="text-xs">
                  <span>Uses: </span>
                  {r.outgoing.map((e, i) => (
                    <span key={i}>
                      {e.symbolName} ({e.edgeType}){i < r.outgoing.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Quick Scrape ─────────────────────────────────────────────────────────

function QuickScrape() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    url: string;
    metadata: Record<string, unknown>;
    llm?: string;
    markdown?: string;
    text?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleScrape = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.webintel.scrape(url.trim());
      setResult(res.data);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const content = result?.llm ?? result?.markdown ?? result?.text;
  const wordCount = content ? content.split(/\s+/).length : 0;

  return (
    <div className="rounded-lg p-3">
      <span className="mb-2 block text-xs font-semibold">Quick Scrape</span>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScrape()}
          placeholder="https://docs.example.com"
          className="input-bordered text-text-primary bg-bg-base flex-1 rounded-md px-2.5 py-1.5 text-xs"
          aria-label="URL to scrape"
        />
        <button
          onClick={handleScrape}
          disabled={loading || !url.trim()}
          className="flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          style={{ background: "#4285F4", color: "#fff" }}
          aria-label="Scrape URL"
        >
          {loading ? <CircleNotch size={12} className="animate-spin" /> : <Globe size={12} />}
          Scrape
        </button>
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "#EA4335" }}>
          <WarningCircle size={12} /> {error}
        </div>
      )}
      {result && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full cursor-pointer items-center gap-1.5 text-xs font-medium"
            aria-expanded={expanded}
          >
            {expanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
            <CheckCircle size={12} color="#34A853" />
            <span className="flex-1 truncate text-left">
              {typeof result.metadata?.title === "string" ? result.metadata.title : result.url}
            </span>
            <span className="text-text-muted" style={{ fontFamily: "var(--font-mono)" }}>
              {wordCount.toLocaleString()} words
            </span>
          </button>
          {expanded && content && (
            <pre
              className="text-text-primary bg-bg-base mt-2 overflow-auto whitespace-pre-wrap rounded p-2 text-xs"
              style={{
                maxHeight: 300,
                wordBreak: "break-word",
              }}
            >
              {content.slice(0, 5000)}
              {content.length > 5000 && "\n\n... [truncated]"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick Research ────────────────────────────────────────────────────────

function QuickResearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    content: string;
    sources: Array<{ title: string; url: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleResearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.webintel.research(query.trim());
      setResult(res.data);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="rounded-lg p-3">
      <span className="mb-2 block text-xs font-semibold">Web Research</span>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleResearch()}
          placeholder="Search query..."
          className="input-bordered text-text-primary bg-bg-base flex-1 rounded-md px-2.5 py-1.5 text-xs"
          aria-label="Research query"
        />
        <button
          onClick={handleResearch}
          disabled={loading || !query.trim()}
          className="flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          style={{ background: "#FBBC04", color: "#1a1a1a" }}
          aria-label="Research topic"
        >
          {loading ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <MagnifyingGlass size={12} />
          )}
          Research
        </button>
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "#EA4335" }}>
          <WarningCircle size={12} /> {error}
        </div>
      )}
      {result && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full cursor-pointer items-center gap-1.5 text-xs font-medium"
            aria-expanded={expanded}
          >
            {expanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
            <CheckCircle size={12} color="#34A853" />
            {result.sources.length} sources found
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                {result.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 truncate text-xs"
                    style={{ color: "#4285F4" }}
                  >
                    <LinkIcon size={10} /> {s.title}
                  </a>
                ))}
              </div>
              <pre
                className="text-text-primary bg-bg-base overflow-auto whitespace-pre-wrap rounded p-2 text-xs"
                style={{
                  maxHeight: 300,
                  wordBreak: "break-word",
                }}
              >
                {result.content.slice(0, 5000)}
                {result.content.length > 5000 && "\n\n... [truncated]"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Injection Type Helpers ─────────────────────────────────────────────

const INJECTION_META: Record<
  ContextInjectionEvent["injectionType"],
  { label: string; color: string; icon: React.ElementType }
> = {
  project_map: { label: "Project Map", color: "#A855F7", icon: TreeStructure },
  message_context: { label: "Code Context", color: "#6366F1", icon: Lightning },
  plan_review: { label: "Plan Review", color: "#F59E0B", icon: File },
  break_check: { label: "Break Check", color: "#EA4335", icon: WarningCircle },
  web_docs: { label: "Library Docs", color: "#4285F4", icon: Globe },
  activity_feed: { label: "Activity Feed", color: "#3B82F6", icon: Lightning },
  pulse_guidance: { label: "Pulse Guidance", color: "#F59E0B", icon: Heartbeat },
};

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ── Feed Tab ──────────────────────────────────────────────────────────

function FeedTab({ filterSessionId }: { filterSessionId?: string }) {
  const events = useContextFeedStore((s) => s.events);
  const totalCount = useContextFeedStore((s) => s.totalCount);
  const clear = useContextFeedStore((s) => s.clear);

  const filtered = filterSessionId ? events.filter((e) => e.sessionId === filterSessionId) : events;

  return (
    <div className="flex flex-col gap-2">
      {/* Header with counter */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {totalCount} injection{totalCount !== 1 ? "s" : ""} total
        </span>
        {events.length > 0 && (
          <button
            onClick={clear}
            className="text-text-muted cursor-pointer rounded px-2 py-0.5 text-xs"
            style={{ background: "var(--color-bg-elevated)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <Brain size={32} weight="light" className="mx-auto mb-2" style={{ opacity: 0.3 }} />
          <p className="text-sm">No injections yet</p>
          <p className="mt-1 text-xs">Context events appear here as you chat with Claude</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((evt) => {
            const meta = INJECTION_META[evt.injectionType];
            const Icon = meta.icon;
            return (
              <div key={evt.id} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2">
                <div className="mt-0.5 rounded p-1" style={{ background: meta.color + "15" }}>
                  <Icon size={12} weight="bold" style={{ color: meta.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-text-muted font-mono text-xs" style={{ fontSize: 10 }}>
                      ~{evt.tokenEstimate} tokens
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs">{evt.summary}</div>
                  <div className="text-text-muted mt-0.5 text-xs" style={{ fontSize: 10 }}>
                    {evt.sessionId.slice(0, 8)}... · {formatTimeAgo(evt.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Toggle Row ────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between py-1.5"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <span className="text-xs">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className="relative cursor-pointer rounded-full transition-colors"
        style={{
          width: 32,
          height: 18,
          background: checked ? "#A855F7" : "var(--color-border)",
        }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white transition-transform"
          style={{
            width: 14,
            height: 14,
            left: 2,
            transform: checked ? "translateX(14px)" : "translateX(0)",
          }}
        />
      </button>
    </label>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────

interface CodeGraphConfigState {
  injectionEnabled: boolean;
  projectMapEnabled: boolean;
  messageContextEnabled: boolean;
  planReviewEnabled: boolean;
  breakCheckEnabled: boolean;
  webDocsEnabled: boolean;
  excludePatterns: string[];
  maxContextTokens: number;
}

function SettingsTab({ projectSlug }: { projectSlug: string }) {
  const [config, setConfig] = useState<CodeGraphConfigState | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPattern, setNewPattern] = useState("");

  // Load config
  useEffect(() => {
    if (!projectSlug) return;
    (async () => {
      try {
        const res = await api.codegraph.getConfig(projectSlug);
        if (res.success) setConfig(res.data);
      } catch {
        /* ignore */
      }
    })();
  }, [projectSlug]);

  const save = useCallback(
    async (patch: Partial<CodeGraphConfigState>) => {
      if (!projectSlug) return;
      setSaving(true);
      try {
        await api.codegraph.updateConfig({ projectSlug, ...patch });
        setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
      } catch {
        /* ignore */
      }
      setSaving(false);
    },
    [projectSlug],
  );

  if (!projectSlug) {
    return <div className="py-6 text-center text-sm">Select a project to configure</div>;
  }

  if (!config) {
    return (
      <div className="flex justify-center py-6">
        <CircleNotch size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Master toggle */}
      <div className="rounded-lg p-3">
        <div className="mb-2 flex items-center gap-2">
          <Gear size={14} weight="bold" style={{ color: "#A855F7" }} />
          <span className="text-xs font-semibold">Context Injection</span>
          {saving && <CircleNotch size={10} className="ml-auto animate-spin" />}
        </div>
        <ToggleRow
          label="Enable all context injection"
          checked={config.injectionEnabled}
          onChange={(v) => save({ injectionEnabled: v })}
        />
      </div>

      {/* Per-type toggles */}
      <div className="rounded-lg p-3">
        <span className="mb-2 block text-xs font-semibold">Injection Types</span>
        <div className="flex flex-col">
          <ToggleRow
            label="Project map (session start)"
            checked={config.projectMapEnabled}
            onChange={(v) => save({ projectMapEnabled: v })}
            disabled={!config.injectionEnabled}
          />
          <ToggleRow
            label="Code context (per message)"
            checked={config.messageContextEnabled}
            onChange={(v) => save({ messageContextEnabled: v })}
            disabled={!config.injectionEnabled}
          />
          <ToggleRow
            label="Plan review (plan detection)"
            checked={config.planReviewEnabled}
            onChange={(v) => save({ planReviewEnabled: v })}
            disabled={!config.injectionEnabled}
          />
          <ToggleRow
            label="Break check (after edits)"
            checked={config.breakCheckEnabled}
            onChange={(v) => save({ breakCheckEnabled: v })}
            disabled={!config.injectionEnabled}
          />
          <ToggleRow
            label="Library docs (web scraping)"
            checked={config.webDocsEnabled}
            onChange={(v) => save({ webDocsEnabled: v })}
            disabled={!config.injectionEnabled}
          />
        </div>
      </div>

      {/* Token budget */}
      <div className="rounded-lg p-3">
        <span className="mb-2 block text-xs font-semibold">Token Budget (per message context)</span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={200}
            max={2000}
            step={100}
            value={config.maxContextTokens}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setConfig((prev) => (prev ? { ...prev, maxContextTokens: v } : prev));
            }}
            onMouseUp={() => save({ maxContextTokens: config.maxContextTokens })}
            onTouchEnd={() => save({ maxContextTokens: config.maxContextTokens })}
            className="flex-1"
            style={{ accentColor: "#A855F7" }}
            aria-label="Max context tokens"
          />
          <span className="w-14 text-right font-mono text-xs">{config.maxContextTokens}</span>
        </div>
        <div className="text-text-muted mt-1 flex justify-between text-xs" style={{ fontSize: 10 }}>
          <span>200</span>
          <span>2000</span>
        </div>
      </div>

      {/* Exclude patterns */}
      <div className="rounded-lg p-3">
        <span className="mb-2 block text-xs font-semibold">Exclude Patterns</span>
        <div className="mb-2 flex gap-1.5">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPattern.trim()) {
                const updated = [...config.excludePatterns, newPattern.trim()];
                setNewPattern("");
                save({ excludePatterns: updated });
              }
            }}
            placeholder="**/test/** or **/*.spec.ts"
            className="input-bordered text-text-primary bg-bg-base flex-1 rounded-md px-2.5 py-1.5 text-xs"
            aria-label="Add exclude pattern"
          />
          <button
            onClick={() => {
              if (newPattern.trim()) {
                const updated = [...config.excludePatterns, newPattern.trim()];
                setNewPattern("");
                save({ excludePatterns: updated });
              }
            }}
            disabled={!newPattern.trim()}
            className="cursor-pointer rounded-md p-1.5 disabled:opacity-40"
            style={{ background: "#A855F720", color: "#A855F7" }}
            aria-label="Add pattern"
          >
            <Plus size={12} weight="bold" />
          </button>
        </div>
        {config.excludePatterns.length === 0 ? (
          <div className="text-xs">No exclude patterns set</div>
        ) : (
          <div className="flex flex-col gap-1">
            {config.excludePatterns.map((pattern, idx) => (
              <div key={idx} className="flex items-center justify-between rounded px-2 py-1">
                <span className="truncate font-mono text-xs">{pattern}</span>
                <button
                  onClick={() => {
                    const updated = config.excludePatterns.filter((_, i) => i !== idx);
                    save({ excludePatterns: updated });
                  }}
                  className="shrink-0 cursor-pointer p-0.5"
                  style={{ color: "#EA4335" }}
                  aria-label={`Remove pattern ${pattern}`}
                >
                  <MinusCircle size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Webclaw Setup Wizard ──────────────────────────────────────────────

function WebclawSetup({ onStarted }: { onStarted: () => void }) {
  const [dockerStatus, setDockerStatus] = useState<{
    dockerAvailable: boolean;
    webclawRunning: boolean;
    webclawHealthy: boolean;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.webintel.dockerStatus();
        if (res.success) setDockerStatus(res.data);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.webintel.startWebclaw(apiKey || undefined);
      if (res.success) {
        // Wait a moment for container to start, then refresh
        setTimeout(onStarted, 3000);
      } else {
        setError("Failed to start webclaw");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start webclaw");
    }
    setStarting(false);
  };

  return (
    <div className="rounded-lg p-3">
      <div className="mb-2 flex items-center gap-2">
        <Package size={14} weight="bold" style={{ color: "#4285F4" }} />
        <span className="text-xs font-semibold">Docs Engine Setup</span>
      </div>

      <p className="text-text-secondary mb-3 text-xs">
        Docs Engine auto-injects library documentation into your AI sessions. Works out of the box —{" "}
        <strong className="text-text-primary">no API key needed</strong> for scraping, docs, and
        crawling.
      </p>

      {dockerStatus === null ? (
        <div className="flex justify-center py-2">
          <CircleNotch size={16} className="animate-spin" />
        </div>
      ) : dockerStatus.dockerAvailable ? (
        <div className="flex flex-col gap-2">
          {/* Start button — primary action */}
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
            style={{ background: "#4285F4", color: "#fff" }}
          >
            {starting ? (
              <CircleNotch size={14} className="animate-spin" />
            ) : (
              <Play size={14} weight="fill" />
            )}
            {starting ? "Starting..." : "Start Docs Engine"}
          </button>

          {error && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#EA4335" }}>
              <WarningCircle size={12} /> {error}
            </div>
          )}

          {/* Advanced: API key (collapsed by default) */}
          <details className="text-text-muted text-xs">
            <summary className="text-text-muted cursor-pointer py-1">
              Advanced: Web Search API key (optional)
            </summary>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <p className="text-text-muted" style={{ fontSize: 11 }}>
                Only needed for <code className="bg-bg-base rounded px-1">/research</code> command.
                Scraping, docs, and crawling work without it.
              </p>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave empty — not required"
                className="input-bordered text-text-primary bg-bg-base w-full rounded-md px-2.5 py-1.5 text-xs"
                aria-label="Webclaw API key for web search"
              />
            </div>
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs"
            style={{ background: "#FBBC0415", color: "#FBBC04" }}
          >
            <WarningCircle size={12} /> Docker not detected
          </div>
          <button
            onClick={() => setShowManual(!showManual)}
            className="cursor-pointer text-left text-xs"
            style={{ color: "#4285F4" }}
          >
            {showManual ? "Hide" : "Show"} manual setup instructions
          </button>
          {showManual && (
            <pre className="text-text-primary bg-bg-base overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
              {`# Install Docker: https://docs.docker.com/get-docker/

# Then run:
docker run -d -p 3100:3000 \\
  --name companion-webclaw \\
  ghcr.io/0xmassi/webclaw:latest`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────

export function AiContextPanel({ onClose, projectSlug: initialSlug }: AiContextPanelProps) {
  // ── Project selector state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? "");
  const injectionCount = useContextFeedStore((s) => s.totalCount);
  const [tab, setTab] = useState<"explore" | "feed" | "settings">("explore");

  // ── CodeGraph state
  const [cgReady, setCgReady] = useState(false);
  const [cgScanning, setCgScanning] = useState(false);
  const [cgJob, setCgJob] = useState<ScanJob | null>(null);
  const [cgStats, setCgStats] = useState<{ files: number; nodes: number; edges: number } | null>(
    null,
  );
  const [hotFiles, setHotFiles] = useState<HotFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // ── WebIntel state
  const [wiStatus, setWiStatus] = useState<WebIntelStatus | null>(null);
  const [wiClearing, setWiClearing] = useState(false);

  const slug = selectedSlug;

  // ── Load projects
  useEffect(() => {
    (async () => {
      try {
        const res = await api.projects.list();
        setProjects((res.data ?? []) as Project[]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Sync external projectSlug changes
  useEffect(() => {
    if (initialSlug && initialSlug !== selectedSlug) {
      setSelectedSlug(initialSlug); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [initialSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CodeGraph loading
  const loadCgStatus = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.status(slug);
      if (res.success) {
        setCgReady(res.data.ready);
        setCgJob(res.data.job);
        setCgScanning(res.data.job?.status === "scanning" || res.data.job?.status === "describing");
      }
    } catch {
      /* ignore */
    }
  }, [slug]);

  const loadCgStats = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.stats(slug);
      if (res.success) setCgStats(res.data);
    } catch {
      /* ignore */
    }
  }, [slug]);

  const loadHotFiles = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.hotFiles(slug, 8);
      if (res.success) setHotFiles(res.data);
    } catch {
      /* ignore */
    }
  }, [slug]);

  // ── WebIntel loading
  const loadWiStatus = useCallback(async () => {
    try {
      const res = await api.webintel.status();
      setWiStatus(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Polling
  useEffect(() => {
    loadCgStatus(); // eslint-disable-line react-hooks/set-state-in-effect
    loadCgStats();
    loadHotFiles();
    loadWiStatus();

    const interval = setInterval(
      () => {
        loadCgStatus();
        loadWiStatus();
        if (cgScanning) loadCgStats();
      },
      cgScanning ? 3000 : 15000,
    );

    return () => clearInterval(interval);
  }, [loadCgStatus, loadCgStats, loadHotFiles, loadWiStatus, cgScanning]);

  // Refresh on scan complete
  useEffect(() => {
    if (cgReady && !cgScanning) {
      loadCgStats(); // eslint-disable-line react-hooks/set-state-in-effect -- refresh on scan complete
      loadHotFiles();
    }
  }, [cgReady, cgScanning, loadCgStats, loadHotFiles]);

  // ── Actions
  const handleScan = async () => {
    if (!slug) return;
    try {
      await api.codegraph.scan(slug);
      setCgScanning(true);
      loadCgStatus();
    } catch {
      /* ignore */
    }
  };

  const handleSearch = async () => {
    if (!slug || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.codegraph.search(slug, searchQuery);
      if (res.success) setSearchResults(res.data as SearchResult[]);
    } catch {
      /* ignore */
    }
    setSearching(false);
  };

  const handleClearCache = async () => {
    setWiClearing(true);
    try {
      await api.webintel.clearCache();
      await loadWiStatus();
    } catch {
      /* ignore */
    }
    setWiClearing(false);
  };

  const wiAvailable = wiStatus?.available ?? false;
  const wiCache = wiStatus?.cache;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3"
        style={{ boxShadow: "0 1px 0 var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <Brain size={18} weight="bold" style={{ color: "#A855F7" }} />
          <span className="text-sm font-semibold">AI Context</span>
          {injectionCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-xs"
              style={{ background: "#A855F720", color: "#A855F7", fontSize: 10 }}
            >
              {injectionCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              loadCgStatus();
              loadCgStats();
              loadHotFiles();
              loadWiStatus();
            }}
            className="cursor-pointer rounded p-1.5"
            aria-label="Refresh"
          >
            <ArrowClockwise size={14} weight="bold" />
          </button>
          <button
            onClick={onClose}
            className="cursor-pointer rounded p-1.5"
            aria-label="Close panel"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Project Selector */}
      <div className="flex-shrink-0 px-4 py-2" style={{ boxShadow: "0 1px 0 var(--color-border)" }}>
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="input-bordered text-text-primary bg-bg-elevated w-full cursor-pointer rounded-md px-2 py-1.5 text-xs"
          aria-label="Select project"
        >
          <option value="">Select a project...</option>
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} ({p.slug})
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Source Status Cards */}
        <div className="grid grid-cols-3 gap-2">
          <SourceCard
            icon={TreeStructure}
            label="Codebase"
            color="#A855F7"
            online={cgReady}
            statusText={cgScanning ? "Scanning..." : cgReady ? "Ready" : "No scan"}
            detail={cgStats ? `${cgStats.nodes} symbols · ${cgStats.edges} edges` : undefined}
            action={
              !cgReady && !cgScanning && slug ? { label: "Scan", onClick: handleScan } : undefined
            }
          />
          <SourceCard
            icon={Globe}
            label="Docs"
            color="#4285F4"
            online={wiAvailable}
            statusText={wiAvailable ? "Online" : "Offline"}
            detail={wiCache ? `${wiCache.size} cached` : undefined}
          />
          <SourceCard
            icon={Key}
            label="Search"
            color="#FBBC04"
            online={false}
            statusText="Optional"
            detail="For /research only"
          />
        </div>

        {/* Scan progress */}
        {cgScanning && cgJob && <ScanProgress job={cgJob} />}

        {/* Tabs */}
        <div className="flex gap-1" style={{ boxShadow: "0 1px 0 var(--color-border)" }}>
          {(["explore", "feed", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="cursor-pointer px-3 py-1.5 text-xs font-medium"
              style={{
                color: tab === t ? "#A855F7" : "var(--color-text-muted)",
                borderBottom: tab === t ? "2px solid #A855F7" : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: tab === t ? "#A855F7" : "transparent",
              }}
            >
              {t === "explore" ? "Explore" : t === "feed" ? "Feed" : "Settings"}
            </button>
          ))}
        </div>

        {/* Explore Tab */}
        {tab === "explore" && (
          <div className="flex flex-col gap-3">
            {/* No project selected */}
            {!slug && (
              <div className="py-6 text-center text-sm">
                Select a project above to explore code and docs
              </div>
            )}

            {/* CodeGraph: Search */}
            {slug && cgReady && (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Search symbols..."
                      className="input-bordered text-text-primary bg-bg-elevated w-full rounded-lg py-1.5 pl-8 pr-3 text-sm"
                      aria-label="Search symbols"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ background: "#A855F7", color: "#fff" }}
                  >
                    {searching ? <CircleNotch size={14} className="animate-spin" /> : "Search"}
                  </button>
                </div>

                {searchResults.length > 0 && <SymbolResults results={searchResults} />}

                {/* Stats row */}
                {cgStats && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Files", value: cgStats.files, icon: File, color: "#4285F4" },
                      {
                        label: "Symbols",
                        value: cgStats.nodes,
                        icon: TreeStructure,
                        color: "#A855F7",
                      },
                      { label: "Edges", value: cgStats.edges, icon: Lightning, color: "#FBBC04" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div
                        key={label}
                        className="rounded-lg p-2 text-center"
                        style={{
                          background: color + "0A",
                          border: `1px solid ${color}25`,
                        }}
                      >
                        <Icon size={14} className="mx-auto mb-0.5" style={{ color }} />
                        <div className="font-mono text-sm font-bold">{value.toLocaleString()}</div>
                        <div className="text-xs">{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rescan button */}
                <button
                  onClick={handleScan}
                  disabled={cgScanning}
                  className="flex cursor-pointer items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={{
                    background: "#A855F715",
                    border: "1px solid #A855F730",
                    color: "#A855F7",
                  }}
                >
                  <ArrowClockwise size={14} /> Rescan
                </button>

                {hotFiles.length > 0 && <HotFilesList files={hotFiles} />}

                {cgJob?.completedAt && (
                  <div className="text-center text-xs">
                    Last scan: {new Date(cgJob.completedAt).toLocaleString()}
                  </div>
                )}

                {/* Graph Visualization */}
                <GraphVisualization projectSlug={slug} />
              </>
            )}

            {/* Divider */}
            {slug && cgReady && (
              <div style={{ boxShadow: "0 -1px 0 var(--color-border)", margin: "4px 0" }} />
            )}

            {/* WebIntel section */}
            {wiAvailable && (
              <>
                {wiCache && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      Docs Cache: {wiCache.size} entries
                    </span>
                    <button
                      onClick={handleClearCache}
                      disabled={wiClearing || wiCache.size === 0}
                      className="flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs disabled:opacity-40"
                      style={{ color: "#EA4335", background: "#EA433510" }}
                      aria-label="Clear cache"
                    >
                      {wiClearing ? (
                        <CircleNotch size={10} className="animate-spin" />
                      ) : (
                        <Trash size={10} />
                      )}
                      Clear
                    </button>
                  </div>
                )}
                <QuickScrape />
                <QuickResearch />
              </>
            )}

            {!wiAvailable && <WebclawSetup onStarted={loadWiStatus} />}
          </div>
        )}

        {/* Feed Tab */}
        {tab === "feed" && <FeedTab />}

        {/* Settings Tab */}
        {tab === "settings" && <SettingsTab projectSlug={slug} />}
      </div>
    </div>
  );
}
