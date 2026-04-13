"use client";

import { useState, useEffect, useRef } from "react";
import { Z } from "@/lib/z-index";
import { ChartBar, X, ArrowRight } from "@phosphor-icons/react";
import { useSessionStore } from "@/lib/stores/session-store";
import { useShallow } from "zustand/react/shallow";
import Link from "next/link";

const ACTIVE_STATUSES = new Set(["starting", "running", "waiting", "idle", "busy", "error"]);

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
  const { activeCount, totalCost, totalTurns, totalTokens } = useSessionStore(
    useShallow((s) => {
      let activeCount = 0;
      let totalCost = 0;
      let totalTurns = 0;
      let totalTokens = 0;
      for (const sess of Object.values(s.sessions)) {
        if (ACTIVE_STATUSES.has(sess.status)) {
          activeCount++;
          totalCost += sess.state?.total_cost_usd ?? 0;
          totalTurns += sess.state?.num_turns ?? 0;
          totalTokens +=
            (sess.state?.total_input_tokens ?? 0) + (sess.state?.total_output_tokens ?? 0);
        }
      }
      return { activeCount, totalCost: Math.round(totalCost * 100) / 100, totalTurns, totalTokens };
    }),
  );
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      className="absolute hidden sm:flex"
      style={{
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
          className="shadow-soft flex items-stretch rounded-xl"
          style={{
            background: "var(--glass-bg-heavy)",
            backdropFilter: "blur(var(--glass-blur))",
            WebkitBackdropFilter: "blur(var(--glass-blur))",
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
            className="text-accent flex cursor-pointer items-center gap-1 px-3 py-2 text-xs font-medium"
            title="View full analytics"
          >
            Full <ArrowRight size={10} weight="bold" />
          </Link>

          <Sep />

          <button
            onClick={() => setExpanded(false)}
            className="text-text-muted flex cursor-pointer items-center justify-center px-2 py-2"
            aria-label="Close stats"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      ) : (
        /* ── Collapsed watermark pill ── */
        <button
          onClick={() => setExpanded(true)}
          className="text-text-muted shadow-soft flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-mono font-semibold transition-all"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur-sm))",
            WebkitBackdropFilter: "blur(var(--glass-blur-sm))",
            opacity: 0.4,
            transition: "opacity 200ms ease, transform 200ms ease",
            fontSize: 12,
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
      <span className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
        {label}
      </span>
      <span
        className="font-mono text-sm font-bold tabular-nums leading-none"
        style={{ color: accent ?? "var(--color-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="my-2 w-px self-stretch" style={{ background: "var(--glass-border)" }} />;
}
