"use client";
import { useState } from "react";
import { CurrencyDollar, ChartBar } from "@phosphor-icons/react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CostBreakdownData {
  totalInputTokens?: number;
  totalOutputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalCostUsd?: number;
}

interface CostBreakdownProps {
  session: CostBreakdownData;
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtTokens = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);

const fmtCost = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);

// ── Proportional bar ─────────────────────────────────────────────────────────

interface TokenBarProps {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

function TokenBar({ input, output, cacheCreation, cacheRead }: TokenBarProps) {
  const total = input + output + cacheCreation + cacheRead;
  if (total === 0) return null;

  const inputPct = (input / total) * 100;
  const outputPct = (output / total) * 100;
  const cacheCreationPct = (cacheCreation / total) * 100;
  const cacheReadPct = (cacheRead / total) * 100;

  return (
    <div
      className="flex rounded-sm overflow-hidden"
      style={{ height: 6, gap: 1 }}
      role="img"
      aria-label={`Token distribution: ${Math.round(inputPct)}% input, ${Math.round(outputPct)}% output, ${Math.round(cacheCreationPct + cacheReadPct)}% cache`}
    >
      {inputPct > 0 && (
        <div
          style={{ width: `${inputPct}%`, background: "#4285F4", borderRadius: "2px 0 0 2px" }}
          title={`Input: ${Math.round(inputPct)}%`}
        />
      )}
      {outputPct > 0 && (
        <div
          style={{ width: `${outputPct}%`, background: "#a855f7" }}
          title={`Output: ${Math.round(outputPct)}%`}
        />
      )}
      {cacheCreationPct > 0 && (
        <div
          style={{ width: `${cacheCreationPct}%`, background: "#34A853" }}
          title={`Cache creation: ${Math.round(cacheCreationPct)}%`}
        />
      )}
      {cacheReadPct > 0 && (
        <div
          style={{ width: `${cacheReadPct}%`, background: "#10b981", borderRadius: "0 2px 2px 0" }}
          title={`Cache read: ${Math.round(cacheReadPct)}%`}
        />
      )}
    </div>
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function BreakdownRow({
  label,
  tokens,
  color,
  note,
}: {
  label: string;
  tokens: number;
  color: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span className="text-xs truncate">
          {label}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span
          className="text-xs font-medium"
          style={{
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {fmtTokens(tokens)}
        </span>
        {note && (
          <span
            className="text-xs"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
            }}
          >
            {note}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CostBreakdown({ session, compact = false }: CostBreakdownProps) {
  const [expanded, setExpanded] = useState(!compact);

  const totalCost = session.totalCostUsd ?? 0;
  const inputTokens = session.totalInputTokens ?? 0;
  const outputTokens = session.totalOutputTokens ?? 0;
  const cacheCreation = session.cacheCreationTokens ?? 0;
  const cacheRead = session.cacheReadTokens ?? 0;

  const totalTokens = inputTokens + outputTokens + cacheCreation + cacheRead;
  const hasCacheData = cacheCreation > 0 || cacheRead > 0;

  if (compact) {
    return (
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 cursor-pointer rounded transition-colors"
       
        aria-label={`Cost: ${fmtCost(totalCost)}. Click to expand breakdown`}
        aria-expanded={expanded}
      >
        <CurrencyDollar size={12} weight="bold" aria-hidden="true" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          {fmtCost(totalCost)}
        </span>
      </button>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderLeft: "3px solid #34A853",
      }}
    >
      {/* Header row — click to collapse in expanded mode */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 cursor-pointer transition-colors"
       
        aria-expanded={expanded}
        aria-label="Toggle cost breakdown"
      >
        <CurrencyDollar
          size={16}
          weight="bold"
          style={{ color: "#34A853", flexShrink: 0 }}
          aria-hidden="true"
        />
        <span className="text-xs flex-1 text-left">
          Total Cost
        </span>
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
        >
          {fmtCost(totalCost)}
        </span>
        <span className="text-xs ml-1">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          {/* Token distribution bar */}
          {totalTokens > 0 && (
            <div className="mt-2 mb-3">
              <TokenBar
                input={inputTokens}
                output={outputTokens}
                cacheCreation={cacheCreation}
                cacheRead={cacheRead}
              />
            </div>
          )}

          {/* Rows */}
          <div className="flex flex-col">
            {inputTokens > 0 && <BreakdownRow label="Input" tokens={inputTokens} color="#4285F4" />}
            {outputTokens > 0 && (
              <BreakdownRow label="Output" tokens={outputTokens} color="#a855f7" />
            )}
            {cacheCreation > 0 && (
              <BreakdownRow label="Cache Write" tokens={cacheCreation} color="#34A853" />
            )}
            {cacheRead > 0 && (
              <BreakdownRow
                label="Cache Read"
                tokens={cacheRead}
                color="#10b981"
                note="~90% cheaper"
              />
            )}
            {totalTokens === 0 && (
              <p className="text-xs py-1">
                No token data yet
              </p>
            )}
          </div>

          {/* Legend summary */}
          {hasCacheData && (
            <div
              className="flex items-center gap-1 mt-2 pt-2"
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <ChartBar size={11} aria-hidden="true" />
              <span className="text-xs">
                Cache saved ~{fmtTokens(cacheRead)} tokens at reduced cost
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
