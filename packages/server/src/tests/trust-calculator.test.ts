import { describe, expect, test } from "bun:test";
import {
  calculateTrustWeight,
  transitiveTrust,
  type EdgeType,
} from "../codegraph/trust-calculator.js";

// ─── Base edge type weights ────────────────────────────────────────────────

describe("calculateTrustWeight — base weights", () => {
  const cases: Array<[EdgeType, number]> = [
    ["imports", 0.5],
    ["calls", 0.9],
    ["extends", 0.95],
    ["implements", 0.95],
    ["uses_type", 0.4],
    ["renders_component", 0.8],
    ["routes_to", 0.7],
    ["queries_table", 0.6],
    ["tests", 0.7],
    ["configures", 0.3],
  ];

  for (const [edgeType, expected] of cases) {
    test(`${edgeType} → ${expected}`, () => {
      expect(calculateTrustWeight(edgeType)).toBe(expected);
    });
  }
});

// ─── Context: hasCall ──────────────────────────────────────────────────────

describe("calculateTrustWeight — hasCall context", () => {
  test("imports + hasCall=true → 0.9 (tight coupling)", () => {
    expect(calculateTrustWeight("imports", { hasCall: true })).toBe(0.9);
  });

  test("imports + hasCall=false → base 0.5", () => {
    expect(calculateTrustWeight("imports", { hasCall: false })).toBe(0.5);
  });

  test("imports with no context → base 0.5", () => {
    expect(calculateTrustWeight("imports")).toBe(0.5);
  });

  test("calls + hasCall=true does not change calls weight (hasCall only adjusts imports)", () => {
    // calls base is already 0.9; hasCall only triggers for imports
    expect(calculateTrustWeight("calls", { hasCall: true })).toBe(0.9);
  });
});

// ─── Context: isReExport ───────────────────────────────────────────────────

describe("calculateTrustWeight — isReExport context", () => {
  test("imports + isReExport=true → 0.5 * 0.7 = 0.35", () => {
    expect(calculateTrustWeight("imports", { isReExport: true })).toBe(0.35);
  });

  test("calls + isReExport=true → 0.9 * 0.7 = 0.63", () => {
    expect(calculateTrustWeight("calls", { isReExport: true })).toBe(0.63);
  });

  test("configures + isReExport=true → 0.3 * 0.7 = 0.21", () => {
    expect(calculateTrustWeight("configures", { isReExport: true })).toBe(0.21);
  });

  test("isReExport on a non-import edge type (renders_component) → 0.8 * 0.7 = 0.56", () => {
    expect(calculateTrustWeight("renders_component", { isReExport: true })).toBe(0.56);
  });
});

// ─── Context: hasCall + isReExport combined ────────────────────────────────

describe("calculateTrustWeight — combined context", () => {
  test("imports + hasCall=true + isReExport=true → 0.9 * 0.7 = 0.63", () => {
    // hasCall bumps weight to 0.9, then isReExport multiplies by 0.7
    expect(calculateTrustWeight("imports", { hasCall: true, isReExport: true })).toBe(0.63);
  });
});

// ─── transitiveTrust ──────────────────────────────────────────────────────

describe("transitiveTrust", () => {
  test("empty array → 0", () => {
    expect(transitiveTrust([])).toBe(0);
  });

  test("single weight → that weight", () => {
    expect(transitiveTrust([0.9])).toBe(0.9);
  });

  test("two weights: [0.9, 0.5] → 0.45", () => {
    expect(transitiveTrust([0.9, 0.5])).toBe(0.45);
  });

  test("three weights: [0.9, 0.5, 0.8] → 0.36", () => {
    expect(transitiveTrust([0.9, 0.5, 0.8])).toBeCloseTo(0.36, 10);
  });

  test("all 1.0 weights → 1.0", () => {
    expect(transitiveTrust([1.0, 1.0, 1.0])).toBe(1.0);
  });

  test("weight of 0 short-circuits to 0", () => {
    expect(transitiveTrust([0.9, 0, 0.8])).toBe(0);
  });
});
