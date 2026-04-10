"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bug,
  Trash,
  DownloadSimple,
  CaretLeft,
  CaretRight,
  CircleNotch,
  ArrowLeft,
  Funnel,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface ErrorEntry {
  id: number;
  source: string;
  level: string;
  message: string;
  stack: string | null;
  sessionId: string | null;
  context: Record<string, unknown> | null;
  timestamp: string;
}

const PAGE_SIZE = 30;

const SOURCE_COLORS: Record<string, string> = {
  server: "#4285f4",
  cli: "#10b981",
  ws: "#f59e0b",
  api: "#3b82f6",
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchErrors = useCallback(async (pageOffset: number, source?: string) => {
    setLoading(true);
    try {
      const res = await api.errors.list({
        source: source || undefined,
        limit: PAGE_SIZE,
        offset: pageOffset,
      });
      setErrors(res.data);
      setTotal(res.meta.total);
    } catch {
      toast.error("Failed to load errors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchErrors(0, sourceFilter);
  }, [fetchErrors, sourceFilter]);

  const handleClear = async () => {
    if (!confirm("Clear all error logs? This cannot be undone.")) return;
    try {
      const res = await api.errors.clear();
      toast.success(`Cleared ${res.data.cleared} errors`);
      setErrors([]);
      setTotal(0);
      setOffset(0);
    } catch {
      toast.error("Failed to clear errors");
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.errors.list({ limit: 200 });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `companion-errors-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export errors");
    }
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    fetchErrors(newOffset, sourceFilter);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "var(--color-bg-base)" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/settings"
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            aria-label="Back to settings"
          >
            <ArrowLeft size={18} weight="bold" />
          </Link>
          <Bug size={22} weight="bold" />
          <h1 className="text-lg font-bold">Error Log</h1>
          <span className="text-sm">{total} errors tracked</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2" style={{ flex: 1 }}>
            <Funnel size={14} />
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setOffset(0);
              }}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "4px 8px",
                color: "var(--color-text-primary)",
                fontSize: 13,
                cursor: "pointer",
              }}
              aria-label="Filter by source"
            >
              <option value="">All sources</option>
              <option value="server">Server</option>
              <option value="cli">CLI</option>
              <option value="ws">WebSocket</option>
              <option value="api">API</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
            aria-label="Export errors as JSON"
          >
            <DownloadSimple size={14} />
            Export
          </button>

          <button
            onClick={handleClear}
            disabled={total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors"
            style={{
              background: total > 0 ? "#ef444420" : "var(--color-bg-card)",
              border: "1px solid var(--color-border)",
              color: total > 0 ? "#ef4444" : "var(--color-text-muted)",
              cursor: total === 0 ? "default" : "pointer",
            }}
            aria-label="Clear all errors"
          >
            <Trash size={14} />
            Clear
          </button>
        </div>

        {/* Error list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <CircleNotch
              size={24}
              style={{ animation: "spin 1s linear infinite", color: "var(--color-text-secondary)" }}
            />
          </div>
        ) : errors.length === 0 ? (
          <div
            className="text-center py-12 rounded-xl"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
          >
            <Bug
              size={32}
              weight="light"
              style={{ color: "var(--color-text-muted)", margin: "0 auto 8px" }}
            />
            <p className="text-sm">No errors recorded</p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--color-border)" }}
          >
            {errors.map((err) => (
              <div
                key={err.id}
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  background: expandedId === err.id ? "var(--color-bg-card)" : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                {/* Summary row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                    style={{
                      background: `${SOURCE_COLORS[err.source] ?? "#666"}20`,
                      color: SOURCE_COLORS[err.source] ?? "#666",
                      minWidth: 48,
                      textAlign: "center",
                    }}
                  >
                    {err.source}
                  </span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: err.level === "fatal" ? "#ef444430" : "#f59e0b20",
                      color: err.level === "fatal" ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    {err.level}
                  </span>
                  <span
                    className="text-sm flex-1 truncate"
                    style={{
                      color: "var(--color-text-primary)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {err.message}
                  </span>
                  <span className="text-xs whitespace-nowrap">
                    {new Date(err.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>

                {/* Expanded detail */}
                {expandedId === err.id && (
                  <div className="px-4 pb-3" style={{ fontSize: 12 }}>
                    {err.sessionId && (
                      <p style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>
                        Session: <span className="font-mono">{err.sessionId.slice(0, 12)}...</span>
                      </p>
                    )}
                    {err.stack && (
                      <pre
                        style={{
                          background: "var(--color-bg-base)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 6,
                          padding: 12,
                          overflow: "auto",
                          maxHeight: 200,
                          color: "var(--color-text-secondary)",
                          fontSize: 11,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {err.stack}
                      </pre>
                    )}
                    {err.context && (
                      <pre
                        style={{
                          background: "var(--color-bg-base)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 6,
                          padding: 12,
                          overflow: "auto",
                          maxHeight: 120,
                          color: "var(--color-text-secondary)",
                          fontSize: 11,
                          lineHeight: 1.5,
                          marginTop: 8,
                        }}
                      >
                        {JSON.stringify(err.context, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-center gap-3 py-4"
            style={{ color: "var(--color-text-secondary)", fontSize: 13 }}
          >
            <button
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(offset - PAGE_SIZE)}
              style={{
                background: "none",
                border: "none",
                cursor: currentPage <= 1 ? "default" : "pointer",
                color: currentPage <= 1 ? "var(--color-border)" : "var(--color-text-secondary)",
                padding: 4,
              }}
              aria-label="Previous page"
            >
              <CaretLeft size={16} />
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
                color:
                  currentPage >= totalPages ? "var(--color-border)" : "var(--color-text-secondary)",
                padding: 4,
              }}
              aria-label="Next page"
            >
              <CaretRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
