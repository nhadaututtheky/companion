/**
 * WsBridge health check and idle timer management — extracted from ws-bridge.ts.
 * Handles process liveness checks, cleanup sweeps, idle auto-kill, and lock status broadcast.
 */

import { createLogger } from "../logger.js";
import { broadcastToAll } from "./ws-broadcast.js";
import { terminalLock } from "./terminal-lock.js";
import { getActiveSession, getAllActiveSessions, removeActiveSession } from "./session-store.js";
import { HEALTH_CHECK_INTERVAL_MS } from "@companion/shared";
import type { ActiveSession } from "./session-store.js";
import type { BrowserIncomingMessage, CLIProcess } from "@companion/shared";
import type { RTKPipeline } from "../rtk/index.js";

const log = createLogger("ws-health-idle");

// ─── Bridge Interface ────────────────────────────────────────────────────────

export interface HealthIdleBridge {
  broadcastToAll: (session: ActiveSession, msg: BrowserIncomingMessage) => void;
  killSession: (sessionId: string) => void;
  handleCLIExit: (session: ActiveSession, code: number) => void;
  getCliProcess: (sessionId: string) => CLIProcess | undefined;
  getRtkPipeline: () => RTKPipeline;
}

// ─── Session Settings (re-exported so ws-bridge.ts can reference the types) ─

export interface SessionSettings {
  /** Idle timeout in milliseconds. 0 = never. */
  idleTimeoutMs: number;
  /** When true, the idle timer is suppressed (keep-alive). */
  keepAlive: boolean;
  /** When true, automatically re-inject identity context after compaction. */
  autoReinjectOnCompact: boolean;
}

// ─── HealthIdleManager ───────────────────────────────────────────────────────

export class HealthIdleManager {
  /** Idle timers keyed by session ID — only for non-Telegram sessions */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Warning timers that fire before the kill timer */
  private idleWarningTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Cleanup timers keyed by session ID — cancellable 5-min post-end removal */
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Periodic sweep interval — catches sessions that slipped through per-session timers */
  private cleanupSweepInterval: ReturnType<typeof setInterval> | null = null;
  /** Process liveness check interval handle */
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /** Delay before removing an ended session from in-memory maps (5 minutes) */
  static readonly SESSION_CLEANUP_DELAY_MS = 5 * 60 * 1000;
  /** How often the periodic sweep runs (10 minutes) */
  static readonly CLEANUP_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

  constructor(private readonly bridge: HealthIdleBridge) {}

  // ── Cleanup Sweep ─────────────────────────────────────────────────────────

  /**
   * Every CLEANUP_SWEEP_INTERVAL_MS, sweep all in-memory sessions and remove any
   * that are in a terminal state (ended/error) but have no pending cleanup timer.
   * This catches sessions that transitioned to terminal via paths that didn't call
   * scheduleCleanup, or where the timer fired but removeActiveSession wasn't reached.
   */
  startCleanupSweep(): void {
    this.cleanupSweepInterval = setInterval(() => {
      for (const session of getAllActiveSessions()) {
        const isTerminal = session.state.status === "ended" || session.state.status === "error";
        if (!isTerminal) continue;
        // If no cleanup timer is pending, this session slipped through — remove it now
        if (!this.cleanupTimers.has(session.id)) {
          this.bridge.getRtkPipeline().clearSessionCache(session.id);
          removeActiveSession(session.id);
          log.debug("Sweep: removed stale ended session from memory", { sessionId: session.id });
        }
      }
    }, HealthIdleManager.CLEANUP_SWEEP_INTERVAL_MS);
  }

