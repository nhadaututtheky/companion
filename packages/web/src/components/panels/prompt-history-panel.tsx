"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MagnifyingGlass,
  X,
  CircleNotch,
  ClockCounterClockwise,
  ArrowClockwise,
  Copy,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { api } from "@/lib/api-client";

interface PromptEntry {
  id: string;
  sessionId: string;
  sessionName: string | null;
  projectSlug: string | null;
  content: string;
  source: string;
  createdAt: string;
}

interface PromptHistoryPanelProps {
  /** If provided, filters to this session only */
  sessionId?: string;
  /** Called when user wants to resend a prompt to the active session */
  onResend?: (content: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 30;

export function PromptHistoryPanel({ sessionId, onResend, onClose }: PromptHistoryPanelProps) {
  const [query, setQuery] = useState("");
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(
    async (q: string, pageOffset: number) => {
      setLoading(true);
      try {
        const res = await api.prompts.list({
          sessionId,
          q: q || undefined,
          limit: PAGE_SIZE,
          offset: pageOffset,
        });
        setPrompts(res.data);
        setTotal(res.meta.total);
        setHasSearched(true);
      } catch {
        setPrompts([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  // Initial load
  useEffect(() => {
    doSearch("", 0);
  }, [doSearch]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      doSearch(query, 0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    doSearch(query, newOffset);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div
      className="flex"
      style={{
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-base)",
      }}
    >
      {/* Header */}
      <div
        className="flex shrink-0"
        style={{
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <ClockCounterClockwise
          size={16}
          weight="bold"
          className="shrink-0"
          style={{ color: "var(--text-secondary)" }}
        />
        <span className="font-semibold" style={{ fontSize: 13, color: "var(--text-primary)" }}>
          Prompt History
        </span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto" }}>
          {total > 0 && `${total} prompts`}
        </span>
        <button
          onClick={onClose}
          className="cursor-pointer"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            padding: 4,
            borderRadius: 4,
          }}
          aria-label="Close prompt history"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div
        className="shrink-0"
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div
          className="flex"
          style={{
            alignItems: "center",
            gap: 6,
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          <MagnifyingGlass
            size={14}
            className="shrink-0"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search prompts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search prompts"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="cursor-pointer"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                padding: 2,
              }}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
        {loading && prompts.length === 0 ? (
          <div className="flex" style={{ justifyContent: "center", padding: 24 }}>
            <CircleNotch
              size={20}
              style={{ animation: "spin 1s linear infinite", color: "var(--text-secondary)" }}
            />
          </div>
        ) : prompts.length === 0 && hasSearched ? (
          <div
            className="text-center"
            style={{
              padding: 24,
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {query ? "No prompts matching your search" : "No prompts yet"}
          </div>
        ) : (
          prompts.map((p) => (
            <div
              key={p.id}
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-color)",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {/* Meta row */}
              <div
                className="flex"
                style={{
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                {!sessionId && p.sessionName && (
                  <span
                    className="overflow-hidden whitespace-nowrap font-medium"
                    style={{
                      background: "var(--bg-elevated, var(--bg-card))",
                      padding: "1px 6px",
                      borderRadius: 4,
                      maxWidth: 140,
                      textOverflow: "ellipsis",
                    }}
                  >
                    {p.sessionName}
                  </span>
                )}
                {p.projectSlug && <span className="opacity-70">{p.projectSlug}</span>}
                <span className="whitespace-nowrap" style={{ marginLeft: "auto" }}>
                  {new Date(p.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Content */}
              <div
                className="overflow-hidden whitespace-pre-wrap"
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                  maxHeight: 80,
                  textOverflow: "ellipsis",
                }}
              >
                {p.content.length > 300 ? p.content.slice(0, 300) + "..." : p.content}
              </div>

              {/* Actions */}
              <div className="flex" style={{ gap: 4, marginTop: 6 }}>
                <button
                  onClick={() => handleCopy(p.content, p.id)}
                  className="flex cursor-pointer"
                  style={{
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "1px solid var(--border-color)",
                    borderRadius: 4,
                    padding: "2px 8px",
                    color: copiedId === p.id ? "var(--success, #10b981)" : "var(--text-secondary)",
                    fontSize: 11,
                    transition: "color 150ms",
                  }}
                  aria-label="Copy prompt"
                >
                  <Copy size={12} />
                  {copiedId === p.id ? "Copied" : "Copy"}
                </button>
                {onResend && (
                  <button
                    onClick={() => onResend(p.content)}
                    className="flex cursor-pointer"
                    style={{
                      alignItems: "center",
                      gap: 4,
                      background: "none",
                      border: "1px solid var(--border-color)",
                      borderRadius: 4,
                      padding: "2px 8px",
                      color: "var(--text-secondary)",
                      fontSize: 11,
                    }}
                    aria-label="Resend prompt"
                  >
                    <ArrowClockwise size={12} />
                    Resend
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex shrink-0"
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "6px 12px",
            borderTop: "1px solid var(--border-color)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <button
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(offset - PAGE_SIZE)}
            style={{
              background: "none",
              border: "none",
              cursor: currentPage <= 1 ? "default" : "pointer",
              color: currentPage <= 1 ? "var(--border-color)" : "var(--text-secondary)",
              padding: 4,
            }}
            aria-label="Previous page"
          >
            <CaretLeft size={14} />
          </button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange(offset + PAGE_SIZE)}
            style={{
              background: "none",
              border: "none",
              cursor: currentPage >= totalPages ? "default" : "pointer",
              color: currentPage >= totalPages ? "var(--border-color)" : "var(--text-secondary)",
              padding: 4,
            }}
            aria-label="Next page"
          >
            <CaretRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
