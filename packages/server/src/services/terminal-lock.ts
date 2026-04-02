/**
 * TerminalLock — Prevents concurrent writes to the same CLI session.
 * Implements acquire/release with configurable timeout to prevent deadlocks.
 */

import { createLogger } from "../logger.js";

const log = createLogger("terminal-lock");

/** Default maximum time a lock can be held (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

interface LockEntry {
  owner: string;
  acquiredAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export class TerminalLock {
  private locks = new Map<string, LockEntry>();
  private waitQueues = new Map<
    string,
    Array<{
      owner: string;
      resolve: () => void;
      reject: (err: Error) => void;
    }>
  >();
  private readonly timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Acquire the lock for a session. Resolves when the lock is acquired.
   * Rejects if the wait exceeds timeout.
   */
  async acquire(sessionId: string, owner: string): Promise<void> {
    const existing = this.locks.get(sessionId);

    if (!existing) {
      this.setLock(sessionId, owner);
      return;
    }

    // Same owner re-acquiring is a no-op
    if (existing.owner === owner) return;

    // Wait in queue
    return new Promise<void>((resolve, reject) => {
      const queue = this.waitQueues.get(sessionId) ?? [];
      queue.push({ owner, resolve, reject });
      this.waitQueues.set(sessionId, queue);

      // Reject if waiting too long
      setTimeout(() => {
        const q = this.waitQueues.get(sessionId);
        if (q) {
          const idx = q.findIndex((e) => e.owner === owner);
          if (idx !== -1) {
            q.splice(idx, 1);
            reject(
              new Error(`TerminalLock timeout: ${owner} waited too long for session ${sessionId}`),
            );
          }
        }
      }, this.timeoutMs);
    });
  }

  /**
   * Release the lock for a session. Passes lock to next waiter if any.
   */
  release(sessionId: string, owner: string): void {
    const existing = this.locks.get(sessionId);
    if (!existing || existing.owner !== owner) return;

    clearTimeout(existing.timeoutHandle);
    this.locks.delete(sessionId);

    // Pass to next waiter
    const queue = this.waitQueues.get(sessionId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waitQueues.delete(sessionId);
      this.setLock(sessionId, next.owner);
      next.resolve();
    }
  }

  /**
   * Check if a session is currently locked.
   */
  isLocked(sessionId: string): boolean {
    return this.locks.has(sessionId);
  }

  /**
   * Get lock info for a session (for UI display).
   */
  getLockInfo(sessionId: string): { owner: string; acquiredAt: number; queueSize: number } | null {
    const lock = this.locks.get(sessionId);
    if (!lock) return null;

    const queueSize = this.waitQueues.get(sessionId)?.length ?? 0;
    return { owner: lock.owner, acquiredAt: lock.acquiredAt, queueSize };
  }

  /**
   * Force-release all locks (for shutdown).
   */
  releaseAll(): void {
    for (const [, entry] of this.locks) {
      clearTimeout(entry.timeoutHandle);
    }
    this.locks.clear();

    for (const [, queue] of this.waitQueues) {
      for (const waiter of queue) {
        waiter.reject(new Error("TerminalLock: all locks released (shutdown)"));
      }
    }
    this.waitQueues.clear();
  }

  private setLock(sessionId: string, owner: string): void {
    const timeoutHandle = setTimeout(() => {
      log.warn("Lock timeout — force releasing", { sessionId, owner });
      this.release(sessionId, owner);
    }, this.timeoutMs);

    this.locks.set(sessionId, {
      owner,
      acquiredAt: Date.now(),
      timeoutHandle,
    });

    log.debug("Lock acquired", { sessionId, owner });
  }
}

/** Singleton instance */
export const terminalLock = new TerminalLock();