  /** Schedule removal of an ended session from in-memory maps after the cleanup delay. */
  scheduleCleanup(sessionId: string): void {
    // Cancel any existing timer for this session
    this.cancelCleanupTimer(sessionId);

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(sessionId);
      const s = getActiveSession(sessionId);
      if (s && (s.state.status === "ended" || s.state.status === "error")) {
        this.bridge.getRtkPipeline().clearSessionCache(sessionId);
        removeActiveSession(sessionId);
        log.debug("Removed ended session from memory", { sessionId });
      }
    }, HealthIdleManager.SESSION_CLEANUP_DELAY_MS);

    this.cleanupTimers.set(sessionId, timer);
  }

  /** Cancel a pending cleanup timer (e.g. when a session is resumed before cleanup fires). */
  cancelCleanupTimer(sessionId: string): void {
    const existing = this.cleanupTimers.get(sessionId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.cleanupTimers.delete(sessionId);
    }
  }

  /** Returns true if a cleanup timer is currently pending for the given session. */
  hasCleanupTimer(sessionId: string): boolean {
    return this.cleanupTimers.has(sessionId);
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  /**
   * Every HEALTH_CHECK_INTERVAL_MS, verify all tracked CLI processes are still alive.
   * If a process died without triggering onExit (e.g. OOM kill), handle the exit manually.
   */
  startHealthCheck(getCliProcesses: () => Map<string, CLIProcess>): void {
    this.healthCheckInterval = setInterval(() => {
      for (const [sessionId, launch] of getCliProcesses()) {
        const alive = launch.isAlive?.() ?? true;
        if (!alive) {
          log.warn("Health check: process died silently, cleaning up", { sessionId });
          const session = getActiveSession(sessionId);
          if (session) {
            // Capture stderr before handling exit
            session.lastStderrLines = launch.getStderrLines?.() ?? [];
            this.bridge.handleCLIExit(session, -1);
          } else {
            getCliProcesses().delete(sessionId);
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  // ── Stop All ──────────────────────────────────────────────────────────────

  /** Stop all intervals and cancel all pending timers (call on server shutdown). */
  stopAll(): void {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.cleanupSweepInterval !== null) {
      clearInterval(this.cleanupSweepInterval);
      this.cleanupSweepInterval = null;
    }
    // Cancel all pending cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    // Cancel all pending idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    // Cancel all pending idle warning timers
    for (const timer of this.idleWarningTimers.values()) {
      clearTimeout(timer);
    }
    this.idleWarningTimers.clear();
  }

  // ── Idle Timer ────────────────────────────────────────────────────────────

  startIdleTimer(session: ActiveSession, settings: SessionSettings): void {
    // Only apply to api/web sessions — Telegram has its own idle handling
    if (session.state.source === "telegram") return;

    if (settings.keepAlive) return;
    if (settings.idleTimeoutMs === 0) return;

    this.clearIdleTimer(session.id);

    const timeoutMs = settings.idleTimeoutMs;

    // Warning 5 minutes before kill (only if timeout > 5 min)
    const WARN_BEFORE_MS = 5 * 60 * 1000;
    if (timeoutMs > WARN_BEFORE_MS) {
      const warnTimer = setTimeout(() => {
        this.idleWarningTimers.delete(session.id);
        const current = getActiveSession(session.id);
        if (!current || current.state.status === "ended" || current.state.status === "error")
          return;
        if (current.state.status === "busy" || current.state.status === "compacting") return;

        this.bridge.broadcastToAll(current, {
          type: "idle_warning",
          remainingMs: WARN_BEFORE_MS,
          message: "Session will auto-stop in 5 minutes due to inactivity",
        } as unknown as BrowserIncomingMessage);
      }, timeoutMs - WARN_BEFORE_MS);
      this.idleWarningTimers.set(session.id, warnTimer);
    }

    const timer = setTimeout(() => {
      this.idleTimers.delete(session.id);
      // Only kill if session is still idle (not busy or already ended)
      const current = getActiveSession(session.id);
      if (!current || current.state.status === "ended" || current.state.status === "error") return;
      if (current.state.status === "busy" || current.state.status === "compacting") return;

      log.warn("Session idle timeout, auto-stopping", { sessionId: session.id, timeoutMs });
      this.bridge.killSession(session.id);
    }, timeoutMs);

    this.idleTimers.set(session.id, timer);
  }

  clearIdleTimer(sessionId: string): void {
    const existing = this.idleTimers.get(sessionId);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.idleTimers.delete(sessionId);
    }
    const warn = this.idleWarningTimers.get(sessionId);
    if (warn !== undefined) {
      clearTimeout(warn);
      this.idleWarningTimers.delete(sessionId);
    }
  }

  // ── Lock Status Broadcast ─────────────────────────────────────────────────

  broadcastLockStatus(session: ActiveSession): void {
    const lockInfo = terminalLock.getLockInfo(session.id);
    const msg: BrowserIncomingMessage = {
      type: "lock_status",
      locked: !!lockInfo,
      owner: lockInfo?.owner ?? null,
      queueSize: lockInfo?.queueSize ?? 0,
    } as unknown as BrowserIncomingMessage;
    broadcastToAll(session, msg);
  }
}
