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
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

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
        background: "var(--color-bg-elevated)",
        border: `1px solid ${online ? color + "30" : "var(--color-border)"}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} weight="bold" style={{ color }} />
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {label}
        </span>
        <div
          className="rounded-full ml-auto"
          style={{
            width: 6,
            height: 6,
            background: online ? "#34A853" : "#EA4335",
            boxShadow: online ? "0 0 4px #34A85360" : "none",
          }}
        />
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {statusText}
      </div>
      {detail && (
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--color-text-muted)", fontSize: 10 }}
        >
          {detail}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.loading}
          className="mt-1.5 text-xs px-2 py-1 rounded font-medium cursor-pointer disabled:opacity-50"
          style={{ background: color + "20", color }}
        >
          {action.loading ? <CircleNotch size={10} className="animate-spin inline" /> : null}{" "}
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
    <div className="rounded-lg p-3" style={{ background: "var(--color-bg-elevated)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          {job.status === "scanning" && "Scanning files..."}
          {job.status === "describing" && "Generating descriptions..."}
          {job.status === "done" && "Scan complete"}
          {job.status === "error" && "Scan failed"}
        </span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--color-border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: job.status === "error" ? "#EA4335" : "#A855F7" }}
        />
      </div>
      <div
        className="flex justify-between mt-1.5 text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
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
      <h4
        className="text-xs font-medium mb-2 uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        Most coupled files
      </h4>
      <div className="flex flex-col gap-1">
        {files.map((f) => {
          const total = f.incomingEdges + f.outgoingEdges;
          const pct = (total / maxEdges) * 100;
          const name = f.filePath.split("/").pop() ?? f.filePath;
          const dir = f.filePath.split("/").slice(0, -1).join("/");

          return (
            <div key={f.filePath} className="relative">
              <div
                className="absolute inset-0 rounded opacity-10"
                style={{ width: `${pct}%`, background: "#A855F7" }}
              />
              <div className="relative flex items-center justify-between px-2 py-1.5">
                <div className="min-w-0">
                  <span
                    className="text-xs font-medium truncate block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {name}
                  </span>
                  <span
                    className="text-xs truncate block"
                    style={{ color: "var(--color-text-muted)", fontSize: 10 }}
                  >
                    {dir}
                  </span>
                </div>
                <div
                  className="flex gap-2 text-xs shrink-0"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--color-bg-elevated)" }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            {expanded === r.id ? <CaretDown size={12} /> : <CaretRight size={12} />}
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: "var(--color-border)" }}
            >
              {r.symbolType}
            </span>
            <span
              className="text-sm font-medium truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {r.symbolName}
            </span>
            {r.isExported && (
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                exported
              </span>
            )}
          </button>
          {expanded === r.id && (
            <div className="px-3 pb-2 space-y-1.5">
              <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {r.filePath}
              </div>
              {r.description && (
                <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {r.description}
                </div>
              )}
              {r.signature && (
                <div
                  className="text-xs font-mono truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {r.signature}
                </div>
              )}
              {r.incoming.length > 0 && (
                <div className="text-xs">
                  <span style={{ color: "var(--color-text-muted)" }}>Used by: </span>
                  {r.incoming.map((e, i) => (
                    <span key={i} style={{ color: "var(--color-text-secondary)" }}>
                      {e.symbolName}
                      {i < r.incoming.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
              {r.outgoing.length > 0 && (
                <div className="text-xs">
                  <span style={{ color: "var(--color-text-muted)" }}>Uses: </span>
                  {r.outgoing.map((e, i) => (
                    <span key={i} style={{ color: "var(--color-text-secondary)" }}>
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
    <div className="rounded-lg p-3" style={{ background: "var(--color-bg-elevated)" }}>
      <span
        className="text-xs font-semibold block mb-2"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Quick Scrape
      </span>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScrape()}
          placeholder="https://docs.example.com"
          className="flex-1 text-xs px-2.5 py-1.5 rounded-md outline-none"
          style={{
            background: "var(--color-bg-base)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
          aria-label="URL to scrape"
        />
        <button
          onClick={handleScrape}
          disabled={loading || !url.trim()}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-semibold cursor-pointer disabled:opacity-40"
          style={{ background: "#4285F4", color: "#fff" }}
          aria-label="Scrape URL"
        >
          {loading ? <CircleNotch size={12} className="animate-spin" /> : <Globe size={12} />}
          Scrape
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: "#EA4335" }}>
          <WarningCircle size={12} /> {error}
        </div>
      )}
      {result && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-medium cursor-pointer w-full"
            style={{ color: "var(--color-text-secondary)" }}
            aria-expanded={expanded}
          >
            {expanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
            <CheckCircle size={12} color="#34A853" />
            <span className="truncate flex-1 text-left">
              {typeof result.metadata?.title === "string" ? result.metadata.title : result.url}
            </span>
            <span style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              {wordCount.toLocaleString()} words
            </span>
          </button>
          {expanded && content && (
            <pre
              className="mt-2 text-xs p-2 rounded overflow-auto"
              style={{
                background: "var(--color-bg-base)",
                color: "var(--color-text-primary)",
                maxHeight: 300,
                whiteSpace: "pre-wrap",
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
    <div className="rounded-lg p-3" style={{ background: "var(--color-bg-elevated)" }}>
      <span
        className="text-xs font-semibold block mb-2"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Web Research
      </span>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleResearch()}
          placeholder="Search query..."
          className="flex-1 text-xs px-2.5 py-1.5 rounded-md outline-none"
          style={{
            background: "var(--color-bg-base)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
          aria-label="Research query"
        />
        <button
          onClick={handleResearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-semibold cursor-pointer disabled:opacity-40"
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
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: "#EA4335" }}>
          <WarningCircle size={12} /> {error}
        </div>
      )}
      {result && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-medium cursor-pointer w-full"
            style={{ color: "var(--color-text-secondary)" }}
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
                    className="flex items-center gap-1.5 text-xs truncate"
                    style={{ color: "#4285F4" }}
                  >
                    <LinkIcon size={10} /> {s.title}
                  </a>
                ))}
              </div>
              <pre
                className="text-xs p-2 rounded overflow-auto"
                style={{
                  background: "var(--color-bg-base)",
                  color: "var(--color-text-primary)",
                  maxHeight: 300,
                  whiteSpace: "pre-wrap",
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

// ── Main Panel ──────────────────────────────────────────────────────────

export function AiContextPanel({ onClose, projectSlug: initialSlug }: AiContextPanelProps) {
  // ── Project selector state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(initialSlug ?? "");
  const [tab, setTab] = useState<"explore" | "feed">("explore");

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
      setSelectedSlug(initialSlug);
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
    loadCgStatus();
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <Brain size={18} weight="bold" style={{ color: "#A855F7" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            AI Context
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              loadCgStatus();
              loadCgStats();
              loadHotFiles();
              loadWiStatus();
            }}
            className="p-1.5 rounded cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Refresh"
          >
            <ArrowClockwise size={14} weight="bold" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close panel"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Project Selector */}
      <div
        className="px-4 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="w-full text-xs py-1.5 px-2 rounded-md outline-none cursor-pointer"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
          }}
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
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
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
            detail="Needs API key"
          />
        </div>

        {/* Scan progress */}
        {cgScanning && cgJob && <ScanProgress job={cgJob} />}

        {/* Tabs */}
        <div className="flex gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {(["explore", "feed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 text-xs font-medium cursor-pointer"
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
              {t === "explore" ? "Explore" : "Feed"}
            </button>
          ))}
        </div>

        {/* Explore Tab */}
        {tab === "explore" && (
          <div className="flex flex-col gap-3">
            {/* No project selected */}
            {!slug && (
              <div
                className="text-center py-6 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Select a project above to explore code and docs
              </div>
            )}

            {/* CodeGraph: Search */}
            {slug && cgReady && (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <MagnifyingGlass
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--color-text-muted)" }}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Search symbols..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
                      style={{
                        background: "var(--color-bg-elevated)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-primary)",
                      }}
                      aria-label="Search symbols"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
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
                      { label: "Files", value: cgStats.files, icon: File },
                      { label: "Symbols", value: cgStats.nodes, icon: TreeStructure },
                      { label: "Edges", value: cgStats.edges, icon: Lightning },
                    ].map(({ label, value, icon: Icon }) => (
                      <div
                        key={label}
                        className="rounded-lg p-2 text-center"
                        style={{ background: "var(--color-bg-elevated)" }}
                      >
                        <Icon
                          size={14}
                          className="mx-auto mb-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        />
                        <div
                          className="text-sm font-mono font-bold"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {value.toLocaleString()}
                        </div>
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rescan button */}
                <button
                  onClick={handleScan}
                  disabled={cgScanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 self-start"
                  style={{
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <ArrowClockwise size={14} /> Rescan
                </button>

                {hotFiles.length > 0 && <HotFilesList files={hotFiles} />}

                {cgJob?.completedAt && (
                  <div className="text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
                    Last scan: {new Date(cgJob.completedAt).toLocaleString()}
                  </div>
                )}
              </>
            )}

            {/* Divider */}
            {slug && cgReady && (
              <div style={{ borderTop: "1px solid var(--color-border)", margin: "4px 0" }} />
            )}

            {/* WebIntel section */}
            {wiAvailable && (
              <>
                {wiCache && (
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      Docs Cache: {wiCache.size} entries
                    </span>
                    <button
                      onClick={handleClearCache}
                      disabled={wiClearing || wiCache.size === 0}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded cursor-pointer disabled:opacity-40"
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

            {!wiAvailable && (
              <div
                className="text-xs text-center py-3 rounded-lg"
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text-muted)" }}
              >
                Docs engine offline — start webclaw sidecar:
                <pre
                  className="mt-1 p-2 rounded text-left text-xs"
                  style={{ background: "var(--color-bg-base)" }}
                >
                  docker run -d -p 3100:3000 ghcr.io/0xmassi/webclaw
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Feed Tab (placeholder) */}
        {tab === "feed" && (
          <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
            <Brain size={32} weight="light" className="mx-auto mb-2" style={{ opacity: 0.3 }} />
            <p className="text-sm">Live context feed coming soon</p>
            <p className="text-xs mt-1">See what AI context gets injected into each message</p>
          </div>
        )}
      </div>
    </div>
  );
}
