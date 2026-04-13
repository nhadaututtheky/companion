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

const PULSE_GUIDANCE: Record<string, { advice: string; action?: string }> = {
  flow: { advice: "Agent is productive. No action needed." },
  focused: { advice: "Deep thinking in progress. Let it work." },
  cautious: {
    advice: "Editing same files repeatedly — possible fix loop.",
    action: "Consider giving clearer instructions or a different approach.",
  },
  struggling: {
    advice: "High error rate or cost spike detected.",
    action: "Try: /compact to free context, simplify the task, or switch model.",
  },
  spiraling: {
    advice: "Agent is stuck in a failure loop.",
    action: "Stop and restart with a fresh approach. Break the task into smaller steps.",
  },
  blocked: {
    advice: "Agent flagged as blocked.",
    action: "Check permissions, review errors, or provide missing context.",
  },
};

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
          className="absolute top-full right-0 mt-1 p-2.5 rounded-lg z-50 flex flex-col gap-2 bg-bg-elevated shadow-lg border border-glass-border" style={{
            boxShadow: "var(--shadow-lg)",
            minWidth: 200,
            maxWidth: 260,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color }}>
              {label}
            </span>
            <span className="text-xs font-mono text-text-muted">
              Turn {reading.turn}
            </span>
          </div>
          {history.length > 1 && <Sparkline readings={history} sessionId={sessionId} />}
          {/* Actionable guidance */}
          {(() => {
            const guide = PULSE_GUIDANCE[reading.state];
            if (!guide) return null;
            return (
              <div className="flex flex-col gap-1">
                <p
                  className="text-[11px] leading-snug text-text-secondary"
                >
                  {guide.advice}
                </p>
                {guide.action && (
                  <p className="text-[11px] leading-snug font-medium" style={{ color }}>
                    → {guide.action}
                  </p>
                )}
              </div>
            );
          })()}
          {/* Top signal */}
          {reading.topSignal && (
            <div
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: `${color}10`,
                color: "var(--color-text-muted)",
              }}
            >
              Top signal:{" "}
              {reading.topSignal
                .replace(/([A-Z])/g, " $1")
                .trim()
                .toLowerCase()}
            </div>
          )}
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
