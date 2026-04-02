/**
 * Tests for license service — pure function logic.
 * Tests: tier ordering, feature checks, getters.
 */

import { describe, test, expect } from "bun:test";
import { isAtLeast, hasFeature, getLicense, getMaxSessions } from "../services/license.js";

describe("license — pure getters", () => {
  // These all rely on the default FREE_LICENSE since no license has been set

  test("getLicense returns free tier by default", () => {
    const license = getLicense();
    expect(license.tier).toBe("free");
    expect(license.valid).toBe(false);
    expect(license.maxSessions).toBe(2);
  });

  test("getMaxSessions returns 2 for free tier", () => {
    expect(getMaxSessions()).toBe(2);
  });

  test("hasFeature returns true for free features", () => {
    expect(hasFeature("web_terminal")).toBe(true);
    expect(hasFeature("basic_commands")).toBe(true);
    expect(hasFeature("telegram_bot")).toBe(true);
    expect(hasFeature("magic_ring")).toBe(true);
    expect(hasFeature("thinking_mode")).toBe(true);
  });

  test("hasFeature returns false for paid features", () => {
    expect(hasFeature("shared_context")).toBe(false);
    expect(hasFeature("web_intel")).toBe(false);
    expect(hasFeature("codegraph")).toBe(false);
    expect(hasFeature("nonexistent_feature")).toBe(false);
  });
});

describe("license — tier ordering", () => {
  // isAtLeast checks the in-memory cached license (defaults to free)

  test("free tier is at least free", () => {
    expect(isAtLeast("free")).toBe(true);
  });

  test("free tier is NOT at least trial", () => {
    expect(isAtLeast("trial")).toBe(false);
  });

  test("free tier is NOT at least starter", () => {
    expect(isAtLeast("starter")).toBe(false);
  });

  test("free tier is NOT at least pro", () => {
    expect(isAtLeast("pro")).toBe(false);
  });
});
