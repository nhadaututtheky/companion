"use client";

interface ContextMeterProps {
  inputTokens: number;
  outputTokens: number;
  maxTokens?: number;
}

const MAX_TOKENS = 200_000; // claude default

function formatK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
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
  const inputPct = maxTokens > 0 ? Math.min((inputTokens / maxTokens) * 100, 100) : 0;
  const outputPct = maxTokens > 0 ? Math.min((outputTokens / maxTokens) * 100, pct) : 0;

  const color = pct < 60 ? "#34A853" : pct < 85 ? "#FBBC04" : "#EA4335";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">Context</span>
        <span className="text-xs font-mono">
          {formatK(total)} / {formatK(maxTokens)}
        </span>
      </div>
      {/* Stacked progress bar: input (blue) + output (purple) */}
      <div
        className="w-full rounded-full overflow-hidden flex bg-bg-elevated" style={{ height: 4 }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${inputPct}%`, background: "#4285F4" }}
          title={`Input: ${formatK(inputTokens)}`}
        />
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${outputPct}%`, background: "#A855F7" }}
          title={`Output: ${formatK(outputTokens)}`}
        />
      </div>
      {/* Token breakdown legend */}
      <div className="flex items-center gap-3 mt-1.5">
        <div className="flex items-center gap-1">
          <span
            className="inline-block" style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: "#4285F4",
              }}
          />
          <span className="text-xs font-mono">{formatK(inputTokens)} in</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block" style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: "#A855F7",
              }}
          />
          <span className="text-xs font-mono">{formatK(outputTokens)} out</span>
        </div>
        {pct > 0 && (
          <span className="text-xs font-mono ml-auto" style={{ color }}>
            {Math.round(pct)}%
          </span>
        )}
      </div>
    </div>
  );
}
