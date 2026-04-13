/**
 * Tests for IdleDetector — activity tracking, idle callback, dedup window.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { IdleDetector } from "../services/idle-detector.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Short threshold used across tests to keep suite fast */
const THRESHOLD = 60;

describe("IdleDetector", () => {
  let detector: IdleDetector;

  beforeEach(() => {
    // Stop any leftover timers from a previous test
    detector?.stopAll();
    detector = new IdleDetector({ thresholdMs: THRESHOLD });
  });

  // ── 1. recordOutput starts tracking ──────────────────────────────────────
  test("recordOutput registers the session and stores a timestamp", () => {
    const before = Date.now();
    detector.recordOutput("s1");
    const ts = detector.getLastOutputAt("s1");

    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  // ── 2. getLastOutputAt returns undefined for unknown session ───────────────
  test("getLastOutputAt returns undefined for an untracked session", () => {
    expect(detector.getLastOutputAt("ghost")).toBeUndefined();
  });

  // ── 3. Idle callback fires after threshold ────────────────────────────────
  test("idle callback fires after threshold elapses", async () => {
    const fired: string[] = [];
    detector.setCallback((id) => fired.push(id));

    detector.recordOutput("s-fire");
    await sleep(THRESHOLD + 40);

    expect(fired).toContain("s-fire");
  });

  // ── 4. idleDurationMs passed to callback is positive ─────────────────────
  test("idle callback receives a positive idleDurationMs", async () => {
    let duration = -1;
    detector.setCallback((_, ms) => {
      duration = ms;
    });

    detector.recordOutput("s-dur");
    await sleep(THRESHOLD + 100);

    expect(duration).toBeGreaterThan(0);
  });

  // ── 5. recordOutput resets the idle timer ────────────────────────────────
  test("recordOutput resets the timer so callback does not fire prematurely", async () => {
    const fired: string[] = [];
    detector.setCallback((id) => fired.push(id));

    detector.recordOutput("s-reset");
    await sleep(THRESHOLD / 2); // halfway
    detector.recordOutput("s-reset"); // reset
    await sleep(THRESHOLD / 2); // still before the new deadline

    expect(fired).not.toContain("s-reset");

    // Let the new threshold expire so the timer doesn't leak
    await sleep(THRESHOLD + 20);
    detector.stopTracking("s-reset");
  });

  // ── 6. stopTracking prevents the callback from firing ────────────────────
  test("stopTracking cancels the idle timer", async () => {
    const fired: string[] = [];
    detector.setCallback((id) => fired.push(id));

    detector.recordOutput("s-stop");
    detector.stopTracking("s-stop");
    await sleep(THRESHOLD + 40);

    expect(fired).not.toContain("s-stop");
  });

  // ── 7. stopTracking removes the session record ────────────────────────────
  test("stopTracking removes the session so getLastOutputAt returns undefined", () => {
    detector.recordOutput("s-rm");
    detector.stopTracking("s-rm");

    expect(detector.getLastOutputAt("s-rm")).toBeUndefined();
  });

  // ── 8. stopAll clears all sessions ───────────────────────────────────────
  test("stopAll prevents all callbacks and clears all sessions", async () => {
    const fired: string[] = [];
    detector.setCallback((id) => fired.push(id));

    detector.recordOutput("a1");
    detector.recordOutput("a2");
    detector.stopAll();
    await sleep(THRESHOLD + 40);

    expect(fired).toHaveLength(0);
    expect(detector.getLastOutputAt("a1")).toBeUndefined();
    expect(detector.getLastOutputAt("a2")).toBeUndefined();
  });

  // ── 9. setCallback replaces the previous callback ────────────────────────
  test("setCallback changes the active callback", async () => {
    const first: string[] = [];
    const second: string[] = [];

    detector.setCallback((id) => first.push(id));
    detector.setCallback((id) => second.push(id));

    detector.recordOutput("s-cb");
    await sleep(THRESHOLD + 100);

    expect(first).not.toContain("s-cb");
    expect(second).toContain("s-cb");
  });

  // ── 10. Multiple sessions tracked independently ───────────────────────────
  test("multiple sessions track independently", async () => {
    const fired: string[] = [];
    detector.setCallback((id) => fired.push(id));

    detector.recordOutput("m1");
    detector.recordOutput("m2");
    detector.stopTracking("m1"); // only m2 should fire
    await sleep(THRESHOLD + 40);

    expect(fired).not.toContain("m1");
    expect(fired).toContain("m2");
  });

  // ── 11. Dedup: callback does not fire twice within 5s window ─────────────
  test("dedup window prevents a second idle notification within 5 s", async () => {
    // Use a very short threshold so we can trigger idle quickly.
    // The dedup window is hard-coded at 5000 ms in the implementation,
    // so we only verify the second fire is suppressed within that window.
    const fast = new IdleDetector({ thresholdMs: 50 });
    const calls: number[] = [];
    fast.setCallback(() => calls.push(Date.now()));

    // First idle fire
    fast.recordOutput("dup");
    await sleep(100); // first idle fires

    const countAfterFirst = calls.length;
    expect(countAfterFirst).toBe(1);

    // Trigger another cycle immediately — still within the 5 s dedup window
    fast.recordOutput("dup");
    await sleep(100); // threshold elapsed again

    // Should NOT have fired a second time
    expect(calls.length).toBe(1);

    fast.stopAll();
  });
});
