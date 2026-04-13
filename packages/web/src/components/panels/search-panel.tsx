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
                borderRadius: "var(--radius-xs)",
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
    <div className="bg-bg-card flex h-full flex-col">
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center gap-2 px-3 py-3"
        style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
      >
        <MagnifyingGlass
          size={15}
          weight="bold"
          className="text-accent shrink-0"
          aria-hidden="true"
        />
        <span className="flex-1 text-sm font-semibold">Search Files</span>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 transition-colors"
          aria-label="Close search panel"
        >
          <X size={15} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Inputs */}
      <div
        className="flex flex-shrink-0 flex-col gap-2 px-3 py-3"
        style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
      >
        {/* Query input */}
        <div className="relative flex items-center">
          <MagnifyingGlass
            size={14}
            weight="regular"
            className="text-text-muted absolute"
            style={{
              left: 10,
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
            className="shadow-soft text-text-primary bg-bg-elevated w-full rounded-md text-sm"
            style={{
              padding: "6px 10px 6px 32px",
              outline: "none",
            }}
            aria-label="Search query"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 cursor-pointer"
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
          className="shadow-soft text-text-secondary bg-bg-elevated w-full rounded-md text-xs"
          style={{
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
          <div className="flex items-center justify-center gap-2 py-8">
            <CircleNotch size={16} className="animate-spin" aria-hidden="true" />
            <span className="text-sm">Searching...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <WarningCircle size={24} weight="regular" aria-hidden="true" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && hasSearched && matches.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <MagnifyingGlass size={24} weight="regular" aria-hidden="true" />
            <span className="text-sm">No results found</span>
          </div>
        )}

        {/* Results */}
        {!loading && !error && matches.length > 0 && (
          <>
            {/* Results count */}
            <div
              className="text-text-muted flex flex-shrink-0 items-center gap-1.5 px-3 py-2 text-xs"
              style={{
                boxShadow: "0 1px 0 var(--glass-border)",
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
                    className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
                    style={{ boxShadow: "0 1px 0 var(--glass-border)" }}
                    aria-label={`Open ${fileBasename(match.file)} at line ${match.line}`}
                  >
                    {/* File + line */}
                    <div className="mb-1 flex min-w-0 items-center gap-1.5">
                      <FileText
                        size={12}
                        weight="regular"
                        className="text-accent shrink-0"
                        aria-hidden="true"
                      />
                      <span
                        className="truncate text-xs font-semibold"
                        title={fileRelative(match.file, searchRoot)}
                      >
                        {fileRelative(match.file, searchRoot)}
                      </span>
                      <span className="flex-shrink-0 font-mono text-xs">:{match.line}</span>
                    </div>

                    {/* Matching line text */}
                    <div className="truncate font-mono text-xs" title={match.text.trim()}>
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
        className="text-text-muted flex flex-shrink-0 items-center gap-1.5 truncate px-3 py-2 text-xs"
        style={{
          boxShadow: "0 -1px 0 var(--glass-border)",
        }}
        title={searchRoot}
      >
        <span className="truncate">{searchRoot || "No root set"}</span>
      </div>
    </div>
  );
}
