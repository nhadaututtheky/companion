"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Graph,
  MagnifyingGlass,
  ArrowClockwise,
  CircleNotch,
  Lightning,
  TreeStructure,
  File,
  CaretDown,
  CaretRight,
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

interface CodeGraphPanelProps {
  onClose: () => void;
  projectSlug?: string;
}

// ── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ ready, scanning }: { ready: boolean; scanning: boolean }) {
  if (scanning) {
    return (
      <div className="flex items-center gap-1.5">
        <CircleNotch size={14} className="animate-spin" style={{ color: "#4285F4" }} />
        <span className="text-xs" style={{ color: "#4285F4" }}>Scanning</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="rounded-full"
        style={{
          width: 8,
          height: 8,
          background: ready ? "#34A853" : "#EA4335",
          boxShadow: ready ? "0 0 6px #34A85380" : "0 0 6px #EA433580",
        }}
      />
      <span className="text-xs opacity-60">{ready ? "Ready" : "No scan"}</span>
    </div>
  );
}

// ── Scan Progress ────────────────────────────────────────────────────────

function ScanProgress({ job }: { job: ScanJob }) {
  const pct = job.totalFiles > 0
    ? Math.round((job.scannedFiles / job.totalFiles) * 100)
    : 0;

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated, #1a2332)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">
          {job.status === "scanning" && "Scanning files..."}
          {job.status === "describing" && "Generating descriptions..."}
          {job.status === "done" && "Scan complete"}
          {job.status === "error" && "Scan failed"}
        </span>
        <span className="text-xs opacity-60">{pct}%</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--border, #2a3f52)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: job.status === "error" ? "#EA4335" : "#4285F4",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-xs opacity-50">
        <span>{job.scannedFiles}/{job.totalFiles} files</span>
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

// ── Stats Card ───────────────────────────────────────────────────────────

function StatsCard({ files, nodes, edges }: { files: number; nodes: number; edges: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Files", value: files, icon: File },
        { label: "Symbols", value: nodes, icon: TreeStructure },
        { label: "Edges", value: edges, icon: Lightning },
      ].map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="rounded-lg p-2.5 text-center"
          style={{ background: "var(--bg-elevated, #1a2332)" }}
        >
          <Icon size={16} className="mx-auto mb-1 opacity-60" />
          <div className="text-sm font-mono font-bold">{value.toLocaleString()}</div>
          <div className="text-xs opacity-50">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Hot Files ────────────────────────────────────────────────────────────

function HotFilesList({ files }: { files: HotFile[] }) {
  if (files.length === 0) return null;

  const maxEdges = Math.max(...files.map((f) => f.incomingEdges + f.outgoingEdges), 1);

  return (
    <div>
      <h4 className="text-xs font-medium opacity-60 mb-2 uppercase tracking-wider">
        Most coupled files
      </h4>
      <div className="space-y-1.5">
        {files.map((f) => {
          const total = f.incomingEdges + f.outgoingEdges;
          const pct = (total / maxEdges) * 100;
          const name = f.filePath.split("/").pop() ?? f.filePath;
          const dir = f.filePath.split("/").slice(0, -1).join("/");

          return (
            <div key={f.filePath} className="relative">
              <div
                className="absolute inset-0 rounded opacity-10"
                style={{
                  width: `${pct}%`,
                  background: "#4285F4",
                }}
              />
              <div className="relative flex items-center justify-between px-2 py-1.5">
                <div className="min-w-0">
                  <span className="text-xs font-medium truncate block">{name}</span>
                  <span className="text-xs opacity-40 truncate block">{dir}</span>
                </div>
                <div className="flex gap-2 text-xs opacity-60 shrink-0">
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

// ── Search Results ───────────────────────────────────────────────────────

function SearchResults({ results }: { results: SearchResult[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (results.length === 0) return null;

  return (
    <div className="space-y-1">
      {results.map((r) => (
        <div
          key={r.id}
          className="rounded-lg overflow-hidden"
          style={{ background: "var(--bg-elevated, #1a2332)" }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            {expanded === r.id ? <CaretDown size={12} /> : <CaretRight size={12} />}
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: "var(--border, #2a3f52)" }}
            >
              {r.symbolType}
            </span>
            <span className="text-sm font-medium truncate">{r.symbolName}</span>
            {r.isExported && (
              <span className="text-xs opacity-40">exported</span>
            )}
          </button>
          {expanded === r.id && (
            <div className="px-3 pb-2 space-y-1.5">
              <div className="text-xs opacity-50">{r.filePath}</div>
              {r.description && (
                <div className="text-xs opacity-70">{r.description}</div>
              )}
              {r.signature && (
                <div className="text-xs font-mono opacity-50 truncate">{r.signature}</div>
              )}
              {r.incoming.length > 0 && (
                <div className="text-xs">
                  <span className="opacity-50">Used by: </span>
                  {r.incoming.map((e, i) => (
                    <span key={i} className="opacity-70">
                      {e.symbolName}
                      {i < r.incoming.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
              {r.outgoing.length > 0 && (
                <div className="text-xs">
                  <span className="opacity-50">Uses: </span>
                  {r.outgoing.map((e, i) => (
                    <span key={i} className="opacity-70">
                      {e.symbolName} ({e.edgeType})
                      {i < r.outgoing.length - 1 ? ", " : ""}
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

// ── Main Panel ───────────────────────────────────────────────────────────

export default function CodeGraphPanel({ onClose, projectSlug }: CodeGraphPanelProps) {
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [job, setJob] = useState<ScanJob | null>(null);
  const [stats, setStats] = useState<{ files: number; nodes: number; edges: number } | null>(null);
  const [hotFiles, setHotFiles] = useState<HotFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const slug = projectSlug ?? "";

  const loadStatus = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.status(slug);
      if (res.success) {
        setReady(res.data.ready);
        setJob(res.data.job);
        setScanning(res.data.job?.status === "scanning" || res.data.job?.status === "describing");
      }
    } catch { /* ignore */ }
  }, [slug]);

  const loadStats = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.stats(slug);
      if (res.success) setStats(res.data);
    } catch { /* ignore */ }
  }, [slug]);

  const loadHotFiles = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await api.codegraph.hotFiles(slug, 8);
      if (res.success) setHotFiles(res.data);
    } catch { /* ignore */ }
  }, [slug]);

  // Initial load + polling
  useEffect(() => {
    loadStatus(); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on mount
    loadStats();  
    loadHotFiles();  

    const interval = setInterval(() => {
      loadStatus();
      if (scanning) {
        loadStats();
      }
    }, scanning ? 3000 : 15000);

    return () => clearInterval(interval);
  }, [loadStatus, loadStats, loadHotFiles, scanning]);

  // Refresh stats + hot files when scan completes
  useEffect(() => {
    if (ready && !scanning) {
      loadStats(); // eslint-disable-line react-hooks/set-state-in-effect -- refresh on scan complete
      loadHotFiles();  
    }
  }, [ready, scanning, loadStats, loadHotFiles]);

  const handleScan = async () => {
    if (!slug) return;
    try {
      await api.codegraph.scan(slug);
      setScanning(true);
      loadStatus();
    } catch { /* ignore */ }
  };

  const handleSearch = async () => {
    if (!slug || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.codegraph.search(slug, searchQuery);
      if (res.success) setSearchResults(res.data as SearchResult[]);
    } catch { /* ignore */ }
    setSearching(false);
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: "var(--bg-card, #121a20)",
        borderLeft: "1px solid var(--border, #2a3f52)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border, #2a3f52)" }}>
        <div className="flex items-center gap-2">
          <Graph size={18} weight="bold" style={{ color: "#A855F7" }} />
          <span className="font-semibold text-sm">CodeGraph</span>
          <StatusBadge ready={ready} scanning={scanning} />
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 cursor-pointer"
          aria-label="Close CodeGraph panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!slug && (
          <div className="text-center py-8 opacity-50 text-sm">
            Select a project to view code graph
          </div>
        )}

        {slug && !ready && !scanning && (
          <div className="text-center py-6">
            <TreeStructure size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm opacity-60 mb-3">No code graph scan yet</p>
            <button
              onClick={handleScan}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "#A855F7", color: "#fff" }}
            >
              Scan Project
            </button>
          </div>
        )}

        {slug && scanning && job && <ScanProgress job={job} />}

        {slug && ready && (
          <>
            {/* Stats */}
            {stats && <StatsCard {...stats} />}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50"
                style={{ background: "var(--bg-elevated, #1a2332)" }}
              >
                <ArrowClockwise size={14} />
                Rescan
              </button>
            </div>

            {/* Search */}
            <div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <MagnifyingGlass
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search symbols..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
                    style={{
                      background: "var(--bg-elevated, #1a2332)",
                      border: "1px solid var(--border, #2a3f52)",
                    }}
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
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && <SearchResults results={searchResults} />}

            {/* Hot Files */}
            {hotFiles.length > 0 && <HotFilesList files={hotFiles} />}

            {/* Last scan info */}
            {job && job.completedAt && (
              <div className="text-xs opacity-40 text-center pt-2">
                Last scan: {new Date(job.completedAt).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
