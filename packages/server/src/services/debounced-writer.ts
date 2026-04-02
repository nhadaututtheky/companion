/**
 * DebouncedWriter — Batches DB writes to reduce disk I/O.
 * Collects items and flushes them in bulk after a configurable delay.
 * Supports forced flush on shutdown.
 */

import { createLogger } from "../logger.js";

const log = createLogger("debounced-writer");

/** Default flush delay in milliseconds */
const DEFAULT_DELAY_MS = 500;

/** Maximum items before forcing an immediate flush */
const DEFAULT_MAX_BATCH_SIZE = 50;

export class DebouncedWriter<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly delayMs: number;
  private readonly maxBatchSize: number;
  private readonly flushFn: (items: T[]) => void;
  private readonly label: string;

  constructor(opts: {
    flushFn: (items: T[]) => void;
    label?: string;
    delayMs?: number;
    maxBatchSize?: number;
  }) {
    this.flushFn = opts.flushFn;
    this.label = opts.label ?? "debounced-writer";
    this.delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
    this.maxBatchSize = opts.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  }

  /**
   * Add an item to the buffer. Starts/resets the flush timer.
   */
  push(item: T): void {
    this.buffer.push(item);

    // Force immediate flush if batch size exceeded
    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
      return;
    }

    // Reset debounce timer
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /**
   * Immediately flush all buffered items. Safe to call multiple times.
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const items = this.buffer;
    this.buffer = [];

    try {
      this.flushFn(items);
      log.debug(`Flushed ${items.length} items`, { label: this.label });
    } catch (err) {
      log.error(`Flush failed for ${this.label}`, { count: items.length, error: String(err) });
    }
  }

  /**
   * Number of items currently buffered.
   */
  get pending(): number {
    return this.buffer.length;
  }
}
