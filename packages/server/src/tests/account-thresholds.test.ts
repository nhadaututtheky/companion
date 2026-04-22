/**
 * Tests for the shared threshold normalization helpers.
 *
 * These are pure functions — no DB, no fetch, no module mocking.
 */

import { describe, test, expect } from "bun:test";
import {
  normalizeThreshold,
  normalizeThresholdPair,
  ACCOUNT_THRESHOLD_MIN,
  ACCOUNT_THRESHOLD_MAX,
  ACCOUNT_THRESHOLD_MIN_GAP,
  DEFAULT_ACCOUNT_WARN_THRESHOLD,
  DEFAULT_ACCOUNT_SWITCH_THRESHOLD,
} from "@companion/shared";

describe("normalizeThreshold", () => {
  test("clamps below MIN and above MAX", () => {
    expect(normalizeThreshold(0.1)).toBe(ACCOUNT_THRESHOLD_MIN);
    expect(normalizeThreshold(1.5)).toBe(ACCOUNT_THRESHOLD_MAX);
  });

  test("snaps to nearest 0.05 step", () => {
    expect(normalizeThreshold(0.73)).toBeCloseTo(0.75, 2);
    expect(normalizeThreshold(0.71)).toBeCloseTo(0.7, 2);
    expect(normalizeThreshold(0.875)).toBeCloseTo(0.9, 2);
  });

  test("NaN / non-finite → MIN", () => {
    expect(normalizeThreshold(Number.NaN)).toBe(ACCOUNT_THRESHOLD_MIN);
    expect(normalizeThreshold(Number.POSITIVE_INFINITY)).toBe(ACCOUNT_THRESHOLD_MAX);
    expect(normalizeThreshold(Number.NEGATIVE_INFINITY)).toBe(ACCOUNT_THRESHOLD_MIN);
  });
});

describe("normalizeThresholdPair", () => {
  test("returns defaults when both inputs missing", () => {
    const { warnThreshold, switchThreshold } = normalizeThresholdPair({});
    expect(warnThreshold).toBe(DEFAULT_ACCOUNT_WARN_THRESHOLD);
    expect(switchThreshold).toBe(DEFAULT_ACCOUNT_SWITCH_THRESHOLD);
  });

  test("snaps both values to step", () => {
    const out = normalizeThresholdPair({ warnThreshold: 0.73, switchThreshold: 0.88 });
    expect(out.warnThreshold).toBeCloseTo(0.75, 2);
    expect(out.switchThreshold).toBeCloseTo(0.9, 2);
  });

  test("min gap enforced — default pulls warn down to keep switch", () => {
    // warn=0.88, switch=0.9 — gap 0.02 < 0.05. Default keeps switch, lowers warn.
    const out = normalizeThresholdPair({ warnThreshold: 0.88, switchThreshold: 0.9 });
    expect(out.switchThreshold).toBeCloseTo(0.9, 2);
    expect(out.warnThreshold).toBeCloseTo(0.85, 2);
    expect(out.switchThreshold - out.warnThreshold).toBeGreaterThanOrEqual(
      ACCOUNT_THRESHOLD_MIN_GAP - 1e-9,
    );
  });

  test("min gap enforced — lastChanged=warn bumps switch up", () => {
    const out = normalizeThresholdPair(
      { warnThreshold: 0.88, switchThreshold: 0.9 },
      { lastChanged: "warn" },
    );
    expect(out.warnThreshold).toBeCloseTo(0.9, 2);
    expect(out.switchThreshold).toBeCloseTo(0.95, 2);
  });

  test("lastChanged=warn at MAX → falls back to pulling warn down", () => {
    // warn=0.95 (at MAX), switch=0.95. Bump path wants switch up, but MAX
    // is saturated → fallback: switch=MAX, warn=MAX-gap=0.9.
    const out = normalizeThresholdPair(
      { warnThreshold: 0.95, switchThreshold: 0.95 },
      { lastChanged: "warn" },
    );
    expect(out.switchThreshold).toBeCloseTo(0.95, 2);
    expect(out.warnThreshold).toBeCloseTo(0.9, 2);
    expect(out.switchThreshold - out.warnThreshold).toBeGreaterThanOrEqual(
      ACCOUNT_THRESHOLD_MIN_GAP - 1e-9,
    );
  });

  test("both equal at MIN — fallback bumps switch up rather than cratering warn below floor", () => {
    const out = normalizeThresholdPair({
      warnThreshold: 0.5,
      switchThreshold: 0.5,
    });
    expect(out.warnThreshold).toBeCloseTo(0.5, 2);
    expect(out.switchThreshold).toBeCloseTo(0.55, 2);
    expect(out.switchThreshold - out.warnThreshold).toBeGreaterThanOrEqual(
      ACCOUNT_THRESHOLD_MIN_GAP - 1e-9,
    );
  });
});
