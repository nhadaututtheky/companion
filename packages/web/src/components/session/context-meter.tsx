"use client";

interface ContextMeterProps {
  inputTokens: number;
  outputTokens: number;
  maxTokens?: number;
}

const MAX_TOKENS = 200_000; // claude default

function formatK(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export function ContextMeter({
  inputTokens,
  outputTokens,
  maxTokens = MAX_TOKENS,
}: ContextMeterProps) {
  const total = inputTokens + outputTokens;
  const pct = Math.min((total / maxTokens) * 100, 100);

  const color =
    pct < 60 ? "#34A853" :
    pct < 85 ? "#FBBC04" :
    "#EA4335";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Context
        </span>
        <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
          {formatK(total)} / {formatK(maxTokens)}
        </span>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 4, background: "var(--color-bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
