"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Z } from "@/lib/z-index";
import { ChartBar, X, ArrowRight } from "@phosphor-icons/react";
import { useSessionStore } from "@/lib/stores/session-store";
import Link from "next/link";

const ACTIVE_STATUSES = ["starting", "running", "waiting", "idle", "busy", "error"];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ── Stats Watermark (collapsed pill → simple active session summary) ──────

export function BottomStatsBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { activeCount, totalCost, totalTurns, totalTokens } = useMemo(() => {
    const active = Object.values(sessions).filter((s) => ACTIVE_STATUSES.includes(s.status));
    return {
      activeCount: active.length,
      totalCost: active.reduce((sum, s) => sum + (s.state?.total_cost_usd ?? 0), 0),
      totalTurns: active.reduce((sum, s) => sum + (s.state?.num_turns ?? 0), 0),
      totalTokens: active.reduce(
        (sum, s) => sum + (s.state?.total_input_tokens ?? 0) + (s.state?.total_output_tokens ?? 0),
        0,
      ),
    };
  }, [sessions]);

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  // Don't render if no active sessions
  if (activeCount === 0) return null;

  return (
    <div
      ref={containerRef}
      className="hidden sm:flex"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: expanded ? Z.statsBar : Z.base,
        pointerEvents: expanded ? "auto" : undefined,
      }}
    >
      {expanded ? (
        /* ── Expanded: simple active session summary ── */
        <div
          className="flex items-stretch"
          style={{
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-float)",
            padding: "2px 6px",
            animation: "slideUpFade 200ms ease forwards",
          }}
        >
          <StatBlock label="Active" value={String(activeCount)} accent="var(--color-success)" />
          <Sep />
          <StatBlock label="Cost" value={fmtCost(totalCost)} accent="#FBBC04" />
          <Sep />
          <StatBlock label="Turns" value={String(totalTurns)} />
          <Sep />
          <StatBlock label="Tokens" value={fmtTokens(totalTokens)} />
          <Sep />

          <Link
            href="/analytics"
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium cursor-pointer"
            style={{ color: "var(--color-accent)" }}
            title="View full analytics"
          >
            Full <ArrowRight size={10} weight="bold" />
          </Link>

          <Sep />

          <button
            onClick={() => setExpanded(false)}
            className="flex items-center justify-center px-2 py-2 cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Close stats"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ) : (
        /* ── Collapsed watermark pill ── */
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-all"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-pill)",
            opacity: 0.4,
            transition: "opacity 200ms ease, transform 200ms ease",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.4";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title="Click to view stats"
          aria-label="Session stats"
        >
          <ChartBar size={12} weight="bold" />
          {fmtCost(totalCost)}
        </button>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2">
      <span
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-sm font-bold tabular-nums leading-none"
        style={{ fontFamily: "var(--font-mono)", color: accent ?? "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="w-px self-stretch my-2" style={{ background: "var(--glass-border)" }} />;
}
