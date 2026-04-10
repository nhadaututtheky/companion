"use client";

import { useState, useMemo } from "react";
import { Heartbeat } from "@phosphor-icons/react";
import {
  usePulseStore,
  getPulseColor,
  getTrendArrow,
  getStateLabel,
  type PulseReading,
} from "@/lib/stores/pulse-store";

interface PulseIndicatorProps {
  sessionId: string;
}

/** Compact pulse dot + score for session header */
export function PulseIndicator({ sessionId }: PulseIndicatorProps) {
  const reading = usePulseStore((s) => s.readings.get(sessionId));
  const history = usePulseStore((s) => s.history.get(sessionId));
  const [showSparkline, setShowSparkline] = useState(false);

  if (!reading) return null;

  const color = getPulseColor(reading.score);
  const arrow = getTrendArrow(reading.trend);
  const label = getStateLabel(reading.state);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setShowSparkline((v) => !v)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all"
        style={{
          background: `${color}15`,
          border: `1px solid ${color}40`,
        }}
        title={`Pulse: ${label} (${reading.score}/100) ${arrow} — click for history`}
        aria-label={`Agent pulse: ${label}, score ${reading.score}`}
      >
        <Heartbeat
          size={12}
          weight="fill"
          style={{ color }}
          className={reading.score > 40 ? "animate-pulse" : ""}
        />
        <span
          className="text-xs font-mono font-bold"
          style={{ color, fontSize: 10, lineHeight: 1 }}
        >
          {reading.score}
        </span>
        {reading.trend !== "stable" && <span style={{ color, fontSize: 9 }}>{arrow}</span>}
      </button>

      {/* Sparkline popover */}
      {showSparkline && history && history.length > 1 && (
        <div
          className="absolute top-full right-0 mt-1 p-2 rounded-lg z-50"
          style={{
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            minWidth: 160,
          }}
        >
          <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
            {label} · Turn {reading.turn}
          </div>
          <Sparkline readings={history} sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}

/** SVG sparkline of pulse history */
function Sparkline({ readings, sessionId }: { readings: PulseReading[]; sessionId: string }) {
  const { points, gradientStops } = useMemo(() => {
    const width = 140;
    const height = 28;
    const padding = 2;

    const scores = readings.map((r) => r.score);
    const maxScore = Math.max(...scores, 100);

    const pts = scores.map((score, i) => {
      const x = padding + (i / Math.max(scores.length - 1, 1)) * (width - 2 * padding);
      const y = height - padding - (score / maxScore) * (height - 2 * padding);
      return `${x},${y}`;
    });

    // Gradient stops based on score thresholds
    const stops = [
      { offset: "0%", color: "#10B981" },
      { offset: "40%", color: "#F59E0B" },
      { offset: "70%", color: "#EF4444" },
      { offset: "100%", color: "#DC2626" },
    ];

    return { points: pts, gradientStops: stops };
  }, [readings]);

  return (
    <svg width={140} height={28} className="block">
      <defs>
        <linearGradient id={`pulse-grad-${sessionId.slice(0, 8)}`} x1="0" y1="1" x2="0" y2="0">
          {gradientStops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      {/* Threshold lines */}
      <line
        x1={2}
        y1={28 - 2 - (40 / 100) * 24}
        x2={138}
        y2={28 - 2 - (40 / 100) * 24}
        stroke="var(--color-border)"
        strokeWidth={0.5}
        strokeDasharray="2,2"
      />
      <line
        x1={2}
        y1={28 - 2 - (60 / 100) * 24}
        x2={138}
        y2={28 - 2 - (60 / 100) * 24}
        stroke="#EF444440"
        strokeWidth={0.5}
        strokeDasharray="2,2"
      />
      <polyline
        fill="none"
        stroke={`url(#pulse-grad-${sessionId.slice(0, 8)})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}
