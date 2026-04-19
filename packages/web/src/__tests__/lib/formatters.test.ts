/**
 * Unit tests for the shared formatters lib.
 * Locks the contract for tokens, cost, duration, dates, and model labels.
 */

import { describe, it, expect } from "bun:test";
import {
  fmtNumber,
  fmtTokens,
  fmtCost,
  fmtDuration,
  fmtContextWindow,
  fmtDate,
  fmtDateShort,
  fmtTime,
  fmtDateTime,
  fmtDateTimeFull,
  modelShortLabel,
  modelLongLabel,
  modelColor,
} from "../../lib/formatters.js";

// ── numbers ───────────────────────────────────────────────────────────────────

describe("fmtNumber", () => {
  it("inserts thousands separators", () => {
    expect(fmtNumber(1234)).toBe("1,234");
    expect(fmtNumber(1234567)).toBe("1,234,567");
  });
  it("handles 0 and small values", () => {
    expect(fmtNumber(0)).toBe("0");
    expect(fmtNumber(42)).toBe("42");
  });
});

describe("fmtTokens", () => {
  it("compact M for ≥1M", () => {
    expect(fmtTokens(1_500_000)).toBe("1.5M");
    expect(fmtTokens(1_000_000)).toBe("1.0M");
  });
  it("compact k for ≥1k", () => {
    expect(fmtTokens(1500)).toBe("2k");
    expect(fmtTokens(1000)).toBe("1k");
  });
  it("raw for <1000", () => {
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(0)).toBe("0");
  });
});

describe("fmtCost", () => {
  it("$0.00 for zero", () => {
    expect(fmtCost(0)).toBe("$0.00");
  });
  it("<$0.01 for sub-cent", () => {
    expect(fmtCost(0.005)).toBe("<$0.01");
  });
  it("currency for normal amounts", () => {
    expect(fmtCost(1.23)).toBe("$1.23");
    expect(fmtCost(1234.5)).toBe("$1,234.50");
  });
});

describe("fmtDuration", () => {
  it("— for null/non-positive", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(0)).toBe("—");
    expect(fmtDuration(-100)).toBe("—");
  });
  it("seconds when <60s", () => {
    expect(fmtDuration(5_000)).toBe("5s");
    expect(fmtDuration(59_400)).toBe("59s");
  });
  it("Xm Ys when <60m", () => {
    expect(fmtDuration(65_000)).toBe("1m 5s");
    expect(fmtDuration(120_000)).toBe("2m 0s");
  });
  it("Xh Ym when ≥1h", () => {
    expect(fmtDuration(3_600_000)).toBe("1h 0m");
    expect(fmtDuration(3_900_000)).toBe("1h 5m");
  });
});

describe("fmtContextWindow", () => {
  it("M for ≥1M", () => {
    expect(fmtContextWindow(1_000_000)).toBe("1M");
    expect(fmtContextWindow(2_000_000)).toBe("2M");
  });
  it("K for ≥1k", () => {
    expect(fmtContextWindow(200_000)).toBe("200K");
  });
  it("raw for <1000", () => {
    expect(fmtContextWindow(500)).toBe("500");
  });
});

// ── dates ─────────────────────────────────────────────────────────────────────

// Reference: 2026-04-19 14:32:00 UTC. Local-tz dependent assertions are loose.
const REFERENCE_ISO = "2026-04-19T14:32:00Z";

describe("date formatters", () => {
  it("fmtDate includes month/day/year", () => {
    const out = fmtDate(REFERENCE_ISO);
    expect(out).toMatch(/Apr/);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/19/);
  });
  it("fmtDateShort omits year", () => {
    const out = fmtDateShort(REFERENCE_ISO);
    expect(out).toMatch(/Apr/);
    expect(out).not.toMatch(/2026/);
  });
  it("fmtTime is HH:MM 24h", () => {
    const out = fmtTime(REFERENCE_ISO);
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });
  it("fmtDateTime has month + time", () => {
    const out = fmtDateTime(REFERENCE_ISO);
    expect(out).toMatch(/Apr/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
  it("fmtDateTimeFull has year + time", () => {
    const out = fmtDateTimeFull(REFERENCE_ISO);
    expect(out).toMatch(/Apr/);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
  it("returns — for invalid input", () => {
    expect(fmtDate("not-a-date")).toBe("—");
    expect(fmtDate(NaN)).toBe("—");
    expect(fmtTime("garbage")).toBe("—");
  });
  it("accepts Date object, string, and number", () => {
    const ts = new Date(REFERENCE_ISO).getTime();
    expect(fmtDate(new Date(REFERENCE_ISO))).toBe(fmtDate(REFERENCE_ISO));
    expect(fmtDate(ts)).toBe(fmtDate(REFERENCE_ISO));
  });
});

// ── models ────────────────────────────────────────────────────────────────────

describe("modelShortLabel", () => {
  it("Anthropic family", () => {
    expect(modelShortLabel("claude-opus-4-7")).toBe("Opus");
    expect(modelShortLabel("claude-sonnet-4-6")).toBe("Sonnet");
    expect(modelShortLabel("claude-haiku-4-5")).toBe("Haiku");
  });
  it("strips provider prefix", () => {
    expect(modelShortLabel("anthropic/claude-opus-4-7")).toBe("Opus");
    expect(modelShortLabel("openai/gpt-4o")).toBe("GPT-4O");
  });
  it("Gemini / Llama generic family names", () => {
    expect(modelShortLabel("gemini-2-pro")).toBe("Gemini");
    expect(modelShortLabel("meta/llama-3-70b")).toBe("Llama");
  });
  it("o3/o4 uppercased first segment", () => {
    expect(modelShortLabel("o3-mini")).toBe("O3");
    expect(modelShortLabel("o4-preview")).toBe("O4");
  });
  it("unknown family falls back to first dash-segment", () => {
    expect(modelShortLabel("custom-model-id")).toBe("custom");
  });
});

describe("modelLongLabel", () => {
  it("hardcoded Anthropic versions", () => {
    expect(modelLongLabel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(modelLongLabel("claude-opus-4-7")).toBe("Opus 4.7");
    expect(modelLongLabel("claude-opus-4-6")).toBe("Opus 4.6");
    expect(modelLongLabel("claude-opus-something")).toBe("Opus");
    expect(modelLongLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
  });
  it("strips known prefixes for unknowns", () => {
    expect(modelLongLabel("openai/gpt-4o")).toBe("gpt-4o");
    expect(modelLongLabel("anthropic/custom")).toBe("custom");
  });
});

describe("modelColor", () => {
  it("opus = purple, haiku = green, default = blue", () => {
    expect(modelColor("claude-opus-4-7")).toBe("#a78bfa");
    expect(modelColor("claude-haiku-4-5")).toBe("#34a853");
    expect(modelColor("claude-sonnet-4-6")).toBe("#4285f4");
    expect(modelColor("anything-else")).toBe("#4285f4");
  });
});
