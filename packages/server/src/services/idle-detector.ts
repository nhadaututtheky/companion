/**
 * IdleDetector — Tracks session output activity and emits idle events.
 * Detects when an AI agent finishes working (no output for threshold period).
 */

import { createLogger } from "../logger.js";

const log = createLogger("idle-detector");

/** Threshold for considering a session idle (agent finished) */
const DEFAULT_IDLE_THRESHOLD_MS = 2_000;

/** Minimum time between duplicate idle notifications */
const DEDUP_WINDOW_MS = 5_000;

export type IdleCallback = (sessionId: string, idleDurationMs: number) => void;

interface SessionTracker {
  lastOutputAt: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastNotifiedAt: number;
}

export class IdleDetector {
  private trackers = new Map<string, SessionTracker>();
  private readonly thresholdMs: number;
  private onIdle?: IdleCallback;

  constructor(opts?: { thresholdMs?: number; onIdle?: IdleCallback }) {
    this.thresholdMs = opts?.thresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
    this.onIdle = opts?.onIdle;
  }

  /**
   * Set the idle callback.
   */
  setCallback(cb: IdleCallback): void {
    this.onIdle = cb;
  }

  /**
   * Record output activity for a session. Resets the idle timer.
   */
  recordOutput(sessionId: string): void {
    let tracker = this.trackers.get(sessionId);

    if (!tracker) {
      tracker = { lastOutputAt: Date.now(), idleTimer: null, lastNotifiedAt: 0 };
      this.trackers.set(sessionId, tracker);
    }

    tracker.lastOutputAt = Date.now();

    // Reset idle timer
    if (tracker.idleTimer) clearTimeout(tracker.idleTimer);

    tracker.idleTimer = setTimeout(() => {
      this.checkIdle(sessionId);
    }, this.thresholdMs);
  }

  /**
   * Stop tracking a session (called when session ends).
   */
  stopTracking(sessionId: string): void {
    const tracker = this.trackers.get(sessionId);
    if (tracker?.idleTimer) clearTimeout(tracker.idleTimer);
    this.trackers.delete(sessionId);
  }

  /**
   * Get the last output timestamp for a session.
   */
  getLastOutputAt(sessionId: string): number | undefined {
    return this.trackers.get(sessionId)?.lastOutputAt;
  }

  /**
   * Stop all tracking (for shutdown).
   */
  stopAll(): void {
    for (const [, tracker] of this.trackers) {
      if (tracker.idleTimer) clearTimeout(tracker.idleTimer);
    }
    this.trackers.clear();
  }

  private checkIdle(sessionId: string): void {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) return;

    const now = Date.now();
    const idleDuration = now - tracker.lastOutputAt;

    // Must be idle for at least the threshold
    if (idleDuration < this.thresholdMs) return;

    // Dedup: don't fire again within DEDUP_WINDOW_MS
    if (now - tracker.lastNotifiedAt < DEDUP_WINDOW_MS) return;

    tracker.lastNotifiedAt = now;
    log.debug("Session idle detected", { sessionId, idleDurationMs: idleDuration });

    this.onIdle?.(sessionId, idleDuration);
  }
}
