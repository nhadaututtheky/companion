/**
 * Tests for DebouncedWriter — push/flush mechanics, debounce timer, batch size.
 */

import { describe, test, expect } from "bun:test";
import { DebouncedWriter } from "../services/debounced-writer.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Short delay used across tests to keep the suite fast */
const DELAY = 60;

describe("DebouncedWriter", () => {
  // ── 1. push + flush: items reach flushFn ─────────────────────────────────
  test("flush() sends all pushed items to flushFn", () => {
    const received: number[][] = [];
    const writer = new DebouncedWriter<number>({
      flushFn: (items) => received.push(items),
      delayMs: DELAY,
    });

    writer.push(1);
    writer.push(2);
    writer.push(3);
    writer.flush();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([1, 2, 3]);
  });

  // ── 2. pending tracks buffered count ────────────────────────────────────
  test("pending reflects the number of buffered items", () => {
    const writer = new DebouncedWriter<string>({
      flushFn: () => {},
      delayMs: DELAY,
    });

    expect(writer.pending).toBe(0);
    writer.push("a");
    expect(writer.pending).toBe(1);
    writer.push("b");
    expect(writer.pending).toBe(2);
  });

  // ── 3. flush empties buffer → pending becomes 0 ───────────────────────────
  test("flush() empties the buffer so pending becomes 0", () => {
    const writer = new DebouncedWriter<number>({
      flushFn: () => {},
      delayMs: DELAY,
    });

    writer.push(10);
    writer.push(20);
    writer.flush();

    expect(writer.pending).toBe(0);
  });

  // ── 4. Auto-flush fires after the debounce delay ─────────────────────────
  test("items are flushed automatically after delayMs elapses", async () => {
    const received: number[][] = [];
    const writer = new DebouncedWriter<number>({
      flushFn: (items) => received.push(items),
      delayMs: DELAY,
    });

    writer.push(42);
    expect(received).toHaveLength(0); // not yet

    await sleep(DELAY + 40);

    expect(received).toHaveLength(1);
    expect(received[0]).toContain(42);
  });

  // ── 5. Each push resets the debounce timer ────────────────────────────────
  test("push resets timer: only 1 flush fires after final push's delay", async () => {
    const calls: number[] = [];
    const writer = new DebouncedWriter<number>({
      flushFn: (items) => calls.push(items.length),
      delayMs: DELAY,
    });

    writer.push(1);
    await sleep(DELAY / 2); // halfway through first timer
    writer.push(2);         // resets timer
    await sleep(DELAY / 2); // still before the new deadline

    expect(calls).toHaveLength(0); // no flush yet

    await sleep(DELAY + 20); // now the new timer fires

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(2); // both items in one batch
  });

  // ── 6. Max batch size triggers an immediate flush ─────────────────────────
  test("reaching maxBatchSize triggers an immediate flush", () => {
    const received: string[][] = [];
    const MAX = 5;
    const writer = new DebouncedWriter<string>({
      flushFn: (items) => received.push(items),
      delayMs: 10_000, // very long delay — should never fire naturally
      maxBatchSize: MAX,
    });

    for (let i = 0; i < MAX; i++) writer.push(`item-${i}`);

    // Flush must have occurred synchronously (no await needed)
    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(MAX);
    expect(writer.pending).toBe(0);
  });

  // ── 7. flush() on empty buffer is a no-op ────────────────────────────────
  test("flush() on empty buffer does not call flushFn", () => {
    let called = false;
    const writer = new DebouncedWriter<number>({
      flushFn: () => { called = true; },
      delayMs: DELAY,
    });

    writer.flush(); // buffer is empty

    expect(called).toBe(false);
  });

  // ── 8. Multiple manual flushes pass the correct batches ──────────────────
  test("multiple flush calls each receive their own batch", () => {
    const received: number[][] = [];
    const writer = new DebouncedWriter<number>({
      flushFn: (items) => received.push([...items]),
      delayMs: DELAY,
    });

    writer.push(1);
    writer.push(2);
    writer.flush(); // batch 1: [1, 2]

    writer.push(3);
    writer.flush(); // batch 2: [3]

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual([1, 2]);
    expect(received[1]).toEqual([3]);
  });

  // ── 9. flushFn error is caught and does not throw ────────────────────────
  test("errors thrown by flushFn are caught and do not propagate", () => {
    const writer = new DebouncedWriter<number>({
      flushFn: () => { throw new Error("write failed"); },
      delayMs: DELAY,
    });

    writer.push(99);

    expect(() => writer.flush()).not.toThrow();
  });

  // ── 10. label option is accepted without error ───────────────────────────
  test("label option is accepted and writer works normally", () => {
    const received: string[][] = [];
    const writer = new DebouncedWriter<string>({
      flushFn: (items) => received.push(items),
      label: "test-writer",
      delayMs: DELAY,
    });

    writer.push("hello");
    writer.flush();

    expect(received[0]).toEqual(["hello"]);
  });
});
