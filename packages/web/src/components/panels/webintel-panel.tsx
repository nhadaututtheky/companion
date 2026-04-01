"use client";

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Globe,
  MagnifyingGlass,
  Trash,
  ArrowClockwise,
  CircleNotch,
  CheckCircle,
  WarningCircle,
  Link as LinkIcon,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────

interface WebIntelStatus {
  available: boolean;
  cache: { size: number; maxSize: number; hits: number; misses: number };
}

interface ScrapeResult {
  url: string;
  metadata: Record<string, unknown>;
  markdown?: string;
  llm?: string;
  text?: string;
}

interface WebIntelPanelProps {
  onClose: () => void;
}

// ── Status Badge ─────────────────────────────────────────────────────────

function StatusBadge({ available }: { available: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="rounded-full"
        style={{
          width: 8,
          height: 8,
          background: available ? "#34A853" : "#EA4335",
          boxShadow: available ? "0 0 6px #34A85380" : "0 0 6px #EA433580",
        }}
        aria-hidden="true"
      />
      <span
        className="text-xs font-medium"
        style={{ color: available ? "#34A853" : "#EA4335" }}
      >
        {available ? "Online" : "Offline"}
      </span>
    </div>
  );
}

// ── Cache Stats ──────────────────────────────────────────────────────────

function CacheStats({
  cache,
  onClear,
  clearing,
}: {
  cache: WebIntelStatus["cache"];
  onClear: () => void;
  clearing: boolean;
}) {
  const hitRate = cache.hits + cache.misses > 0
    ? ((cache.hits / (cache.hits + cache.misses)) * 100).toFixed(0)
    : "0";

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--color-bg-elevated)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          Cache
        </span>
        <button
          onClick={onClear}
          disabled={clearing || cache.size === 0}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: "#EA4335", background: "#EA433510" }}
          aria-label="Clear cache"
        >
          {clearing ? <CircleNotch size={10} className="animate-spin" /> : <Trash size={10} />}
          Clear
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
            {cache.size}
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>entries</div>
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
            {hitRate}%
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>hit rate</div>
        </div>
        <div>
          <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
            {cache.maxSize}
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>max</div>
        </div>
      </div>
    </div>
  );
}

// ── Quick Scrape ─────────────────────────────────────────────────────────

function QuickScrape() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
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
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--color-bg-elevated)" }}
    >
      <span className="text-xs font-semibold block mb-2" style={{ color: "var(--color-text-secondary)" }}>
        Quick Scrape
      </span>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleScrape()}
          placeholder="https://example.com/docs"
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
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "#4285F4", color: "#fff" }}
          aria-label="Scrape URL"
        >
          {loading ? (
            <CircleNotch size={12} className="animate-spin" />
          ) : (
            <Globe size={12} />
          )}
          Scrape
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: "#EA4335" }}>
          <WarningCircle size={12} />
          {error}
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
            <span className="truncate flex-1 text-left">{result.metadata?.title as string ?? result.url}</span>
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
  const [result, setResult] = useState<{ content: string; sources: Array<{ title: string; url: string }> } | null>(null);
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
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--color-bg-elevated)" }}
    >
      <span className="text-xs font-semibold block mb-2" style={{ color: "var(--color-text-secondary)" }}>
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
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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
          <WarningCircle size={12} />
          {error}
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
              {/* Sources */}
              <div className="flex flex-col gap-1">
                {result.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs hover:underline truncate"
                    style={{ color: "#4285F4" }}
                  >
                    <LinkIcon size={10} />
                    {s.title}
                  </a>
                ))}
              </div>
              {/* Content preview */}
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

// ── Main Panel ───────────────────────────────────────────────────────────

export function WebIntelPanel({ onClose }: WebIntelPanelProps) {
  const [status, setStatus] = useState<WebIntelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.webintel.status();
      setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleClearCache = useCallback(async () => {
    setClearing(true);
    try {
      await api.webintel.clearCache();
      await fetchStatus();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }, [fetchStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <Globe size={16} weight="bold" style={{ color: "#4285F4" }} aria-hidden="true" />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            WebIntel
          </span>
          {status && <StatusBadge available={status.available} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchStatus}
            className="p-1.5 rounded cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Refresh status"
          >
            <ArrowClockwise size={14} weight="bold" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded cursor-pointer transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close WebIntel panel"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <CircleNotch size={24} className="animate-spin" style={{ color: "var(--color-text-muted)" }} />
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-xs"
            style={{ background: "#EA433510", color: "#EA4335" }}
          >
            <WarningCircle size={14} />
            {error}
          </div>
        )}

        {status && !loading && (
          <>
            <CacheStats cache={status.cache} onClear={handleClearCache} clearing={clearing} />
            <QuickScrape />
            <QuickResearch />
          </>
        )}

        {!status?.available && !loading && !error && (
          <div
            className="text-xs text-center py-4"
            style={{ color: "var(--color-text-muted)" }}
          >
            webclaw sidecar is offline. Start it with:
            <pre
              className="mt-2 p-2 rounded text-left"
              style={{ background: "var(--color-bg-elevated)" }}
            >
              docker run -d -p 3100:3000 ghcr.io/0xmassi/webclaw:latest
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
