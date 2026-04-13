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
    <div className="bg-bg-base flex flex-col" style={{ height: "100vh" }}>
      <Header />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}
      >
        {/* Back + Title */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/settings"
            className="cursor-pointer rounded-lg p-1.5 transition-colors"
            aria-label="Back to settings"
          >
            <ArrowLeft size={18} weight="bold" />
          </Link>
          <Bug size={22} weight="bold" />
          <h1 className="text-lg font-bold">Error Log</h1>
          <span className="text-sm">{total} errors tracked</span>
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex items-center gap-2" style={{ flex: 1 }}>
            <Funnel size={14} />
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setOffset(0);
              }}
              className="text-text-primary bg-bg-card border-border cursor-pointer rounded-md border px-2 py-1 text-[13px]"
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
            className="shadow-soft text-text-secondary bg-bg-card flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors"
            aria-label="Export errors as JSON"
          >
            <DownloadSimple size={14} />
            Export
          </button>

          <button
            onClick={handleClear}
            disabled={total === 0}
            className="border-border flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
            style={{
              background: total > 0 ? "#ef444420" : "var(--color-bg-card)",
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
              className="text-text-secondary"
              style={{ animation: "spin 1s linear infinite" }}
            />
          </div>
        ) : errors.length === 0 ? (
          <div className="shadow-soft bg-bg-card rounded-xl py-12 text-center">
            <Bug
              size={32}
              weight="light"
              className="text-text-muted"
              style={{ margin: "0 auto 8px" }}
            />
            <p className="text-sm">No errors recorded</p>
          </div>
        ) : (
          <div className="border-border overflow-hidden rounded-xl border">
            {errors.map((err) => (
              <div
                key={err.id}
                className="cursor-pointer"
                style={{
                  boxShadow: "0 1px 0 var(--color-border)",
                  background: expandedId === err.id ? "var(--color-bg-card)" : "transparent",
                }}
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                {/* Summary row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="rounded px-2 py-0.5 font-mono text-xs font-bold"
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
                    className="rounded px-1.5 py-0.5 text-xs font-bold"
                    style={{
                      background: err.level === "fatal" ? "#ef444430" : "#f59e0b20",
                      color: err.level === "fatal" ? "#ef4444" : "#f59e0b",
                    }}
                  >
                    {err.level}
                  </span>
                  <span
                    className="text-text-primary flex-1 truncate text-sm"
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {err.message}
                  </span>
                  <span className="whitespace-nowrap text-xs">
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
                      <p className="text-text-secondary" style={{ marginBottom: 4 }}>
                        Session: <span className="font-mono">{err.sessionId.slice(0, 12)}...</span>
                      </p>
                    )}
                    {err.stack && (
                      <pre className="text-text-secondary bg-bg-base border-border max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded-md border p-3 text-[11px] leading-normal">
                        {err.stack}
                      </pre>
                    )}
                    {err.context && (
                      <pre className="text-text-secondary bg-bg-base border-border mt-2 max-h-[120px] overflow-auto rounded-md border p-3 text-[11px] leading-normal">
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
            className="text-text-secondary flex items-center justify-center gap-3 py-4"
            style={{ fontSize: 13 }}
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
