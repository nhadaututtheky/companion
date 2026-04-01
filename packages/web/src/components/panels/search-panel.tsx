"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MagnifyingGlass, X, CircleNotch, FileText, WarningCircle } from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface SearchMatch {
  file: string;
  line: number;
  col: number;
  text: string;
}

interface SearchPanelProps {
  searchRoot: string;
  onOpenFile: (filePath: string) => void;
  onClose: () => void;
}

function fileBasename(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
}

function fileRelative(filePath: string, root: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalized.startsWith(normalizedRoot + "/")) {
    return normalized.slice(normalizedRoot.length + 1);
  }
  return normalized;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <span>{text}</span>;
  }

  try {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);

    return (
      // eslint-disable-next-line react-hooks/error-boundaries -- highlight helper, no async risk
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark
              key={i}
              style={{
                background: "var(--color-accent)",
                color: "#fff",
                borderRadius: 2,
                padding: "0 2px",
              }}
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return <span>{text}</span>;
  }
}

export function SearchPanel({ searchRoot, onOpenFile, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [glob, setGlob] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  // Focus query input on mount
  useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  const runSearch = useCallback(
    async (q: string, g: string) => {
      if (!q.trim()) {
        setMatches([]);
        setError(null);
        setTruncated(false);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await api.fs.search(q, searchRoot, g || undefined);
        setMatches(res.data.matches);
        setTruncated(res.data.truncated);
        setHasSearched(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setMatches([]);
        setTruncated(false);
        setHasSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [searchRoot],
  );

  // Debounced search trigger on query or glob change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query, glob);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, glob, runSearch]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--color-bg-card)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <MagnifyingGlass
          size={15}
          weight="bold"
          style={{ color: "var(--color-accent)", flexShrink: 0 }}
          aria-hidden="true"
        />
        <span
          className="text-sm font-semibold flex-1"
          style={{ color: "var(--color-text-primary)" }}
        >
          Search Files
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors cursor-pointer"
          style={{ color: "var(--color-text-muted)" }}
          aria-label="Close search panel"
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Inputs */}
      <div
        className="flex flex-col gap-2 px-3 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        {/* Query input */}
        <div className="relative flex items-center">
          <MagnifyingGlass
            size={14}
            weight="regular"
            style={{
              position: "absolute",
              left: 10,
              color: "var(--color-text-muted)",
              pointerEvents: "none",
            }}
            aria-hidden="true"
          />
          <input
            ref={queryInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full text-sm rounded-md"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
              padding: "6px 10px 6px 32px",
              outline: "none",
            }}
            aria-label="Search query"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 cursor-pointer"
              style={{ color: "var(--color-text-muted)" }}
              aria-label="Clear query"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Glob filter */}
        <input
          type="text"
          value={glob}
          onChange={(e) => setGlob(e.target.value)}
          placeholder="File filter: *.ts, *.tsx"
          className="w-full text-xs rounded-md"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            padding: "5px 10px",
            outline: "none",
          }}
          aria-label="File glob filter"
        />
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div
            className="flex items-center justify-center gap-2 py-8"
            style={{ color: "var(--color-text-muted)" }}
          >
            <CircleNotch size={16} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Searching...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            <WarningCircle size={24} weight="regular" aria-hidden="true" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && hasSearched && matches.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-8"
            style={{ color: "var(--color-text-muted)" }}
          >
            <MagnifyingGlass size={24} weight="regular" aria-hidden="true" />
            <span className="text-sm">No results found</span>
          </div>
        )}

        {/* Results */}
        {!loading && !error && matches.length > 0 && (
          <>
            {/* Results count */}
            <div
              className="flex items-center gap-1.5 px-3 py-2 text-xs flex-shrink-0"
              style={{
                borderBottom: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
              }}
            >
              <span>
                {matches.length} result{matches.length !== 1 ? "s" : ""}
                {truncated ? " (truncated)" : ""}
              </span>
            </div>

            {/* Match list */}
            <ul role="list">
              {matches.map((match, idx) => (
                <li key={`${match.file}:${match.line}:${idx}`}>
                  <button
                    onClick={() => onOpenFile(match.file)}
                    className="w-full text-left px-3 py-2.5 transition-colors cursor-pointer hover:bg-[var(--color-bg-elevated)]"
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                    aria-label={`Open ${fileBasename(match.file)} at line ${match.line}`}
                  >
                    {/* File + line */}
                    <div className="flex items-center gap-1.5 mb-1 min-w-0">
                      <FileText
                        size={12}
                        weight="regular"
                        style={{ color: "var(--color-accent)", flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      <span
                        className="text-xs font-semibold truncate"
                        style={{ color: "var(--color-accent)" }}
                        title={fileRelative(match.file, searchRoot)}
                      >
                        {fileRelative(match.file, searchRoot)}
                      </span>
                      <span
                        className="text-xs flex-shrink-0 font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        :{match.line}
                      </span>
                    </div>

                    {/* Matching line text */}
                    <div
                      className="text-xs font-mono truncate"
                      style={{ color: "var(--color-text-secondary)" }}
                      title={match.text.trim()}
                    >
                      <HighlightedText text={match.text.trim()} query={query} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Search root footer */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 text-xs truncate"
        style={{
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
        title={searchRoot}
      >
        <span className="truncate">{searchRoot || "No root set"}</span>
      </div>
    </div>
  );
}
