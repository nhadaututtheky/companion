/**
 * Shared display formatters used across web pages and components.
 *
 * Conventions:
 *   - Locale: hardcode `en-US` to match the existing UI. i18n is future work.
 *   - Intl.* instances are module-level — they are expensive to construct.
 *   - Functions return strings, never throw. Invalid input → fallback string.
 */

// ── Numbers ────────────────────────────────────────────────────────────────

const NUMBER_FMT = new Intl.NumberFormat("en-US");

const CURRENCY_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1234567` → `"1,234,567"` */
export function fmtNumber(n: number): string {
  return NUMBER_FMT.format(n);
}

/** Compact: `1500` → `"2k"`, `1_500_000` → `"1.5M"`, `< 1000` → as-is. */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

/** `0` → `"$0.00"`, `<0.01` → `"<$0.01"`, else USD currency. */
export function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return CURRENCY_USD.format(n);
}

/** `null|<=0` → `"—"`, `<60s` → `"Xs"`, `<60m` → `"Xm Ys"`, else `"Xh Ym"`. */
export function fmtDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
}

/** Token-count display, matches model-bar convention: `1500` → `"2K"`, `1_000_000` → `"1M"`. */
export function fmtContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

// ── Dates ──────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_SHORT_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_FULL_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type DateInput = Date | string | number;

function toDate(d: DateInput): Date | null {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `Apr 19, 2026` */
export function fmtDate(d: DateInput): string {
  const date = toDate(d);
  return date ? DATE_FMT.format(date) : "—";
}

/** `Apr 19` (no year) — for compact lists where year is implicit. */
export function fmtDateShort(d: DateInput): string {
  const date = toDate(d);
  return date ? DATE_SHORT_FMT.format(date) : "—";
}

/** `14:32` (24h) */
export function fmtTime(d: DateInput): string {
  const date = toDate(d);
  return date ? TIME_FMT.format(date) : "—";
}

/** `Apr 19, 14:32` */
export function fmtDateTime(d: DateInput): string {
  const date = toDate(d);
  return date ? DATE_TIME_FMT.format(date) : "—";
}

/** `Apr 19, 2026, 14:32` */
export function fmtDateTimeFull(d: DateInput): string {
  const date = toDate(d);
  return date ? DATE_TIME_FULL_FMT.format(date) : "—";
}

// ── Models ─────────────────────────────────────────────────────────────────

/** Strip provider prefix: `anthropic/claude-...` → `claude-...`, `openai/gpt-4o` → `gpt-4o`. */
function stripProviderPrefix(model: string): string {
  return model.includes("/") ? model.split("/").pop()! : model;
}

/**
 * Short, version-less family name. Used in chips, badges, compact lists.
 *
 *   `claude-opus-4-7`        → `"Opus"`
 *   `claude-sonnet-4-6`      → `"Sonnet"`
 *   `claude-haiku-4-5`       → `"Haiku"`
 *   `openai/gpt-4o`          → `"GPT-4O"`
 *   `gemini-2-pro`           → `"Gemini"`
 *   `meta/llama-3-70b`       → `"Llama"`
 *   `o3-mini`                → `"O3"`
 *   anything else            → first dash-segment
 */
export function modelShortLabel(model: string): string {
  const name = stripProviderPrefix(model);
  if (name.includes("opus")) return "Opus";
  if (name.includes("haiku")) return "Haiku";
  if (name.includes("sonnet")) return "Sonnet";
  if (name.includes("gpt")) return name.split("-").slice(0, 2).join("-").toUpperCase();
  if (name.includes("gemini")) return "Gemini";
  if (name.includes("llama")) return "Llama";
  if (name.startsWith("o3") || name.startsWith("o4")) {
    return name.split("-")[0]!.toUpperCase();
  }
  return name.split("-")[0]!;
}

/**
 * Versioned label for the active session model bar.
 *
 *   `claude-sonnet-4-6`        → `"Sonnet 4.6"`
 *   `claude-opus-4-7`          → `"Opus 4.7"`
 *   `claude-opus-4-6`          → `"Opus 4.6"`
 *   `claude-opus-something`    → `"Opus"`
 *   `claude-haiku-4-5`         → `"Haiku 4.5"`
 *   anything else              → strip common prefixes
 */
export function modelLongLabel(model: string): string {
  if (model.includes("sonnet")) return "Sonnet 4.6";
  if (model.includes("opus") && model.includes("4-7")) return "Opus 4.7";
  if (model.includes("opus") && model.includes("4-6")) return "Opus 4.6";
  if (model.includes("opus")) return "Opus";
  if (model.includes("haiku")) return "Haiku 4.5";
  return model.replace(/^(claude-|openai\/|anthropic\/)/, "");
}

/** Brand color for model family — used in chips, charts, model bar. */
export function modelColor(model: string): string {
  if (model.includes("opus")) return "#a78bfa";
  if (model.includes("haiku")) return "#34a853";
  return "#4285f4";
}
